import uuidv4 from 'uuid/v4'
import connection from './connection'
import logger from './logger'
import statusCodes from './statusCodes'
import setup from './setup'
import userController from './user'
import adminController from './admin'
import { trimReq, lastEvaluatedKeyToNextPageToken, nextPageTokenToLastEvaluatedKey } from './utils'

const UUID_STRING_LENGTH = 36

const _validateEncryptionMode = (encryptionMode) => {
  if (encryptionMode !== 'end-to-end' && encryptionMode !== 'server-side') throw {
    status: statusCodes['Bad Request'],
    data: "Encryption mode must either be 'end-to-end' or 'server-side'"
  }
}

async function createApp(appName, adminId, encryptionMode = 'end-to-end', appId = uuidv4()) {
  if (!appName || !adminId) throw {
    status: statusCodes['Bad Request'],
    data: 'Missing required items'
  }

  try {
    const trimmedAppName = appName.trim()
    if (!trimmedAppName) throw {
      status: statusCodes['Bad Request'],
      data: 'App name cannot be blank'
    }

    _validateEncryptionMode(encryptionMode)

    const app = {
      'admin-id': adminId,
      'app-name': trimmedAppName,
      'app-id': appId,
      'encryption-mode': encryptionMode,
      'creation-date': new Date().toISOString(),
    }

    const params = {
      TableName: setup.appsTableName,
      Item: app,
      ConditionExpression: 'attribute_not_exists(#adminId)',
      ExpressionAttributeNames: {
        '#adminId': 'admin-id'
      },
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.put(params).promise()
    return app
  } catch (e) {
    if (e.data === 'App name cannot be blank') throw e
    if (e.data === "Encryption mode must either be 'end-to-end' or 'server-side'") throw e
    if (e.name === 'ConditionalCheckFailedException') {
      throw {
        status: statusCodes['Conflict'],
        data: 'App already exists'
      }
    } else {
      logger.error(`Failed to create app ${appName} for admin ${adminId} with ${e}`)
      throw {
        status: statusCodes['Internal Server Error'],
        data: 'Failed to create app'
      }
    }
  }
}
exports.createApp = createApp

exports.createAppController = async function (req, res) {
  const appName = req.body.appName
  const encryptionMode = req.body.encryptionMode

  const admin = res.locals.admin
  const adminId = admin['admin-id']

  if (!adminController.saasSubscriptionActive(admin)) return res
    .status(statusCodes['Payment Required'])
    .send('Pay subscription fee to create an app.')

  try {
    const app = await createApp(appName, adminId, encryptionMode)
    return res.send(app)
  } catch (e) {
    return res
      .status(e.status)
      .send(e.data)
  }
}

const queryForApps = async function (adminId, lastEvaluatedKey) {
  const params = {
    TableName: setup.appsTableName,
    KeyConditionExpression: '#adminId = :adminId',
    ExpressionAttributeNames: {
      '#adminId': 'admin-id'
    },
    ExpressionAttributeValues: {
      ':adminId': adminId
    }
  }

  if (lastEvaluatedKey) params.ExclusiveStartKey = lastEvaluatedKey

  const ddbClient = connection.ddbClient()
  let appsResponse = await ddbClient.query(params).promise()
  return appsResponse
}

exports.listApps = async function (req, res) {
  const admin = res.locals.admin
  const adminId = admin['admin-id']

  try {
    let appsResponse = await queryForApps(adminId)
    let apps = appsResponse.Items

    while (appsResponse.LastEvaluatedKey) {
      appsResponse = await queryForApps(adminId, appsResponse.LastEvaluatedKey)
      apps.push(...appsResponse.Items)
    }

    return res.status(statusCodes['Success']).send(apps)
  } catch (e) {
    logger.error(`Failed to list apps with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to list apps')
  }
}

async function getApp(adminId, appName) {
  const params = {
    TableName: setup.appsTableName,
    Key: {
      'admin-id': adminId,
      'app-name': appName
    }
  }

  const ddbClient = connection.ddbClient()
  const appResponse = await ddbClient.get(params).promise()
  return appResponse.Item
}
exports.getApp = getApp

async function getAppByAppId(appId) {
  const params = {
    TableName: setup.appsTableName,
    IndexName: setup.appIdIndex,
    KeyConditionExpression: '#appId = :appId',
    ExpressionAttributeNames: {
      '#appId': 'app-id'
    },
    ExpressionAttributeValues: {
      ':appId': appId
    },
    Select: 'ALL_ATTRIBUTES'
  }

  const ddbClient = connection.ddbClient()
  const appResponse = await ddbClient.query(params).promise()

  if (!appResponse || appResponse.Items.length === 0) return null

  if (appResponse.Items.length > 1) {
    // too sensitive not to throw here. This should never happen
    const errorMsg = `Too many apps found with app id ${appId}`
    logger.fatal(errorMsg)
    throw new Error(errorMsg)
  }

  return appResponse.Items[0]
}
exports.getAppByAppId = getAppByAppId

async function getDeletedApp(appId) {
  const params = {
    TableName: setup.deletedAppsTableName,
    Key: {
      'app-id': appId
    }
  }

  const ddbClient = connection.ddbClient()
  const appResponse = await ddbClient.get(params).promise()
  return appResponse.Item
}
exports.getDeletedApp = getDeletedApp

exports.deleteApp = async function (req, res) {
  const appName = req.body.appName

  const admin = res.locals.admin
  const adminId = admin['admin-id']

  if (!adminController.saasSubscriptionActive(admin)) return res
    .status(statusCodes['Payment Required'])
    .send('Pay subscription fee to delete an app.')

  if (!appName || !adminId) return res
    .status(statusCodes['Bad Request'])
    .send('Missing required items')

  try {
    const params = {
      TableName: setup.appsTableName,
      Key: {
        'admin-id': adminId,
        'app-name': appName
      },
      UpdateExpression: 'SET deleted = :deleted',
      ConditionExpression: 'attribute_exists(#adminId) and attribute_not_exists(deleted)',
      ExpressionAttributeValues: {
        ':deleted': new Date().toISOString()
      },
      ExpressionAttributeNames: {
        '#adminId': 'admin-id'
      }
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.update(params).promise()

    return res.end()
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      return res.status(statusCodes['Not Found']).send('App not found')
    }

    logger.error(`Failed to delete app ${appName} for admin ${adminId} with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to delete app')
  }
}

const permanentDelete = async (adminId, appName, appId) => {
  const logChildObject = { adminId, appName, appId }
  logger.child(logChildObject).info('Permanent deleting app')

  const existingAppParams = {
    TableName: setup.appsTableName,
    Key: {
      'admin-id': adminId,
      'app-name': appName
    },
    ConditionExpression: 'attribute_exists(deleted) and #appId = :appId',
    ExpressionAttributeNames: {
      '#appId': 'app-id'
    },
    ExpressionAttributeValues: {
      ':appId': appId
    }
  }

  const permanentDeletedAppParams = {
    TableName: setup.deletedAppsTableName,
    Item: {
      'app-id': appId,
      'admin-id': adminId,
      'app-name': appName
    },
    ConditionExpression: 'attribute_not_exists(#appId)',
    ExpressionAttributeNames: {
      '#appId': 'app-id'
    },
  }

  const transactionParams = {
    TransactItems: [
      { Delete: existingAppParams },
      { Put: permanentDeletedAppParams }
    ]
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.transactWrite(transactionParams).promise()

  logger.child(logChildObject).info('Finished permanent deleting app')
}
exports.permanentDelete = permanentDelete

exports.permanentDeleteAppController = async function (req, res) {
  const appName = req.body.appName
  const appId = req.body.appId

  const admin = res.locals.admin
  const adminId = admin['admin-id']

  if (!adminController.saasSubscriptionActive(admin)) return res
    .status(statusCodes['Payment Required'])
    .send('Pay subscription fee to permanently delete an app.')

  if (!appName || !appId || !adminId) return res
    .status(statusCodes['Bad Request'])
    .send('Missing required items')

  try {
    await permanentDelete(adminId, appName, appId)

    return res.end()
  } catch (e) {
    if (e.message.includes('ConditionalCheckFailed]')) {
      return res.status(statusCodes['Conflict']).send('App already permanently deleted')
    }

    logger.error(`Failed to permanently delete app ${appName} for admin ${adminId} with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to permanently delete app')
  }
}

exports.listAppUsers = async function (req, res) {
  const appName = req.body.appName

  const admin = res.locals.admin
  const adminId = admin['admin-id']

  const app = res.locals.app

  try {
    const params = {
      TableName: setup.usersTableName,
      IndexName: setup.appIdIndex,
      KeyConditionExpression: '#appId = :appId',
      ExpressionAttributeNames: {
        '#appId': 'app-id'
      },
      ExpressionAttributeValues: {
        ':appId': app['app-id']
      }
    }

    const ddbClient = connection.ddbClient()

    let usersResponse = await ddbClient.query(params).promise()
    let users = usersResponse.Items

    while (usersResponse.LastEvaluatedKey) {
      params.ExclusiveStartKey = usersResponse.LastEvaluatedKey
      usersResponse = await ddbClient.query(params).promise()
      users.push(...usersResponse.Items)
    }

    return res.status(statusCodes['Success']).send({
      users: users.map(user => userController.buildUserResult(user, app, admin)),
      ..._buildAppResult(app, admin)
    })
  } catch (e) {
    logger.error(`Failed to list app users for app ${appName} and admin ${adminId} with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to list app users')
  }
}

const _validateAppResponseToGetApp = function (app, adminId, logChildObject) {
  // allow return of deleted app
  if (!app || app['deleted']) {
    logChildObject.deletedAppId = app && app['app-id']
    throw {
      status: statusCodes['Not Found'],
      error: { message: 'App not found.' }
    }
  } else {
    logChildObject.appId = app['app-id']
  }

  // make sure admin is creator of app
  if (app['admin-id'] !== adminId) {
    logChildObject.incorrectAdminId = app['admin-id']
    throw {
      status: statusCodes['Forbidden'],
      error: { message: 'App not found.' }
    }
  }
}

exports._validateAppResponseToGetApp = _validateAppResponseToGetApp

const _getUsersQuery = async function (appId, lastEvaluatedKey) {
  const params = {
    TableName: setup.usersTableName,
    IndexName: setup.appIdIndex,
    KeyConditionExpression: '#appId = :appId',
    ExpressionAttributeNames: {
      '#appId': 'app-id'
    },
    ExpressionAttributeValues: {
      ':appId': appId
    }
  }

  if (lastEvaluatedKey) params.ExclusiveStartKey = lastEvaluatedKey

  const ddbClient = connection.ddbClient()
  const usersResponse = await ddbClient.query(params).promise()
  return usersResponse
}

const _buildAppResult = (app, admin) => {
  const stripeData = admin['stripe-account-id']
    ? {
      paymentsMode: app['payments-mode'] || 'test',
      paymentRequired: app['payment-required'] || false,
      enableAutomaticTax: app['enable-automatic-tax'] || false,
      trialPeriodDays: app['trial-period-days'],

      // legacy plans stored on app
      testSubscriptionPlanId: app['test-subscription-plan-id'],
      prodSubscriptionPlanId: app['prod-subscription-plan-id'],
    }
    : {
      paymentsMode: 'disabled'
    }

  return {
    appName: app['app-name'],
    appId: app['app-id'],
    deleted: app['deleted'],
    creationDate: app['creation-date'],
    encryptionMode: app['encryption-mode'] || 'end-to-end',
    ...stripeData
  }
}

const _buildUsersList = (usersResponse, app, admin) => {
  const result = {
    users: usersResponse.Items.map(user => userController.buildUserResult(user, app, admin)),
  }

  if (usersResponse.LastEvaluatedKey) {
    result.nextPageToken = lastEvaluatedKeyToNextPageToken(usersResponse.LastEvaluatedKey)
  }

  return result
}

const _buildAppsList = (appsResponse, admin) => {
  const result = {
    apps: appsResponse.Items.map(app => _buildAppResult(app, admin))
  }

  if (appsResponse.LastEvaluatedKey) {
    result.nextPageToken = lastEvaluatedKeyToNextPageToken(appsResponse.LastEvaluatedKey)
  }

  return result
}

const _validateListUsersLastEvaluatedKey = (lastEvaluatedKey, appId) => {
  userController._validateUsernameInput(lastEvaluatedKey.username)
  _validateAppId(lastEvaluatedKey['app-id'])

  if (appId !== lastEvaluatedKey['app-id']) throw 'Token app ID must match authenticated app ID'
  if (Object.keys(lastEvaluatedKey).length !== 2) throw 'Token must only have 2 keys'
}

const _validateListAppsLastEvaluatedKey = (lastEvaluatedKey, adminId) => {
  if (adminId !== lastEvaluatedKey['admin-id']) throw 'Token admin ID must match authenticated admin ID'
  if (!lastEvaluatedKey['app-name']) throw 'Token missing app name'
  if (Object.keys(lastEvaluatedKey).length !== 2) throw 'Token must only have 2 keys'
}

const _validateAppId = (appId) => {
  if (!appId) throw { status: statusCodes['Bad Request'], error: { message: 'App ID missing.' } }
  if (typeof appId !== 'string') throw { status: statusCodes['Bad Request'], error: { message: 'App ID must be a string.' } }

  // can be less than UUID length because of test app + default admin app
  if (appId.length > UUID_STRING_LENGTH) throw { status: statusCodes['Bad Request'], error: { message: 'App ID is incorrect length.' } }
}

exports.getAppController = async function (req, res) {
  let logChildObject
  try {
    const appId = req.params.appId

    logChildObject = { ...res.locals.logChildObject, appId }
    logger.child(logChildObject).info('Getting app')

    _validateAppId(appId)

    const admin = res.locals.admin
    const adminId = admin['admin-id']

    const app = await getAppByAppId(appId)
    _validateAppResponseToGetApp(app, adminId, logChildObject)

    const result = _buildAppResult(app, admin)

    logChildObject.statusCode = statusCodes['Success']
    logger.child(logChildObject).info('Successfully got app')

    return res.status(statusCodes['Success']).send(result)
  } catch (e) {
    const message = 'Failed to get app for admin.'

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).info(message)
      return res.status(e.status).send(e.error)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e, }).error(message)
      return res.status(statusCode).send({ message })
    }
  }
}

