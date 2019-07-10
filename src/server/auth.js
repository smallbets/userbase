import crypto from 'crypto'
import bcrypt from 'bcrypt'
import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import memcache from './memcache'

const SALT_ROUNDS = 10

// source: https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Session_Management_Cheat_Sheet.md#session-id-length
const ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID = 16
const SESSION_COOKIE_NAME = 'sessionId'

const oneDayMs = 1000 * 60 * 60 * 24
const SESSION_LENGTH = oneDayMs

const createSession = async function (userId, res) {
  const sessionId = crypto
    .randomBytes(ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID)
    .toString('hex')

  const session = {
    'session-id': sessionId,
    'user-id': userId,
    'creation-date': new Date().toISOString()
  }

  const params = {
    TableName: setup.sessionsTableName,
    Item: session
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.put(params).promise()

  const cookieResponseHeaders = {
    maxAge: SESSION_LENGTH,
    httpOnly: true,
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production'
  }

  res.cookie(SESSION_COOKIE_NAME, sessionId, cookieResponseHeaders)
}

exports.signUp = async function (req, res) {
  const username = req.body.username
  const password = req.body.password
  const userId = req.body.userId

  if (!username || !password || !userId) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing required items' })

  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    const user = {
      username: username.toLowerCase(),
      'password-hash': passwordHash,
      'user-id': userId
    }

    const params = {
      TableName: setup.usersTableName,
      Item: user,
      ConditionExpression: 'attribute_not_exists(username)'
    }

    try {
      memcache.initUser(user['user-id'])
      const ddbClient = connection.ddbClient()
      await ddbClient.put(params).promise()
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') {
        return res
          .status(statusCodes['Conflict'])
          .send({
            err: `Failed to sign up with error ${e}`,
            readableMessage: 'Username already exists'
          })
      }
      throw e
    }

    await createSession(user['user-id'], res)
    return res.end()
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to sign up with ${e}` })
  }
}

exports.signIn = async function (req, res) {
  const username = req.body.username
  const password = req.body.password

  const params = {
    TableName: setup.usersTableName,
    Key: {
      username: username.toLowerCase()
    },
  }

  try {
    const ddbClient = connection.ddbClient()
    const userResponse = await ddbClient.get(params).promise()

    const user = userResponse.Item
    if (!user) return res
      .status(statusCodes['Not Found'])
      .send({ readableMessage: 'Username not found' })

    const passwordMatch = await bcrypt.compare(password, user['password-hash'])
    if (!passwordMatch) return res
      .status(statusCodes['Unauthorized'])
      .send({ readableMessage: 'Incorrect password' })

    await createSession(user['user-id'], res)
    return res.end()
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to sign up with ${e}` })
  }
}

exports.signOut = async function (req, res) {
  const sessionId = req.cookies.sessionId

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

    res.clearCookie(SESSION_COOKIE_NAME)
    return res.send({ success: true })
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to sign out with ${e}` })
  }
}

exports.authenticateUser = async function (req, res, next) {
  const sessionId = req.cookies.sessionId

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
    if (!session) return res
      .status(statusCodes['Unauthorized'])
      .send({ readableMessage: 'Session does not exist' })

    if (session.invalidated) return res
      .status(statusCodes['Unauthorized'])
      .send({ readableMessage: 'Invalid session' })

    const sessionExpired = new Date() - new Date(session['creation-date']) > SESSION_LENGTH
    if (sessionExpired) return res
      .status(statusCodes['Unauthorized'])
      .send({ readableMessage: 'Session expired' })

    res.locals.userId = session['user-id'] // makes user id available in next route
    next()
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to authenticate user with ${e}` })
  }
}
