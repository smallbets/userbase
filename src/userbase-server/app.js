import uuidv4 from 'uuid/v4'
import connection from './connection'
import logger from './logger'
import statusCodes from './statusCodes'
import setup from './setup'
import userController from './user'
import stripe from './stripe'
import adminController from './admin'
import dbController from './db'
import { trimReq, lastEvaluatedKeyToNextPageToken, nextPageTokenToLastEvaluatedKey } from './utils'

const UUID_STRING_LENGTH = 36

async function createApp(appName, adminId, appId = uuidv4()) {
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

    const app = {
      'admin-id': adminId,
      'app-name': trimmedAppName,
      'app-id': appId,
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

  const admin = res.locals.admin
  const adminId = admin['admin-id']

  if (adminController.saasSubscriptionNotActive(admin)) return res
    .status(statusCodes['Payment Required'])
    .send('Pay subscription fee to create an app.')

  try {
    const app = await createApp(appName, adminId)
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

  if (adminController.saasSubscriptionNotActive(admin)) return res
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

  if (adminController.saasSubscriptionNotActive(admin)) return res
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

  try {
    const app = await getApp(adminId, appName)
    if (!app || app['deleted']) return res.status(statusCodes['Not Found']).send('App not found')

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
      users: users.map(user => userController.buildUserResult(user, app)),
      ..._buildAppResult(app)
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

const _getUsersForDbQuery = async function (databaseId, lastEvaluatedKey) {
  const params = {
    TableName: setup.userDatabaseTableName,
    IndexName: setup.userDatabaseIdIndex,
    KeyConditionExpression: '#dbId = :dbId',
    ExpressionAttributeNames: {
      '#dbId': 'database-id',
    },
    ExpressionAttributeValues: {
      ':dbId': databaseId,
    },
  }

  if (lastEvaluatedKey) params.ExclusiveStartKey = lastEvaluatedKey

  const ddbClient = connection.ddbClient()
  const usersResponse = await ddbClient.query(params).promise()
  return usersResponse
}

const _buildAppResult = (app) => {
  return {
    appName: app['app-name'],
    appId: app['app-id'],
    deleted: app['deleted'],
    creationDate: app['creation-date'],
    paymentsMode: app['payments-mode'] || 'disabled',
    testSubscriptionPlanId: app['test-subscription-plan-id'],
    testTrialPeriodDays: app['test-trial-period-days'],
    prodSubscriptionPlanId: app['prod-subscription-plan-id'],
    prodTrialPeriodDays: app['prod-trial-period-days'],
  }
}

const _buildUsersList = (usersResponse, app) => {
  const result = {
    users: usersResponse.Items.map(user => userController.buildUserResult(user, app)),
  }

  if (usersResponse.LastEvaluatedKey) {
    result.nextPageToken = lastEvaluatedKeyToNextPageToken(usersResponse.LastEvaluatedKey)
  }

  return result
}

const _buildUsersForDbList = (usersResponse, ownerId) => {
  const result = {
    users: usersResponse.Items.map(user => {
      const isOwner = user['user-id'] === ownerId
      return {
        userId: user['user-id'],
        isOwner,
        readOnly: isOwner ? false : user['read-only'],
        resharingAllowed: isOwner ? true : user['resharing-allowed'],
      }
    }),
  }

  if (usersResponse.LastEvaluatedKey) {
    result.nextPageToken = lastEvaluatedKeyToNextPageToken(usersResponse.LastEvaluatedKey)
  }

  return result
}

const _buildAppsList = (appsResponse) => {
  const result = {
    apps: appsResponse.Items.map(app => _buildAppResult(app))
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

const _validateListUsersForDatabaseLastEvaluatedKey = (lastEvaluatedKey, databaseId) => {
  userController._validateUserId(lastEvaluatedKey['user-id'])
  _validateDatabaseId(lastEvaluatedKey['database-id'])

  if (databaseId !== lastEvaluatedKey['database-id']) throw 'Token database ID must match authenticated app ID'
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

const _validateDatabaseId = (databaseId) => {
  if (!databaseId) throw { status: statusCodes['Bad Request'], error: { message: 'Database ID missing.' } }
  if (typeof databaseId !== 'string') throw { status: statusCodes['Bad Request'], error: { message: 'Database ID must be a string.' } }

  // can be less than UUID length because of test app + default admin app
  if (databaseId.length > UUID_STRING_LENGTH) throw { status: statusCodes['Bad Request'], error: { message: 'Database ID is incorrect length.' } }
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

    const result = _buildAppResult(app)

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

    const result = _buildUsersList(usersResponse, app)

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

exports.listUsersForDatabaseWithPagination = async function (req, res) {
  let logChildObject
  try {
    const databaseId = req.params.databaseId
    const nextPageToken = req.query.nextPageToken

    logChildObject = { ...res.locals.logChildObject, databaseId, nextPageToken }
    logger.child(logChildObject).info('Listing users from Admin API')

    _validateDatabaseId(databaseId)

    // get database stuff
    const db = await dbController.findDatabaseByDatabaseId(databaseId)
    if (!db) throw {
      status: statusCodes['Not Found'],
      error: { message: 'Database not found.' }
    }
    const ownerId = db['owner-id']

    // get user stuff from db owner
    const owner = await userController.getUserByUserId(ownerId)
    if (!owner || owner.deleted) throw {
      status: statusCodes['Not Found'],
      error: { message: 'Database not found.' }
    }
    const appId = owner['app-id']

    const lastEvaluatedKey = nextPageTokenToLastEvaluatedKey(
      nextPageToken,
      (lastEvaluatedKey) => _validateListUsersForDatabaseLastEvaluatedKey(lastEvaluatedKey, databaseId)
    )

    const admin = res.locals.admin
    const adminId = admin['admin-id']

    const [app, usersResponse] = await Promise.all([
      getAppByAppId(appId),
      _getUsersForDbQuery(db['database-id'], lastEvaluatedKey),
    ])

    try {
      _validateAppResponseToGetApp(app, adminId, logChildObject)
    } catch (err) {
      if (err.error && err.error.message === 'App not found.') {
        throw {
          status: statusCodes['Not Found'],
          error: { message: 'Database not found.' }
        }
      }
      throw err
    }

    const result = _buildUsersForDbList(usersResponse, ownerId)

    logChildObject.statusCode = statusCodes['Success']
    logger.child(logChildObject).info("Successfully listed one database's users from Admin API")

    return res.status(statusCodes['Success']).send(result)
  } catch (e) {
    const message = 'Failed to list users for one database.'

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

    const result = _buildAppsList(appsResponse)

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

exports.updateTrialPeriodDaysInDdb = async (logChildObject, subscriptionPlanId, trialPeriodDays, isProduction, stripeEventTimestamp) => {
  // iterate over all apps with this subscription plan id set and update their trial periods
  const paymentsMode = isProduction ? 'prod' : 'test'
  const params = {
    TableName: setup.appsTableName,
    IndexName: paymentsMode + setup.subscriptionPlanIndex,
    KeyConditionExpression: '#subscriptionPlanId = :subscriptionPlanId',
    ExpressionAttributeValues: {
      ':subscriptionPlanId': subscriptionPlanId,
    },
    ExpressionAttributeNames: {
      '#subscriptionPlanId': paymentsMode + '-subscription-plan-id',
    },
    Select: 'ALL_ATTRIBUTES'
  }

  const ddbClient = connection.ddbClient()
  let appsResponse = await ddbClient.query(params).promise()

  if (!appsResponse || appsResponse.Items.length === 0) {
    logger.child(logChildObject).warn('No apps found in DDB')
    return
  }

  const updatePlanInDdb = async (app) => {
    const adminId = app['admin-id']
    const appId = app['app-id']
    try {
      logger.child({ ...logChildObject, adminId, appId }).info('Updating trial period')

      await _updatePlanInDdb(paymentsMode, adminId, app['app-name'], appId, subscriptionPlanId, trialPeriodDays, stripeEventTimestamp)

      logger.child({ ...logChildObject, adminId, appId }).info('Succesfully updated trial period')
    } catch (e) {
      logger.child({ ...logChildObject, adminId, appId, err: e }).warn('Issue updating trial period')
    }
  }

  await Promise.all(appsResponse.Items.map(app => updatePlanInDdb(app)))

  while (appsResponse.LastEvaluatedKey) {
    params.ExclusiveStartKey = appsResponse.LastEvaluatedKey
    appsResponse = await ddbClient.query(params).promise()
    await Promise.all(appsResponse && appsResponse.Items.map(app => updatePlanInDdb(app)))
  }
}

const _updatePlanInDdb = async function (paymentsMode, adminId, appName, appId, subscriptionPlanId, trialPeriodDays, stripeEventTimestamp) {
  const params = {
    TableName: setup.appsTableName,
    Key: {
      'admin-id': adminId,
      'app-name': appName
    },
    UpdateExpression: 'SET #trialPeriodDays = :trialPeriodDays',
    ConditionExpression: `
      #appId = :appId and
      #subscriptionPlanId = :subscriptionPlanId and
      (attribute_not_exists(#stripeEventTimestamp) or #stripeEventTimestamp < :stripeEventTimestamp)
    `,
    ExpressionAttributeValues: {
      ':appId': appId,
      ':subscriptionPlanId': subscriptionPlanId,
      ':trialPeriodDays': trialPeriodDays === null ? 0 : trialPeriodDays,
      ':stripeEventTimestamp': stripeEventTimestamp
    },
    ExpressionAttributeNames: {
      '#appId': 'app-id',
      '#subscriptionPlanId': paymentsMode + '-subscription-plan-id',
      '#trialPeriodDays': paymentsMode + '-trial-period-days',
      '#stripeEventTimestamp': paymentsMode + '-stripe-event-timestamp'
    }
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.update(params).promise()
}

const _setPlanInDdb = async function (paymentsMode, adminId, appName, appId, subscriptionPlanId, trialPeriodDays) {
  const params = {
    TableName: setup.appsTableName,
    Key: {
      'admin-id': adminId,
      'app-name': appName
    },
    UpdateExpression: 'SET #subscriptionPlanId = :subscriptionPlanId, #trialPeriodDays = :trialPeriodDays',
    ConditionExpression: '#appId = :appId and attribute_not_exists(deleted)',
    ExpressionAttributeValues: {
      ':appId': appId,
      ':subscriptionPlanId': subscriptionPlanId,
      ':trialPeriodDays': trialPeriodDays === null ? 0 : trialPeriodDays
    },
    ExpressionAttributeNames: {
      '#appId': 'app-id',
      '#subscriptionPlanId': paymentsMode + '-subscription-plan-id',
      '#trialPeriodDays': paymentsMode + '-trial-period-days'
    }
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.update(params).promise()
}

const _setSubscriptionPlan = async function (req, res, paymentsMode) {
  let logChildObject
  try {
    const admin = res.locals.admin
    const adminId = admin['admin-id']
    const stripeAccount = admin['stripe-account-id']
    const appId = req.params.appId
    const subscriptionPlanId = req.params.subscriptionPlanId
    const appName = req.query.appName

    logChildObject = { adminId, stripeAccountId: stripeAccount, appId, subscriptionPlanId, paymentsMode, req: trimReq(req) }
    logger.child(logChildObject).info('Setting subscription plan')

    if (!stripeAccount) throw {
      status: statusCodes['Forbidden'],
      error: { message: 'Stripe account not connected.' }
    }

    if (admin['deleted']) throw {
      status: statusCodes['Not Found'],
      error: { message: 'Admin not found.' }
    }

    try {
      // make sure subscription plan exists in Stripe
      const subscription = await stripe.getClient(paymentsMode === 'test').plans.retrieve(
        subscriptionPlanId,
        { stripeAccount }
      )

      if (paymentsMode === 'prod' && !subscription.livemode) {
        throw {
          status: statusCodes['Forbidden'],
          error: { message: 'Plan must be a production plan.' }
        }
      } else if (paymentsMode === 'test' && subscription.livemode) {
        throw {
          status: statusCodes['Forbidden'],
          error: { message: 'Plan must be a test plan.' }
        }
      }

      await _setPlanInDdb(paymentsMode, adminId, appName, appId, subscriptionPlanId, subscription.trial_period_days)

      logger
        .child({ ...logChildObject, statusCode: statusCodes['Success'] })
        .info('Successfully set subscription plan')

      return res.send('success!')
    } catch (e) {
      if (e.message && e.message.includes('No such plan')) {
        throw {
          status: statusCodes['Not Found'],
          error: { message: 'Plan not found.' }
        }
      }
      throw e
    }

  } catch (e) {
    const message = 'Failed to set subscription plan'

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

exports.setTestSubscriptionPlan = async function (req, res) {
  const paymentsMode = 'test'
  return _setSubscriptionPlan(req, res, paymentsMode)
}

exports.setProdSubscriptionPlan = async function (req, res) {
  const paymentsMode = 'prod'
  return _setSubscriptionPlan(req, res, paymentsMode)
}

const _deleteSubscriptionPlanInDdb = async function (paymentsMode, adminId, appName, appId) {
  const params = {
    TableName: setup.appsTableName,
    Key: {
      'admin-id': adminId,
      'app-name': appName
    },
    UpdateExpression: 'REMOVE #subscriptionPlanId',
    ConditionExpression: '#appId = :appId and attribute_not_exists(deleted)',
    ExpressionAttributeValues: {
      ':appId': appId,
    },
    ExpressionAttributeNames: {
      '#appId': 'app-id',
      '#subscriptionPlanId': paymentsMode + '-subscription-plan-id',
    }
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.update(params).promise()
}

const _deleteSubscriptionPlan = async function (req, res, paymentsMode) {
  let logChildObject
  try {
    const admin = res.locals.admin
    const adminId = admin['admin-id']
    const stripeAccountId = admin['stripe-account-id']
    const appId = req.params.appId
    const appName = req.query.appName
    const subscriptionPlanId = req.params.subscriptionPlanId

    logChildObject = { adminId, stripeAccountId, appId, subscriptionPlanId, paymentsMode, req: trimReq(req) }
    logger.child(logChildObject).info('Deleting subscription plan')

    if (!stripeAccountId) throw {
      status: statusCodes['Forbidden'],
      error: { message: 'Stripe account not connected.' }
    }

    if (admin['deleted']) throw {
      status: statusCodes['Not Found'],
      error: { message: 'Admin not found.' }
    }

    await _deleteSubscriptionPlanInDdb(paymentsMode, adminId, appName, appId)

    logger
      .child({ ...logChildObject, statusCode: statusCodes['Success'] })
      .info('Successfully deleted subscription plan')

    return res.send('success!')
  } catch (e) {
    const message = 'Failed to delete subscription plan'

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).warn(message)
      return res.status(e.status).send(e.error)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).error(message)
      return res.status(statusCode).send({ message })
    }
  }
}

exports.deleteTestSubscriptionPlan = async function (req, res) {
  const paymentsMode = 'test'
  return _deleteSubscriptionPlan(req, res, paymentsMode)
}

exports.deleteProdSubscriptionPlan = async function (req, res) {
  const paymentsMode = 'prod'
  return _deleteSubscriptionPlan(req, res, paymentsMode)
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

exports.disablePayments = function (req, res) {
  const paymentsMode = 'disabled'
  const log1 = 'Disabling payments'
  const log2 = 'Successfully disabled payments'
  const log3 = 'Failed to disable payments'
  return _setPaymentsMode(req, res, paymentsMode, log1, log2, log3)
}