exports.listUsersWithPagination = async function (req, res) {
  let logChildObject
  try {
    const appId = req.params.appId
    const nextPageToken = req.query.nextPageToken

    logChildObject = { ...res.locals.logChildObject, appId, nextPageToken }
    logger.child(logChildObject).info('Listing users from Admin API')

    _validateAppId(appId)
    const lastEvaluatedKey = nextPageTokenToLastEvaluatedKey(
      nextPageToken,
      (lastEvaluatedKey) => _validateListUsersLastEvaluatedKey(lastEvaluatedKey, appId)
    )

    const admin = res.locals.admin
    const adminId = admin['admin-id']

    const app = await getAppByAppId(appId)
    _validateAppResponseToGetApp(app, adminId, logChildObject)

    const usersResponse = await _getUsersQuery(app['app-id'], lastEvaluatedKey)

    const result = _buildUsersList(usersResponse, app, admin)

    logChildObject.statusCode = statusCodes['Success']
    logger.child(logChildObject).info('Successfully listed users from Admin API')

    return res.status(statusCodes['Success']).send(result)
  } catch (e) {
    const message = 'Failed to list users.'

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).info(message)
      return res.status(e.status).send(e.error)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e, }).error(message)
      return res.status(statusCode).send({ message })
    }
  }
}

