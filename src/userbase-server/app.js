import uuidv4 from 'uuid/v4'
import connection from './connection'
import logger from './logger'
import statusCodes from './statusCodes'
import setup from './setup'
import userController from './user'

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
  const subscription = res.locals.subscription

  if (!subscription || subscription.cancel_at_period_end || subscription.status !== 'active') return res
    .status(statusCodes['Payment Required'])
    .send('Pay subscription fee to create an app.')

  const appName = req.body.appName

  const admin = res.locals.admin
  const adminId = admin['admin-id']

  try {
    const app = await createApp(appName, adminId)
    return res.send(app)
  } catch (e) {
    return res
      .status(e.status)
      .send(e.data)
  }
}

exports.listApps = async function (req, res) {
  const admin = res.locals.admin
  const adminId = admin['admin-id']

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

  try {
    const ddbClient = connection.ddbClient()

    let appsResponse = await ddbClient.query(params).promise()
    let apps = appsResponse.Items

    while (appsResponse.LastEvaluatedKey) {
      params.ExclusiveStartKey = appsResponse.LastEvaluatedKey
      appsResponse = await ddbClient.query(params).promise()
      apps.push(appsResponse.Items)
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

exports.deleteApp = async function (req, res) {
  const subscription = res.locals.subscription

  if (!subscription || subscription.cancel_at_period_end || subscription.status !== 'active') return res
    .status(statusCodes['Payment Required'])
    .send('Pay subscription fee to delete an app.')

  const appName = req.body.appName

  const admin = res.locals.admin
  const adminId = admin['admin-id']

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
  const subscription = res.locals.subscription

  if (!subscription || subscription.cancel_at_period_end || subscription.status !== 'active') return res
    .status(statusCodes['Payment Required'])
    .send('Pay subscription fee to permanently delete an app.')

  const appName = req.body.appName
  const appId = req.body.appId

  const admin = res.locals.admin
  const adminId = admin['admin-id']

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
      users.push(usersResponse.Items)
    }

    return res.status(statusCodes['Success']).send({
      users: users.map(user => userController.buildUserResult(user)),
      appId: app['app-id']
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
  if (!app) {
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

const _getAppQuery = async function (appId, lastEvaluatedKey) {
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

const _buildGetAppResult = function (usersResponse, app) {
  const users = usersResponse.Items

  const result = {
    users: users.map(user => userController.buildUserResult(user)),
    appName: app['app-name'],
    appId: app['app-id'],
    deleted: app['deleted'],
    creationDate: app['creation-date'],
  }

  // convert last evaluated key to a base64 string so it does not confuse developer
  if (usersResponse.LastEvaluatedKey) {
    const lastEvaluatedKeyString = JSON.stringify(usersResponse.LastEvaluatedKey)
    const base64LastEvaluatedKey = Buffer.from(lastEvaluatedKeyString).toString('base64')
    result.nextPageToken = base64LastEvaluatedKey
  }

  return result
}

const _getLastEvaluatedKeyFromNextPageToken = (nextPageToken, appId) => {
  try {
    if (!nextPageToken) return null

    const lastEvaluatedKeyString = Buffer.from(nextPageToken, 'base64').toString('ascii')
    const lastEvaluatedKey = JSON.parse(lastEvaluatedKeyString)

    userController._validateUsernameInput(lastEvaluatedKey.username)
    _validateAppId(lastEvaluatedKey['app-id'])

    if (appId !== lastEvaluatedKey['app-id']) throw 'Token app ID must match authenticated app ID'
    if (Object.keys(lastEvaluatedKey).length !== 2) throw 'Token must only have 2 keys'

    return lastEvaluatedKey
  } catch {
    throw {
      status: statusCodes['Bad Request'],
      error: { message: 'Next page token invalid.' }
    }
  }
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
    const nextPageToken = req.query.nextPageToken

    logChildObject = { ...res.locals.logChildObject, appId, nextPageToken }
    logger.child(logChildObject).info('Getting app')

    _validateAppId(appId)
    const lastEvaluatedKey = _getLastEvaluatedKeyFromNextPageToken(nextPageToken, appId)

    const admin = res.locals.admin
    const adminId = admin['admin-id']

    const app = await getAppByAppId(appId)
    _validateAppResponseToGetApp(app, adminId, logChildObject)

    const usersResponse = await _getAppQuery(app['app-id'], lastEvaluatedKey)

    const result = _buildGetAppResult(usersResponse, app)

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
