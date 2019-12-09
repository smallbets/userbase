import uuidv4 from 'uuid/v4'
import crypto from './crypto'
import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import logger from './logger'
import appController from './app'
import userController from './user'

// source: https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Session_Management_Cheat_Sheet.md#session-id-length
const ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID = 16
const SESSION_COOKIE_NAME = 'adminSessionId'

const HOURS_IN_A_DAY = 24
const SECONDS_IN_A_DAY = 60 * 60 * HOURS_IN_A_DAY
const MS_IN_A_DAY = 1000 * SECONDS_IN_A_DAY
const SESSION_LENGTH = MS_IN_A_DAY

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
    const errorMsg = `Too many admins found with id ${adminId}`
    logger.fatal(errorMsg)
    throw new Error(errorMsg)
  }

  return adminResponse.Items[0]
}
exports.findAdminByAdminId = findAdminByAdminId

const _validateAdminPassword = async (password, admin) => {
  if (!admin || admin['deleted']) throw new Error('Admin not found')

  const passwordIsCorrect = await crypto.bcrypt.compare(password, admin['password-hash'])

  if (!passwordIsCorrect) {
    const tempPasswordIsCorrect = await crypto.bcrypt.compare(password, admin['temp-password'])

    if (!tempPasswordIsCorrect) {
      throw new Error('Incorrect password or temp password')
    } else {
      if (new Date() - new Date(admin['temp-password-creation-date']) > MS_IN_A_DAY) {
        throw new Error('Temp password expired')
      }
    }
  }
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

    try {
      await _validateAdminPassword(password, admin)
    } catch (e) {
      return res
        .status(statusCodes['Unauthorized'])
        .send('Incorrect password')
    }

    const sessionId = await createSession(admin['admin-id'])
    setSessionCookie(res, sessionId)
    return res.end()
  } catch (e) {
    logger.error(`Admin '${adminName}' failed to sign in with ${e}`)
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
    if (!admin || admin['deleted']) return res
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

exports.deleteUser = async function (req, res) {
  const appName = req.body.appName
  const username = req.body.username
  const userId = req.body.userId

  const adminId = res.locals.admin['admin-id']

  if (!appName || !username) return res
    .status(statusCodes['Bad Request'])
    .send('Missing required items')

  try {
    const app = await appController.getApp(adminId, appName)
    if (!app || app['deleted']) return res.status(statusCodes['Not Found']).send('App not found')

    await userController.deleteUser(username, app['app-id'], userId)

    return res.end()
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      return res.status(statusCodes['Not Found']).send('User not found')
    }

    logger.error(`Failed to delete user '${userId}' from admin '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to delete user')
  }
}

const setTempPassword = async (adminName, tempPassword) => {
  const params = {
    TableName: setup.adminTableName,
    Key: {
      'admin-name': adminName
    },
    UpdateExpression: 'set #tempPassword = :tempPassword, #tempPasswordCreationDate = :tempPasswordCreationDate',
    ConditionExpression: 'attribute_exists(#adminName)',
    ExpressionAttributeNames: {
      '#tempPassword': 'temp-password',
      '#tempPasswordCreationDate': 'temp-password-creation-date',
      '#adminName': 'admin-name'
    },
    ExpressionAttributeValues: {
      ':tempPassword': await crypto.bcrypt.hash(tempPassword),
      ':tempPasswordCreationDate': new Date().toISOString()
    },
    ReturnValues: 'ALL_NEW'
  }

  const ddbClient = connection.ddbClient()

  try {
    const adminResponse = await ddbClient.update(params).promise()
    return adminResponse.Attributes
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      return null
    }
    throw e
  }
}

exports.forgotPassword = async function (req, res) {
  const adminName = req.query.adminName && req.query.adminName.toLowerCase()

  if (!adminName) return res
    .status(statusCodes['Bad Request'])
    .send('Missing admin name')

  try {
    const tempPassword = crypto
      .randomBytes(ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID)
      .toString('base64')

    const admin = await setTempPassword(adminName, tempPassword)
    if (!admin || admin['deleted']) return res.status(statusCodes['Not Found']).send('Admin not found')

    const subject = 'Forgot Password - Userbase'
    const body = `Hello, ${adminName}!`
      + '<br />'
      + '<br />'
      + 'Someone has requested you forgot your password to your Userbase admin account!'
      + '<br />'
      + '<br />'
      + 'If you did not make this request, you can safely ignore this email.'
      + '<br />'
      + '<br />'
      + `Here is your temporary password you can use to log in: ${tempPassword}`
      + '<br />'
      + '<br />'
      + `This password will expire in ${HOURS_IN_A_DAY} hours.`

    await setup.sendEmail(adminName, subject, body)

    return res.end()
  } catch (e) {
    logger.error(`Failed to forget password for admin '${adminName}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to forget password')
  }
}

exports.deleteAdmin = async function (req, res) {
  const admin = res.locals.admin
  const adminName = admin['admin-name']
  const adminId = admin['admin-id']

  try {
    const params = {
      TableName: setup.adminTableName,
      Key: {
        'admin-name': adminName,
      },
      UpdateExpression: 'SET deleted = :deleted',
      ConditionExpression: '#adminId = :adminId and attribute_not_exists(deleted)',
      ExpressionAttributeValues: {
        ':deleted': new Date().toISOString(),
        ':adminId': adminId
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
      return res.status(statusCodes['Not Found']).send('Admin not found')
    }

    logger.error(`Failed to delete admin '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to delete admin')
  }
}