exports.listAppsWithPagination = async function (req, res) {
  let logChildObject
  try {
    const nextPageToken = req.query.nextPageToken

    logChildObject = { ...res.locals.logChildObject, nextPageToken }
    logger.child(logChildObject).info('Listing apps from Admin API')

    const admin = res.locals.admin
    const adminId = admin['admin-id']

    const lastEvaluatedKey = nextPageTokenToLastEvaluatedKey(
      nextPageToken,
      (lastEvaluatedKey) => _validateListAppsLastEvaluatedKey(lastEvaluatedKey, adminId)
    )

    const appsResponse = await queryForApps(adminId, lastEvaluatedKey)

    const result = _buildAppsList(appsResponse, admin)

    logChildObject.statusCode = statusCodes['Success']
    logger.child(logChildObject).info('Successfully listed apps from Admin API')

    return res.status(statusCodes['Success']).send(result)
  } catch (e) {
    const message = 'Failed to list apps.'

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).info(message)
      return res.status(e.status).send(e.error)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e, }).error(message)
      return res.status(statusCode).send({ message })
    }
  }
}

exports.countNonDeletedAppUsers = async function (appId, limit) {
  const params = {
    TableName: setup.usersTableName,
    IndexName: setup.appIdIndex,
    KeyConditionExpression: '#appId = :appId',
    FilterExpression: 'attribute_not_exists(deleted) and attribute_not_exists(#seedNotSavedYet)',
    ExpressionAttributeNames: {
      '#appId': 'app-id',
      '#seedNotSavedYet': 'seed-not-saved-yet'
    },
    ExpressionAttributeValues: {
      ':appId': appId
    },
    Select: 'COUNT'
  }

  if (limit) params.Limit = limit

  const ddbClient = connection.ddbClient()

  let usersResponse = await ddbClient.query(params).promise()
  let count = usersResponse.Count

  // limit stops query as soon as limit number of items are read, not necessarily items that fit filter expression.
  // must continue executing query until limit is reached or read all items in table
  while ((!limit || count < limit) && usersResponse.LastEvaluatedKey) {
    params.ExclusiveStartKey = usersResponse.LastEvaluatedKey
    usersResponse = await ddbClient.query(params).promise()
    count = limit
      ? Math.min(limit, count + usersResponse.Count)
      : count + usersResponse.Count
  }

  return count
}

