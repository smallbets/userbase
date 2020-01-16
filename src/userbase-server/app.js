import uuidv4 from 'uuid/v4'
import connection from './connection'
import logger from './logger'
import statusCodes from './statusCodes'
import setup from './setup'

async function createApp(appName, adminId, appId = uuidv4()) {
  if (!appName || !adminId) throw {
    status: statusCodes['Bad Request'],
    data: 'Missing required items'
  }

  const app = {
    'admin-id': adminId,
    'app-name': appName,
    'app-id': appId,
    'creation-date': new Date().toISOString(),
    'num-users': 0
  }

  const params = {
    TableName: setup.appsTableName,
    Item: app,
    ConditionExpression: 'attribute_not_exists(#adminId)',
    ExpressionAttributeNames: {
      '#adminId': 'admin-id'
    },
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.put(params).promise()
    return app
  } catch (e) {
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

  const appName = req.query.appName

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

exports.listAppUsers = async function (req, res) {
  const appName = req.query.appName

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

    return res.status(statusCodes['Success']).send(users)
  } catch (e) {
    logger.error(`Failed to list app users for app ${appName} and admin ${adminId} with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to list app users')
  }
}

const updateNumAppUsers = async function (adminId, appName, appId, increment) {
  const incrementNumUsersParams = {
    TableName: setup.appsTableName,
    Key: {
      'admin-id': adminId,
      'app-name': appName
    },
    UpdateExpression: 'add #numUsers :num',
    ConditionExpression: '#appId = :appId',
    ExpressionAttributeNames: {
      '#numUsers': 'num-users',
      '#appId': 'app-id'
    },
    ExpressionAttributeValues: {
      ':num': increment ? 1 : -1,
      ':appId': appId
    }
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.update(incrementNumUsersParams).promise()
  } catch (e) {
    // failure ok -- this is a best effort attempt
    logger.warn(`Failed to increment number of users for app ${appId} with ${e}`)
  }
}

exports.incrementNumAppUsers = async function (adminId, appName, appId) {
  const increment = true
  await updateNumAppUsers(adminId, appName, appId, increment)
}

exports.decrementNumAppUsers = async function (adminId, appName, appId) {
  const increment = false
  await updateNumAppUsers(adminId, appName, appId, increment)
}
