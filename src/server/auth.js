import uuidv4 from 'uuid/v4'
import bcrypt from 'bcrypt'
import connection from './connection'
import setup from './setup'

const SALT_ROUNDS = 10

const createSession = async function (userId, res) {
  const session = {
    'session-id': uuidv4(),
    'user-id': userId,
    'creation-date': new Date().toISOString()
  }

  const params = {
    TableName: setup.sessionsTableName,
    Item: session
  }

  const ddbClient = connection.ddbClient()

  try {
    await ddbClient.put(params).promise()
    const fifteenMinutes = 15 * 60 * 1000
    const cookieResponseHeaders = {
      maxAge: fifteenMinutes,
      httpOnly: true
    }
    res.cookie('sessionId', session['session-id'], cookieResponseHeaders)
  } catch (e) {
    return res.status(e.statusCode).send({ err: `Failed to create session with error ${e}` })
  }
}

exports.signUp = function (req, res) {
  const username = req.body.username
  const password = req.body.password

  bcrypt.hash(password, SALT_ROUNDS, async function (err, passwordHash) {
    if (err) return res.status(404).send({ err: `Failed to hash password with error ${err}` })
    const user = {
      username: username.toLowerCase(),
      'password-hash': passwordHash,
      'user-id': uuidv4(),
    }

    const params = {
      TableName: setup.usersTableName,
      Item: user,
      ConditionExpression: 'attribute_not_exists(username)'
    }

    const ddbClient = connection.ddbClient()
    try {
      await ddbClient.put(params).promise()
      await createSession(user['user-id'], res)
      res.json(params.Item)
    } catch (e) {
      return res.status(e.statusCode).send({ err: `Failed to sign up with error ${e}` })
    }
  })
}

exports.signIn = function (req, res) {
  res.send('Got a Sign In request')
}

exports.signOut = function (req, res) {
  res.send('Got a Sign Out request')
}