const _setTrialPeriodInDdb = async function (adminId, appName, appId, trialPeriodDays) {
  const params = {
    TableName: setup.appsTableName,
    Key: {
      'admin-id': adminId,
      'app-name': appName
    },
    UpdateExpression: 'SET #trialPeriodDays = :trialPeriodDays',
    ConditionExpression: '#appId = :appId and attribute_not_exists(deleted)',
    ExpressionAttributeValues: {
      ':appId': appId,
      ':trialPeriodDays': trialPeriodDays
    },
    ExpressionAttributeNames: {
      '#appId': 'app-id',
      '#trialPeriodDays': 'trial-period-days'
    }
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.update(params).promise()
}

exports.setTrialPeriod = async function (req, res) {
  let logChildObject
  try {
    const trialPeriodDays = Number(req.body.trialPeriodDays)

    const admin = res.locals.admin
    const adminId = admin['admin-id']
    const stripeAccountId = admin['stripe-account-id']
    const appId = req.params.appId
    const appName = req.query.appName

    logChildObject = { adminId, stripeAccountId, appId, trialPeriodDays, req: trimReq(req) }
    logger.child(logChildObject).info('Setting trial period')

    if (!stripeAccountId) throw {
      status: statusCodes['Forbidden'],
      error: { message: 'Stripe account not connected.' }
    }

    if (admin['deleted']) throw {
      status: statusCodes['Not Found'],
      error: { message: 'Admin not found.' }
    }

    if (typeof trialPeriodDays !== 'number' || trialPeriodDays < 1 || trialPeriodDays > 730) throw {
      status: statusCodes['Bad Request'],
      error: { message: 'Trial period must be a number between 1 and 730.' }
    }

    await _setTrialPeriodInDdb(adminId, appName, appId, trialPeriodDays)

    logger
      .child({ ...logChildObject, statusCode: statusCodes['Success'] })
      .info('Successfully set trial period')

    return res.end()
  } catch (e) {
    const message = 'Failed to set trial period'

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).warn(message)
      return res.status(e.status).send(e.error.message)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).error(message)
      return res.status(statusCode).send(message)
    }
  }
}

