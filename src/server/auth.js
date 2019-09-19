import bcrypt from 'bcrypt'
import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import responseBuilder from './responseBuilder'
import crypto from './crypto'
import userController from './user'
import connections from './ws'
import logger from './logger'
import db from './db'

const SALT_ROUNDS = 10

// source: https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Session_Management_Cheat_Sheet.md#session-id-length
const ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID = 16
const SESSION_COOKIE_NAME = 'sessionId'

const VALIDATION_MESSAGE_LENGTH = 16

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
  const publicKey = req.body.publicKey

  if (!username || !password || !userId || !publicKey) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing required items' })

  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    const validationMessage = crypto.randomBytes(VALIDATION_MESSAGE_LENGTH)

    const user = {
      username: username.toLowerCase(),
      'password-hash': passwordHash,
      'user-id': userId,
      'public-key': publicKey,
      'validation-message': validationMessage
    }

    const params = {
      TableName: setup.usersTableName,
      Item: user,
      // if username does not exist, insert
      // if it already exists and has a validation message, overwrite (bc key hasn't been validated yet)
      // if it already exists and does not have a validation message, fail with ConditionalCheckFailedException (bc already validated)
      ConditionExpression: 'attribute_not_exists(username) or attribute_exists(#validationMsg)',
      ExpressionAttributeNames: {
        '#validationMsg': 'validation-message'
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
            err: `Failed to sign up with error ${e}`,
            readableMessage: 'Username already exists'
          })
      }
      throw e
    }

    const publicKeyArrayBuffer = Buffer.from(publicKey, 'base64')
    const sharedSecret = crypto.diffieHellman.computeSecret(publicKeyArrayBuffer)
    const sharedKey = crypto.sha256.hash(sharedSecret)
    const encryptedValidationMessage = crypto.aesGcm.encrypt(sharedKey, validationMessage)

    await createSession(userId, res)

    return res.send(encryptedValidationMessage)
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to sign up with ${e}` })
  }
}

exports.validateKey = async function (req, res) {
  const user = res.locals.user

  if (req.readableLength !== VALIDATION_MESSAGE_LENGTH) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Validation message is incorect length' })

  try {
    const username = user['username']

    const validationMessage = req.read()

    const updateUserParams = {
      TableName: setup.usersTableName,
      Key: {
        'username': username
      },
      UpdateExpression: 'remove #validationMsg',
      ConditionExpression: '#validationMsg = :validationMsg',
      ExpressionAttributeNames: {
        '#validationMsg': 'validation-message'
      },
      ExpressionAttributeValues: {
        ':validationMsg': validationMessage,
      },
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.update(updateUserParams).promise()

    return res.end()
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      return res
        .status(statusCodes['Unauthorized'])
        .send({
          err: `Failed to validate key with error ${e}`,
          readableMessage: 'Invalid key.'
        })
    }
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to validate key with ${e}` })
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
      .send({ err: `Failed to sign in with ${e}` })
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

    // validate session
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

    const userId = session['user-id']
    const user = await userController.findUserByUserId(userId)
    if (!user) return res
      .status(statusCodes['Not Found'])
      .send({ readableMessage: 'User no longer exists' })

    // ensure user has already validated key, unless user is trying to validate key
    if (req.path !== '/api/auth/validate-key') {
      if (user['validation-message']) return res
        .status(statusCodes['Unauthorized'])
        .send({ readableMessage: 'User has not validated key yet' })
    }

    res.locals.user = user // makes user object available in next route
    next()
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to authenticate user with ${e}` })
  }
}

exports.requestMasterKey = async function (userId, senderPublicKey, connectionId, requesterPublicKey) {
  if (!requesterPublicKey) return responseBuilder.errorResponse(
    statusCodes['Bad Request'],
    'Missing requester public key'
  )

  const keyExchange = {
    'user-id': userId,
    'requester-public-key': requesterPublicKey
  }

  const params = {
    TableName: setup.keyExchangeTableName,
    Item: keyExchange,
    // do not overwrite if already exists. especially important if encrypted-master-key already exists,
    // but no need to overwrite ever
    ConditionExpression: 'attribute_not_exists(#userId)',
    ExpressionAttributeNames: {
      '#userId': 'user-id'
    }
  }

  try {
    const ddbClient = connection.ddbClient()

    try {
      await ddbClient.put(params).promise()
      connections.sendKeyRequest(userId, connectionId, requesterPublicKey)
    } catch (e) {

      if (e.name === 'ConditionalCheckFailedException') {

        const existingKeyExchangeParams = {
          TableName: setup.keyExchangeTableName,
          Key: keyExchange
        }

        const existingKeyExchangeResponse = await ddbClient.get(existingKeyExchangeParams).promise()

        const existingKeyExchange = existingKeyExchangeResponse.Item

        const encryptedMasterKey = existingKeyExchange['encrypted-master-key']
        if (encryptedMasterKey) {
          return responseBuilder.successResponse({ senderPublicKey, encryptedMasterKey })
        } else {
          connections.sendKeyRequest(userId, connectionId, requesterPublicKey)
        }

      } else {
        throw e
      }
    }

    return responseBuilder.successResponse('Successfully sent out request for key!')
  } catch (e) {
    return responseBuilder.errorResponse(
      statusCodes['Internal Server Error'],
      `Failed to request master key with ${e}`
    )
  }
}

exports.queryMasterKeyRequests = async function (userId) {
  const params = {
    TableName: setup.keyExchangeTableName,
    KeyName: '#userId',
    KeyConditionExpression: '#userId = :userId',
    FilterExpression: 'attribute_not_exists(#encryptedMasterKey)',
    ExpressionAttributeNames: {
      '#userId': 'user-id',
      '#encryptedMasterKey': 'encrypted-master-key'
    },
    ExpressionAttributeValues: {
      ':userId': userId
    },
  }

  try {
    const ddbClient = connection.ddbClient()
    const masterKeyRequests = await ddbClient.query(params).promise()

    return responseBuilder.successResponse({ masterKeyRequests: masterKeyRequests.Items })
  } catch (e) {
    return responseBuilder.errorResponse(
      statusCodes['Internal Server Error'],
      `Failed to get master key requests with ${e}`
    )
  }
}

exports.sendMasterKey = async function (userId, senderPublicKey, requesterPublicKey, encryptedMasterKey) {
  if (!requesterPublicKey || !encryptedMasterKey) return responseBuilder.errorResponse(
    statusCodes['Bad Request'],
    'Missing required items'
  )

  const updateKeyExchangeParams = {
    TableName: setup.keyExchangeTableName,
    Key: {
      'user-id': userId,
      'requester-public-key': requesterPublicKey
    },
    UpdateExpression: 'set #encryptedMasterKey = :encryptedMasterKey',
    ExpressionAttributeNames: {
      '#encryptedMasterKey': 'encrypted-master-key'
    },
    ExpressionAttributeValues: {
      ':encryptedMasterKey': encryptedMasterKey
    },
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.update(updateKeyExchangeParams).promise()

    connections.sendMasterKey(userId, senderPublicKey, requesterPublicKey, encryptedMasterKey)

    return responseBuilder.successResponse('Success!')
  } catch (e) {
    return responseBuilder.errorResponse(
      statusCodes['Internal Server Error'],
      `Failed to send master key with ${e}`
    )
  }
}

exports.deleteMasterKeyRequest = async function (userId, requesterPublicKey) {
  const deleteKeyExchangeParams = {
    TableName: setup.keyExchangeTableName,
    Key: {
      'user-id': userId,
      'requester-public-key': requesterPublicKey
    },
    ConditionExpression: 'attribute_exists(#encryptedMasterKey)',
    ExpressionAttributeNames: {
      '#encryptedMasterKey': 'encrypted-master-key'
    }
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.delete(deleteKeyExchangeParams).promise()

    connections.deleteKeyRequest(userId, requesterPublicKey)
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      logger.warn(`Encrypted master key not found for user ${userId} and public key ${requesterPublicKey}`)
    } else {
      logger.warn(`Failed to delete key request for user ${userId} and public key ${requesterPublicKey}`)
    }
  }
}

const getUser = async function (username) {
  const userParams = {
    TableName: setup.usersTableName,
    Key: {
      username
    }
  }

  const ddbClient = connection.ddbClient()
  const userResponse = await ddbClient.get(userParams).promise()

  return userResponse && userResponse.Item
}

exports.getPublicKey = async function (username) {
  if (!username) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing username')

  try {
    const user = await getUser(username)

    if (!user) return responseBuilder.errorResponse(statusCodes['Not Found'], 'User not found')

    const publicKey = user['public-key']
    return responseBuilder.successResponse(publicKey)
  } catch (e) {
    return responseBuilder.errorResponse(
      statusCodes['Internal Server Error'],
      `Failed to get public key with ${e}`
    )
  }
}

exports.grantDatabaseAccess = async function (grantorId, granteeUsername, dbId, encryptedAccessKey, readOnly) {
  if (!granteeUsername) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing grantee username')
  if (!dbId) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database id')

  try {
    const [grantee, database] = await Promise.all([
      getUser(granteeUsername),
      db.findDatabaseByDatabaseId(dbId)
    ])

    if (!grantee) return responseBuilder.errorResponse(statusCodes['Not Found'], 'User not found')
    if (!database) return responseBuilder.errorResponse(statusCodes['Not Found'], 'Database not found')
    if (database['owner-id'] !== grantorId) return responseBuilder.errorResponse(
      statusCodes['Unauthorized'],
      'You do not have grant privileges over this database'
    )

    const granteeId = grantee['user-id']

    const databaseAccess = {
      'grantee-id': granteeId,
      'database-id': dbId,
      'encrypted-access-key': encryptedAccessKey,
      'read-only': readOnly
    }

    const params = {
      TableName: setup.databaseAccessGrantsTableName,
      Item: databaseAccess,
      ConditionExpression: 'attribute_not_exists(#granteeId)',
      ExpressionAttributeNames: {
        '#granteeId': 'grantee-id'
      },
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.put(params).promise()

    // TO-DO: notify grantee clients via WebSocket

    return responseBuilder.successResponse('Success!')
  } catch (e) {
    return responseBuilder.errorResponse(
      statusCodes['Internal Server Error'],
      `Failed to grant db access key with ${e}`
    )
  }
}

const getDbOwners = async function (databases) {
  const ownerIndex = {}
  const ownerPromises = []
  for (let i = 0; i < databases.length; i++) {
    const database = databases[i]
    if (!database) continue

    const ownerId = database['owner-id']

    if (!ownerId) continue

    if (typeof ownerIndex[ownerId] === 'number') continue
    ownerIndex[ownerId] = ownerPromises.push(userController.findUserByUserId(ownerId)) - 1
  }
  const owners = await Promise.all(ownerPromises)
  return { ownerIndex, owners }
}

const buildDatabaseAccessGrantsResponse = (databases, databaseAccessGrants, owners, ownerIndex) => {
  const response = []
  for (let i = 0; i < databases.length; i++) {
    const database = databases[i]
    if (!database) {
      logger.warn(`Unable to find database with id ${databaseAccessGrants.Items[i]['database-id']}`)
      continue
    }

    const ownerId = database['owner-id']
    const owner = owners[ownerIndex[ownerId]]
    if (!owner) {
      logger.warn(`Unable to find user with id ${databaseAccessGrants.Items[i]['owner-id']}`)
      continue
    }

    const grant = databaseAccessGrants.Items[i]

    response.push({
      owner: owner['username'],
      ownerPublicKey: owner['public-key'],
      dbId: database['database-id'],
      encryptedDbName: database['database-name'],
      encryptedAccessKey: grant['encrypted-access-key'],
    })
  }
  return response
}

exports.queryDatabaseAccessGrants = async function (granteeId) {
  const params = {
    TableName: setup.databaseAccessGrantsTableName,
    KeyName: '#granteeId',
    KeyConditionExpression: '#granteeId = :granteeId',
    ExpressionAttributeNames: {
      '#granteeId': 'grantee-id',
    },
    ExpressionAttributeValues: {
      ':granteeId': granteeId
    },
  }

  try {
    const ddbClient = connection.ddbClient()
    const databaseAccessGrants = await ddbClient.query(params).promise()

    if (!databaseAccessGrants || !databaseAccessGrants.Items || !databaseAccessGrants.Items.length) {
      return responseBuilder.successResponse([])
    }

    const databases = await Promise.all(databaseAccessGrants.Items.map(grant => {
      const dbId = grant['database-id']
      return db.findDatabaseByDatabaseId(dbId)
    }))

    const { ownerIndex, owners } = await getDbOwners(databases)

    const response = buildDatabaseAccessGrantsResponse(databases, databaseAccessGrants, owners, ownerIndex)

    return responseBuilder.successResponse(response)
  } catch (e) {
    return responseBuilder.errorResponse(
      statusCodes['Internal Server Error'],
      `Failed to get database access grants with ${e}`
    )
  }
}

exports.acceptDatabaseAccess = async function (granteeId, dbId, dbNameHash, encryptedDbKey, encryptedDbName) {
  if (!dbId) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database id')
  if (!dbNameHash) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database name hash')
  if (!encryptedDbKey) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing encrypted db key')

  const databaseAccessGrantKey = {
    'grantee-id': granteeId,
    'database-id': dbId,
  }

  const databaseAccessGrantParams = {
    TableName: setup.databaseAccessGrantsTableName,
    Key: databaseAccessGrantKey,
  }

  try {
    const ddbClient = connection.ddbClient()
    const databaseAccessGrantResponse = await ddbClient.get(databaseAccessGrantParams).promise()

    const databaseAccessGrant = databaseAccessGrantResponse.Item
    if (!databaseAccessGrant) return responseBuilder(statusCodes['Not Found'], 'Access grant not found')

    const userDatabase = {
      'user-id': granteeId,
      'database-name-hash': dbNameHash,
      'database-id': dbId,
      'encrypted-db-key': encryptedDbKey,
      'read-only': databaseAccessGrant['read-only']
    }

    const params = {
      TransactItems: [{
        Delete: {
          TableName: setup.databaseAccessGrantsTableName,
          Key: databaseAccessGrantKey
        }
      }, {
        Put: {
          TableName: setup.userDatabaseTableName,
          Item: userDatabase,
          ConditionExpression: 'attribute_not_exists(#userId)',
          ExpressionAttributeNames: {
            '#userId': 'user-id',
          }
        }
      }, {
        ConditionCheck: {
          TableName: setup.databaseTableName,
          Key: {
            'database-id': dbId
          },
          ConditionExpression: '#encryptedDbName = :encryptedDbName',
          ExpressionAttributeNames: {
            '#encryptedDbName': 'database-name',
          },
          ExpressionAttributeValues: {
            ':encryptedDbName': encryptedDbName,
          }
        }
      }]
    }

    await ddbClient.transactWrite(params).promise()

    return responseBuilder.successResponse('Success!')
  } catch (e) {
    return responseBuilder.errorResponse(
      statusCodes['Internal Server Error'],
      `Failed to accept access to db with ${e}`
    )
  }
}
