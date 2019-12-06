import uuidv4 from 'uuid/v4'
import crypto from './crypto'
import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import logger from './logger'

// source: https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Session_Management_Cheat_Sheet.md#session-id-length
const ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID = 16
const SESSION_COOKIE_NAME = 'adminSessionId'

const oneDaySeconds = 60 * 60 * 24
const oneDayMs = 1000 * oneDaySeconds
const SESSION_LENGTH = oneDayMs

const createSession = async function (adminId) {
  const sessionId = crypto
    .randomBytes(ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID)
    .toString('hex')

  const session = {
    'session-id': sessionId,
    'admin-id': adminId,
    'creation-date': new Date().toISOString()
  }

  const params = {
    TableName: setup.sessionsTableName,
    Item: session
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.put(params).promise()

  return sessionId
}

const setSessionCookie = (res, sessionId) => {
  const cookieResponseHeaders = {
    maxAge: SESSION_LENGTH,
    httpOnly: true,
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production'
  }

  res.cookie(SESSION_COOKIE_NAME, sessionId, cookieResponseHeaders)
}

async function createAdmin(adminName, password, adminId = uuidv4(), storePasswordInSecretsManager = false, fullName) {
  if (!adminName || !password) throw {
    status: statusCodes['Bad Request'],
    data: 'Missing required items'
  }

  try {
    if (storePasswordInSecretsManager) {
      const secrets = await setup.getSecrets()
      await setup.updateSecrets(secrets, 'ADMIN_ACCOUNT_PASSWORD', password)
    }

    const passwordHash = await crypto.bcrypt.hash(password)

    const admin = {
      'admin-name': adminName.toLowerCase(),
      'password-hash': passwordHash,
      'admin-id': adminId,
      'creation-date': new Date().toISOString()
    }

    if (fullName) {
      admin['full-name'] = fullName
    }

    const params = {
      TableName: setup.adminTableName,
      Item: admin,
      ConditionExpression: 'attribute_not_exists(#adminName)',
      ExpressionAttributeNames: {
        '#adminName': 'admin-name'
      },
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.put(params).promise()
    return adminId
  } catch (e) {
    if (e && e.name === 'ConditionalCheckFailedException') {
      throw {
        status: statusCodes['Conflict'],
        data: 'Admin already exists'
      }
    } else {
      logger.error(`Failed to create admin with ${e}`)
      throw {
        status: statusCodes['Internal Server Error'],
        data: 'Failed to create admin'
      }
    }
  }
}
exports.createAdmin = createAdmin

exports.createAdminController = async function (req, res) {
  const adminName = req.body.adminName
  const password = req.body.password
  const fullName = req.body.fullName

  if (!fullName) return res
    .status(statusCodes['Bad Request'])
    .send('Missing full name')

  const adminId = uuidv4()
  try {
    const storePasswordInSecretsManager = false
    await createAdmin(adminName, password, adminId, storePasswordInSecretsManager, fullName)
  } catch (e) {
    return res
      .status(e.status)
      .send(e.data)
  }

  try {
    const sessionId = await createSession(adminId)
    setSessionCookie(res, sessionId)
    return res.end()
  } catch (e) {
    logger.error(`Failed to create session for admin ${adminId} with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to create session!')
  }
}

const findAdminByAdminId = async (adminId) => {
  const params = {
    TableName: setup.adminTableName,
    IndexName: setup.adminIdIndex,
    KeyConditionExpression: '#adminId = :adminId',
    ExpressionAttributeNames: {
      '#adminId': 'admin-id'
    },
    ExpressionAttributeValues: {
      ':adminId': adminId
    },
    Select: 'ALL_ATTRIBUTES'
  }

  const ddbClient = connection.ddbClient()
  const adminResponse = await ddbClient.query(params).promise()

  if (!adminResponse || adminResponse.Items.length === 0) return null

  if (adminResponse.Items.length > 1) {
    logger.warn(`Too many admins found with id ${adminId}`)
  }

  return adminResponse.Items[0]
}

exports.signInAdmin = async function (req, res) {
  const adminName = req.body.adminName
  const password = req.body.password

  if (!adminName || !password) return res
    .status(statusCodes['Bad Request'])
    .send('Missing required items')

  const params = {
    TableName: setup.adminTableName,
    Key: {
      'admin-name': adminName.toLowerCase()
    },
  }

  try {
    const ddbClient = connection.ddbClient()
    const adminResponse = await ddbClient.get(params).promise()

    const admin = adminResponse.Item

    const doesNotExist = !admin
    const incorrectPassword = doesNotExist || !(await crypto.bcrypt.compare(password, admin['password-hash']))

    if (doesNotExist || incorrectPassword) return res
      .status(statusCodes['Unauthorized'])
      .send('Incorrect password')

    const sessionId = await createSession(admin['admin-id'])
    setSessionCookie(res, sessionId)
    return res.end()
  } catch (e) {
    logger.error(`Admin ${adminName} failed to sign in with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to sign in admin!')
  }
}

exports.signOutAdmin = async function (req, res) {
  const sessionId = req.cookies[SESSION_COOKIE_NAME]

  if (!sessionId) return res
    .status(statusCodes['Unauthorized'])
    .send('Missing session id')

  const params = {
    TableName: setup.sessionsTableName,
    Key: {
      'session-id': sessionId
    },
    UpdateExpression: 'set invalidated = :invalidated',
    ExpressionAttributeValues: {
      ':invalidated': true,
    }
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.update(params).promise()

    return res.status(statusCodes['Success']).end()
  } catch (e) {
    logger.error(`Failed to sign out session ${sessionId} with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to sign out!')
  }
}

exports.authenticateAdmin = async function (req, res, next) {
  const sessionId = req.cookies[SESSION_COOKIE_NAME]

  if (!sessionId) return res
    .status(statusCodes['Unauthorized'])
    .send('Missing session token')

  const params = {
    TableName: setup.sessionsTableName,
    Key: {
      'session-id': sessionId
    }
  }

  try {
    const ddbClient = connection.ddbClient()
    const sessionResponse = await ddbClient.get(params).promise()

    const session = sessionResponse.Item

    const doesNotExist = !session
    const invalidated = doesNotExist || session.invalidated
    const expired = invalidated || (new Date() - new Date(session['creation-date']) > SESSION_LENGTH)
    const isNotAdminSession = expired || !session['admin-id']

    if (doesNotExist || invalidated || expired || isNotAdminSession) return res
      .status(statusCodes['Unauthorized']).end()

    const admin = await findAdminByAdminId(session['admin-id'])
    if (!admin) return res
      .status(statusCodes['Not Found'])
      .send('Admin does not exist')

    res.locals.admin = admin // makes admin object available in next route
    next()
  } catch (e) {
    logger.error(`Failed to authenticate admin session ${sessionId} with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to authenticate admin')
  }
}

const createApp = async function (appName, adminId, appId = uuidv4()) {
  if (!appName || !adminId) throw {
    status: statusCodes['Bad Request'],
    data: 'Missing required items'
  }

  const app = {
    'admin-id': adminId,
    'app-name': appName,
    'app-id': appId,
    'creation-date': new Date().toISOString()
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

exports.listAppUsers = async function (req, res) {
  const appName = req.query.appName

  const admin = res.locals.admin
  const adminId = admin['admin-id']

  try {
    const app = await getApp(adminId, appName)
    if (!app) return res.status(statusCodes['Not Found']).send('App not found')

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