exports.deleteTrial = async function (req, res) {
  let logChildObject
  try {
    const admin = res.locals.admin
    const adminId = admin['admin-id']
    const stripeAccountId = admin['stripe-account-id']
    const appId = req.params.appId
    const appName = req.query.appName

    logChildObject = { adminId, stripeAccountId, appId, req: trimReq(req) }
    logger.child(logChildObject).info('Removing trial period')

    if (!stripeAccountId) throw {
      status: statusCodes['Forbidden'],
      error: { message: 'Stripe account not connected.' }
    }

    if (admin['deleted']) throw {
      status: statusCodes['Not Found'],
      error: { message: 'Admin not found.' }
    }

    await _setTrialPeriodInDdb(adminId, appName, appId, 0)

    logger
      .child({ ...logChildObject, statusCode: statusCodes['Success'] })
      .info('Successfully removed trial period')

    return res.end()
  } catch (e) {
    const message = 'Failed to remove trial period'

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).warn(message)
      return res.status(e.status).send(e.error.message)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).error(message)
      return res.status(statusCode).send(message)
    }
  }
}

const _setPaymentsModeInDdb = async function (adminId, appName, appId, paymentsMode) {
  const params = {
    TableName: setup.appsTableName,
    Key: {
      'admin-id': adminId,
      'app-name': appName
    },
    UpdateExpression: 'SET #paymentsMode = :paymentsMode',
    ConditionExpression: '#appId = :appId and attribute_not_exists(deleted)',
    ExpressionAttributeValues: {
      ':appId': appId,
      ':paymentsMode': paymentsMode
    },
    ExpressionAttributeNames: {
      '#appId': 'app-id',
      '#paymentsMode': 'payments-mode'
    }
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.update(params).promise()
}

const _setPaymentsMode = async function (req, res, paymentsMode, log1, log2, log3) {
  let logChildObject
  try {
    const admin = res.locals.admin
    const adminId = admin['admin-id']
    const stripeAccountId = admin['stripe-account-id']
    const appId = req.params.appId
    const appName = req.query.appName

    logChildObject = { adminId, stripeAccountId, appId, req: trimReq(req) }
    logger.child(logChildObject).info(log1)

    if (!stripeAccountId) throw {
      status: statusCodes['Forbidden'],
      error: { message: 'Stripe account not connected.' }
    }

    if (admin['deleted']) throw {
      status: statusCodes['Not Found'],
      error: { message: 'Admin not found.' }
    }

    await _setPaymentsModeInDdb(adminId, appName, appId, paymentsMode)

    logger
      .child({ ...logChildObject, statusCode: statusCodes['Success'] })
      .info(log2)

    return res.send(paymentsMode)
  } catch (e) {
    const message = log3

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).warn(message)
      return res.status(e.status).send(e.error.message)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).error(message)
      return res.status(statusCode).send(message)
    }
  }
}

