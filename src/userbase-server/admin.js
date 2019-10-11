import crypto from './crypto'
import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import logger from './logger'

// source: https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Session_Management_Cheat_Sheet.md#session-id-length
const ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID = 16

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

exports.createAdmin = async function (req, res) {
  const adminName = req.body.adminName
  const password = req.body.password
  const adminId = req.body.adminId

  if (!adminName || !password || !adminId) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing required items' })

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

    try {
      const ddbClient = connection.ddbClient()
      await ddbClient.put(params).promise()
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') {
        return res
          .status(statusCodes['Conflict'])
          .send({
            err: `Failed to create admin with error ${e}`,
            readableMessage: 'Admin name already exists'
          })
      }
      throw e
    }

    const sessionId = await createSession(adminId)
    return res.send(sessionId)
  } catch (e) {
    logger.error(`Failed to create admin with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: 'Failed to create admin' })
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

exports.authenticateAdmin = async function (req, res, next) {
  const sessionId = req.query.sessionId

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

exports.createApp = async function (req, res) {
  const appName = req.body.appName
  const appId = req.body.appId

  const admin = res.locals.admin
  const adminId = admin['admin-id']

  if (!appName || !appId) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing required items' })

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

    return res.send('Success!')
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      return res
        .status(statusCodes['Conflict'])
        .send({
          err: `Failed to create app with error ${e}`,
          readableMessage: 'App name already exists'
        })
    }

    logger.error(`Failed to create app ${appId} with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: 'Failed to create app' })
  }
}
