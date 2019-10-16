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

async function createAdmin (adminName, password, adminId) {
  if (!adminName || !password || !adminId) throw {
    status: statusCodes['Bad Request'],
    data: { readableMessage: 'Missing required items' }
  }

  try {
    const passwordHash = await crypto.bcrypt.hash(password)

    const admin = {
      'admin-name': adminName.toLowerCase(),
      'password-hash': passwordHash,
      'admin-id': adminId
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
  } catch (e) {
    if (e && e.name === 'ConditionalCheckFailedException') {
      throw {
        status: statusCodes['Conflict'],
        data: {
          err: `Failed to create admin with error ${e}`,
          readableMessage: 'Admin name already exists'
        }
      }
    } else {
      logger.error(`Failed to create admin with ${e}`)
      throw {
        status: statusCodes['Internal Server Error'],
        data: { err: 'Failed to create admin' }
      }
    }
  }
}
exports.createAdmin = createAdmin

exports.createAdminController = async function (req, res) {
  const adminName = req.body.adminName
  const password = req.body.password
  const adminId = req.body.adminId

  try {
    await createAdmin(adminName, password, adminId)
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
      .send({ err: 'Failed to create session!' })
  }
}

const findAdminByAdminId = async (adminId) => {
  const params = {
    TableName: setup.adminTableName,
    IndexName: 'AdminIdIndex',
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
    .send({ readableMessage: 'Missing required items' })

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
      .status(statusCodes['Unauthorized']).end()

    const sessionId = await createSession(admin['admin-id'])
    setSessionCookie(res, sessionId)
    return res.end()
  } catch (e) {
    logger.error(`Admin ${adminName} failed to sign in with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to sign in admin!` })
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
    .send({ readableMessage: 'Missing session token' })

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
      .send({ readableMessage: 'Admin does not exist' })

    res.locals.admin = admin // makes admin object available in next route
    next()
  } catch (e) {
    logger.error(`Failed to authenticate admin session ${sessionId} with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: 'Failed to authenticate admin' })
  }
}

const createApp = async function (appName, appId, adminId) {
  if (!appName || !appId || !adminId) throw {
    status: statusCodes['Bad Request'],
    data: { readableMessage: 'Missing required items' }
  }

  const app = {
    'admin-id': adminId,
    'app-name': appName,
    'app-id': appId
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
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      throw {
        status: statusCodes['Conflict'],
        data: {
          err: `Failed to create app with error ${e}`,
          readableMessage: 'App name already exists'
        }
      }
    } else {
      logger.error(`Failed to create app ${appId} with ${e}`)
      throw {
        status: statusCodes['Internal Server Error'],
        data: { err: 'Failed to create app' }
      }
    }
  }
}
exports.createApp = createApp

exports.createAppController = async function (req, res) {
  const appName = req.body.appName
  const appId = req.body.appId

  const admin = res.locals.admin
  const adminId = admin['admin-id']

  try {
    await createApp(appName, appId, adminId)
    return res.send('Success!')
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
      const appsResponse = await ddbClient.query(params).promise()
      apps.push(appsResponse.Items)
    }

    return res.status(statusCodes['Success']).send(apps)
  } catch (e) {
    logger.error(`Failed to list apps with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: 'Failed to list apps'})
  }
}