const _setPaymentRequiredInDdb = async function (adminId, appName, appId, paymentRequired) {
  const params = {
    TableName: setup.appsTableName,
    Key: {
      'admin-id': adminId,
      'app-name': appName
    },
    UpdateExpression: 'SET #paymentRequired = :paymentRequired',
    ConditionExpression: '#appId = :appId and attribute_not_exists(deleted)',
    ExpressionAttributeValues: {
      ':appId': appId,
      ':paymentRequired': paymentRequired
    },
    ExpressionAttributeNames: {
      '#appId': 'app-id',
      '#paymentRequired': 'payment-required'
    }
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.update(params).promise()
}

const _setPaymentRequired = async function (req, res, log1, log2, log3) {
  let logChildObject
  try {
    const paymentRequired = req.body.paymentRequired

    const admin = res.locals.admin
    const adminId = admin['admin-id']
    const stripeAccountId = admin['stripe-account-id']
    const appId = req.params.appId
    const appName = req.query.appName

    logChildObject = { adminId, stripeAccountId, appId, paymentRequired, req: trimReq(req) }
    logger.child(logChildObject).info(log1)

    if (!stripeAccountId) throw {
      status: statusCodes['Forbidden'],
      error: { message: 'Stripe account not connected.' }
    }

    if (admin['deleted']) throw {
      status: statusCodes['Not Found'],
      error: { message: 'Admin not found.' }
    }

    if (typeof paymentRequired !== 'boolean') throw {
      status: statusCodes['Bad Request'],
      error: { message: 'Payment required value invalid.' }
    }

    await _setPaymentRequiredInDdb(adminId, appName, appId, paymentRequired)

    logger
      .child({ ...logChildObject, statusCode: statusCodes['Success'] })
      .info(log2)

    return res.end()
  } catch (e) {
    const message = log3

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).warn(message)
      return res.status(e.status).send(e.error.message)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).error(message)
      return res.status(statusCode).send(message)
    }
  }
}

const _setEnableAutomaticTaxInDdb = async function (adminId, appName, appId, enableAutomaticTax) {
  const params = {
    TableName: setup.appsTableName,
    Key: {
      'admin-id': adminId,
      'app-name': appName
    },
    UpdateExpression: 'SET #enableAutomaticTax = :enableAutomaticTax',
    ConditionExpression: '#appId = :appId and attribute_not_exists(deleted)',
    ExpressionAttributeValues: {
      ':appId': appId,
      ':enableAutomaticTax': enableAutomaticTax
    },
    ExpressionAttributeNames: {
      '#appId': 'app-id',
      '#enableAutomaticTax': 'enable-automatic-tax'
    }
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.update(params).promise()
}

const _setEnableAutomaticTax = async (req, res, log1, log2, log3) => {
  let logChildObject
  try {
    const enableAutomaticTax = req.body.enableAutomaticTax

    const admin = res.locals.admin
    const adminId = admin['admin-id']
    const stripeAccountId = admin['stripe-account-id']
    const appId = req.params.appId
    const appName = req.query.appName

    logChildObject = { adminId, stripeAccountId, appId, enableAutomaticTax, req: trimReq(req) }
    logger.child(logChildObject).info(log1)

    if (!stripeAccountId) throw {
      status: statusCodes['Forbidden'],
      error: { message: 'Stripe account not connected.' }
    }

    if (admin['deleted']) throw {
      status: statusCodes['Not Found'],
      error: { message: 'Admin not found.' }
    }

    if (typeof enableAutomaticTax !== 'boolean') throw {
      status: statusCodes['Bad Request'],
      error: { message: 'Enable automatic tax value invalid.' }
    }

    await _setEnableAutomaticTaxInDdb(adminId, appName, appId, enableAutomaticTax)

    logger
      .child({ ...logChildObject, statusCode: statusCodes['Success'] })
      .info(log2)

    return res.end()
  } catch (e) {
    const message = log3

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).warn(message)
      return res.status(e.status).send(e.error.message)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).error(message)
      return res.status(statusCode).send(message)
    }
  }
}

exports.enableTestPayments = function (req, res) {
  const paymentsMode = 'test'
  const log1 = 'Enabling test payments'
  const log2 = 'Successfully enabled test payments'
  const log3 = 'Failed to enable test payments'
  return _setPaymentsMode(req, res, paymentsMode, log1, log2, log3)
}

exports.enableProdPayments = function (req, res) {
  const paymentsMode = 'prod'
  const log1 = 'Enabling prod payments'
  const log2 = 'Successfully enabled prod payments'
  const log3 = 'Failed to enable prod payments'
  return _setPaymentsMode(req, res, paymentsMode, log1, log2, log3)
}

exports.setPaymentRequired = function (req, res) {
  const log1 = 'Setting payment required'
  const log2 = 'Successfully set payment required'
  const log3 = 'Failed to set payment required'
  return _setPaymentRequired(req, res, log1, log2, log3)
}

exports.setEnableAutomaticTax = function (req, res) {
  const log1 = 'Setting enable automatic tax'
  const log2 = 'Successfully set enable automatic tax'
  const log3 = 'Failed to set enable automatic tax '
  return _setEnableAutomaticTax(req, res, log1, log2, log3)
}

exports.modifyEncryptionMode = async function (req, res) {
  let logChildObject
  try {
    const admin = res.locals.admin
    const adminId = admin['admin-id']
    const appId = req.params.appId
    const appName = req.query.appName
    const encryptionMode = req.query.encryptionMode

    logChildObject = { adminId, appId, req: trimReq(req) }
    logger.child(logChildObject).info('Modifying encryption mode')

    if (admin['deleted']) throw {
      status: statusCodes['Not Found'],
      error: { message: 'Admin not found.' }
    }

    _validateEncryptionMode(encryptionMode)

    const params = {
      TableName: setup.appsTableName,
      Key: {
        'admin-id': adminId,
        'app-name': appName
      },
      UpdateExpression: 'SET #encryptionMode = :encryptionMode',
      ConditionExpression: '#appId = :appId and attribute_not_exists(deleted)',
      ExpressionAttributeValues: {
        ':appId': appId,
        ':encryptionMode': encryptionMode
      },
      ExpressionAttributeNames: {
        '#appId': 'app-id',
        '#encryptionMode': 'encryption-mode'
      }
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.update(params).promise()

    logger
      .child({ ...logChildObject, statusCode: statusCodes['Success'] })
      .info('Successfully modified encryption mode')

    return res.end()
  } catch (e) {
    const message = 'Failed to modify encryption mode'

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).warn(message)
      return res.status(e.status).send(e.error.message)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).error(message)
      return res.status(statusCode).send(message)
    }
  }
}

exports.addDomainToWhitelist = async function (req, res) {
  const appId = req.params.appId

  const admin = res.locals.admin
  const adminId = admin['admin-id']

  let logChildObject
  try {
    logChildObject = { appId, adminId, req: trimReq(req) }
    logger.child(logChildObject).info('Adding domain to whitelist')

    const trimmedDomain = req.body.domain.trim()
    if (!trimmedDomain) throw {
      status: statusCodes['Bad Request'],
      data: 'Missing domain'
    }
    const domain = trimmedDomain.toLowerCase()

    if (!domain.includes('://')) throw {
      status: statusCodes['Bad Request'],
      data: 'Missing protocol (e.g. "https://")'
    }

    const Item = {
      'app-id': appId,
      domain,
      'creation-date': new Date().toISOString(),
    }

    const params = {
      TableName: setup.domainWhitelistTableName,
      Item,
      ConditionExpression: 'attribute_not_exists(#appId)',
      ExpressionAttributeNames: {
        '#appId': 'app-id'
      },
    }

    try {
      const ddbClient = connection.ddbClient()
      await ddbClient.put(params).promise()
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') throw {
        status: statusCodes['Conflict'],
        data: 'Domain already added to whitelist'
      }
      throw e
    }

    logger.child(logChildObject).info('Successfully added domain to whitelist')
    return res.send(domain)
  } catch (e) {
    const failureMessage = 'Failed to add domain to whitelist'
    const statusCode = e.status || statusCodes['Internal Server Error']
    const message = e.data || (e.error && e.error.message) || failureMessage

    logger.child({ ...logChildObject, statusCode, err: e }).info(failureMessage)
    return res.status(statusCode).send(message)
  }
}

exports.getDomainWhitelist = async function (req, res) {
  let logChildObject
  try {
    const admin = res.locals.admin
    const adminId = admin['admin-id']

    const app = res.locals.app
    const appId = app['app-id']

    logChildObject = { adminId, appId, req: trimReq(req) }
    logger.child(logChildObject).info('Retrieving domain whitelist')

    const params = {
      TableName: setup.domainWhitelistTableName,
      KeyConditionExpression: '#appId = :appId',
      ExpressionAttributeValues: {
        ':appId': appId,
      },
      ExpressionAttributeNames: {
        '#appId': 'app-id',
      }
    }

    const ddbClient = connection.ddbClient()
    let domainWhitelistResponse = await ddbClient.query(params).promise()
    let domains = domainWhitelistResponse.Items

    while (domainWhitelistResponse.LastEvaluatedKey) {
      params.ExclusiveStartKey = domainWhitelistResponse.LastEvaluatedKey
      domainWhitelistResponse = await ddbClient.query(params).promise()
      domains.push(...domainWhitelistResponse.Items)
    }

    logger.child(logChildObject).info('Successfully retrieved domain whitelist')
    return res.send({ appId, domains })
  } catch (e) {
    const failureMessage = 'Failed to get domain whitelist'
    const statusCode = e.status || statusCodes['Internal Server Error']
    const message = e.data || failureMessage

    logger.child({ ...logChildObject, statusCode, err: e }).info(failureMessage)
    return res.status(statusCode).send(message)
  }
}

exports.deleteDomainFromWhitelist = async function (req, res) {
  const appId = req.params.appId
  const domain = req.body.domain

  const admin = res.locals.admin
  const adminId = admin['admin-id']

  let logChildObject
  try {
    logChildObject = { appId, adminId, req: trimReq(req) }
    logger.child(logChildObject).info('Deleting domain from whitelist')

    const params = {
      TableName: setup.domainWhitelistTableName,
      Key: {
        'app-id': appId,
        domain: domain.toLowerCase()
      }
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.delete(params).promise()

    logger.child(logChildObject).info('Successfully deleted domain from whitelist')
    return res.end()
  } catch (e) {
    const failureMessage = 'Failed to delete domain from whitelist'
    const statusCode = e.status || statusCodes['Internal Server Error']
    const message = e.data || failureMessage

    logger.child({ ...logChildObject, statusCode, err: e }).info(failureMessage)
    return res.status(statusCode).send(message)
  }
}

const _usingDomainWhitelist = async function (appId) {
  const params = {
    TableName: setup.domainWhitelistTableName,
    Limit: '1',
    KeyConditionExpression: '#appId = :appId',
    ExpressionAttributeValues: {
      ':appId': appId,
    },
    ExpressionAttributeNames: {
      '#appId': 'app-id',
    }
  }

  const ddbClient = connection.ddbClient()
  const domainWhitelistResponse = await ddbClient.query(params).promise()
  return domainWhitelistResponse.Items.length > 0
}

exports.validateOrigin = async function (appId, origin) {
  // some browsers don't include origin header, or serialize to "null". those users are automatically validated
  // see: https://stackoverflow.com/questions/42239643/when-do-browsers-send-the-origin-header-when-do-browsers-set-the-origin-to-null
  if (!origin || origin === 'null') return

  const params = {
    TableName: setup.domainWhitelistTableName,
    Key: {
      'app-id': appId,
      'domain': origin
    }
  }

  const ddbClient = connection.ddbClient()
  const [domainResponse, usingDomainWhitelist] = await Promise.all([
    ddbClient.get(params).promise(),
    _usingDomainWhitelist(appId)
  ])

  // if using domain whitelist and domain is not in the list, domain not whitelisted
  if (usingDomainWhitelist && !domainResponse.Item) throw {
    status: statusCodes['Forbidden'],
    error: {
      message: 'Domain not whitelisted'
    }
  }
}
