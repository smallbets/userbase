import uuidv4 from 'uuid/v4'
import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import responseBuilder from './responseBuilder'
import crypto from './crypto'
import connections from './ws'
import logger from './logger'
import db from './db'

const getTtl = secondsToLive => Math.floor(Date.now() / 1000) + secondsToLive

// source: https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Session_Management_Cheat_Sheet.md#session-id-length
const ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID = 16

const VALIDATION_MESSAGE_LENGTH = 16

const oneDaySeconds = 60 * 60 * 24
const oneDayMs = 1000 * oneDaySeconds
const SESSION_LENGTH = oneDayMs

const createSession = async function (userId, appId) {
  const sessionId = crypto
    .randomBytes(ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID)
    .toString('hex')

  const creationDate = new Date().toISOString()
  const session = {
    'session-id': sessionId,
    'user-id': userId,
    'app-id': appId,
    'creation-date': creationDate
  }

  const params = {
    TableName: setup.sessionsTableName,
    Item: session
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.put(params).promise()

  return { sessionId, creationDate }
}

const getAppByAppId = async function (appId) {
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

exports.signUp = async function (req, res) {
  const appId = req.query.appId

  const username = req.body.username
  const password = req.body.password
  const publicKey = req.body.publicKey
  const encryptionKeySalt = req.body.encryptionKeySalt
  const dhKeySalt = req.body.dhKeySalt
  const hmacKeySalt = req.body.hmacKeySalt

  if (!appId || !username || !password || !publicKey || !encryptionKeySalt
    || !dhKeySalt || !hmacKeySalt) return res
      .status(statusCodes['Bad Request'])
      .send('Missing required items')

  const userId = uuidv4()

  try {
    // Warning: uses secondary index here. It's possible index won't be up to date and this fails
    const app = await getAppByAppId(appId)
    if (!app) return res.status(statusCodes['Unauthorized']).send('Invalid app ID')

    const passwordHash = await crypto.bcrypt.hash(password)

    const user = {
      username: username.toLowerCase(),
      'password-hash': passwordHash,
      'app-id': appId,
      'user-id': userId,
      'public-key': publicKey,
      'encryption-key-salt': encryptionKeySalt,
      'diffie-hellman-key-salt': dhKeySalt,
      'hmac-key-salt': hmacKeySalt,
      'seed-not-saved-yet': true,
      'creation-date': new Date().toISOString()
    }

    const params = {
      TransactItems: [{
        // ensure app still exists when creating user
        ConditionCheck: {
          TableName: setup.appsTableName,
          Key: {
            'admin-id': app['admin-id'],
            'app-name': app['app-name']
          },
          ConditionExpression: '#appId = :appId',
          ExpressionAttributeNames: {
            '#appId': 'app-id'
          },
          ExpressionAttributeValues: {
            ':appId': appId,
          },
        },
      }, {
        Put: {
          TableName: setup.usersTableName,
          Item: user,
          // if username does not exist, insert
          // if it already exists and user hasn't saved seed yet, overwrite (to allow another sign up attempt)
          // if it already exists and user has saved seed, fail with ConditionalCheckFailedException
          ConditionExpression: 'attribute_not_exists(username) or attribute_exists(#seedNotSavedYet)',
          ExpressionAttributeNames: {
            '#seedNotSavedYet': 'seed-not-saved-yet'
          },
        }
      }]
    }

    try {
      const ddbClient = connection.ddbClient()
      await ddbClient.transactWrite(params).promise()
    } catch (e) {
      if (e.message.includes('[ConditionalCheckFailed')) {
        return res.status(statusCodes['Unauthorized']).send('Invalid app ID')
      } else if (e.message.includes('ConditionalCheckFailed]')) {
        return res.status(statusCodes['Conflict']).send('Username already exists')
      }
      throw e
    }

    const session = await createSession(userId, appId)
    return res.send(session)
  } catch (e) {
    logger.warn(`Failed to sign up user ${username} and app id ${appId} with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to sign up!')
  }
}

exports.authenticateUser = async function (req, res, next) {
  const sessionId = req.query.sessionId
  const appId = req.query.appId

  if (!sessionId || !appId) return res
    .status(statusCodes['Unauthorized'])
    .send('Missing session token or app id')

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

    const sessionStartDate = invalidated || new Date(session['extended-date'] || session['creation-date'])
    const expired = invalidated || new Date() - sessionStartDate > SESSION_LENGTH

    const isNotUserSession = expired || !session['user-id']

    if (doesNotExist || invalidated || expired || isNotUserSession) return res
      .status(statusCodes['Unauthorized']).send('Invalid session')

    const appDoesNotMatch = isNotUserSession || session['app-id'] !== appId
    if (appDoesNotMatch) return res
      .status(statusCodes['Unauthorized']).send('Invalid app ID')

    // Warning: uses secondary indexes here. It's possible index won't be up to date and this fails
    const [user, app] = await Promise.all([
      getUserByUserId(session['user-id']),
      getAppByAppId(session['app-id'])
    ])

    if (!user) return res.status(statusCodes['Not Found']).send('User not found')
    if (!app) return res.status(statusCodes['Not Found']).send('App not found')

    res.locals.user = user // makes user object available in next route
    next()
  } catch (e) {
    logger.error(`Failed to authenticate user session ${sessionId} with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to authenticate user')
  }
}

exports.getValidationMessage = (publicKey) => {
  const validationMessage = crypto.randomBytes(VALIDATION_MESSAGE_LENGTH)

  const publicKeyArrayBuffer = Buffer.from(publicKey, 'base64')
  const sharedSecret = crypto.diffieHellman.computeSecret(publicKeyArrayBuffer)
  const sharedKey = crypto.sha256.hash(sharedSecret)
  const encryptedValidationMessage = crypto.aesGcm.encrypt(sharedKey, validationMessage)

  return {
    validationMessage,
    encryptedValidationMessage
  }
}

const userSavedSeed = async function (userId, appId, username, publicKey) {
  const updateUserParams = {
    TableName: setup.usersTableName,
    Key: {
      'username': username,
      'app-id': appId
    },
    UpdateExpression: 'remove #seedNotSavedYet',
    ConditionExpression: 'attribute_exists(#seedNotSavedYet) and #userId = :userId and #publicKey = :publicKey',
    ExpressionAttributeNames: {
      '#seedNotSavedYet': 'seed-not-saved-yet',
      '#userId': 'user-id',
      '#publicKey': 'public-key'
    },
    ExpressionAttributeValues: {
      ':userId': userId,
      ':publicKey': publicKey
    },
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.update(updateUserParams).promise()
}

exports.validateKey = async function (validationMessage, userProvidedValidationMessage, user, conn) {
  const seedNotSavedYet = user['seed-not-saved-yet']
  const userId = user['user-id']
  const appId = user['app-id']
  const username = user['username']
  const userPublicKey = user['public-key']

  if (validationMessage.toString('base64') === userProvidedValidationMessage) {
    try {
      if (seedNotSavedYet) {
        try {
          await userSavedSeed(userId, appId, username, userPublicKey)
        } catch (e) {
          if (e.name === 'ConditionalCheckFailedException') {
            return responseBuilder.errorResponse(statusCodes['Unauthorized'], 'Invalid seed')
          }

          throw e
        }
      } else {
        // must be validating after requesting the seed. Clean up for safety --
        // no need to keep storing this seed request in DDB
        if (conn.requesterPublicKey) deleteSeedRequest(userId, conn)
      }

      conn.validateKey()

      return responseBuilder.successResponse('Success!')
    } catch (e) {
      logger.error(`Failed to validate key with ${e}`)
      return responseBuilder.errorResponse(
        statusCodes['Internal Server Error'],
        'Failed to validate key'
      )
    }
  } else {
    return responseBuilder.errorResponse(statusCodes['Unauthorized'], 'Failed to validate key')
  }
}

exports.signIn = async function (req, res) {
  const appId = req.query.appId

  const username = req.body.username
  const password = req.body.password

  if (!appId || !username || !password) return res
    .status(statusCodes['Bad Request'])
    .send('Missing required items')

  const params = {
    TableName: setup.usersTableName,
    Key: {
      username: username.toLowerCase(),
      'app-id': appId
    },
  }

  try {
    // Warning: uses secondary index here. It's possible index won't be up to date and this fails
    const app = await getAppByAppId(appId)
    if (!app) return res.status(statusCodes['Unauthorized']).send('Invalid app ID')

    const ddbClient = connection.ddbClient()
    const userResponse = await ddbClient.get(params).promise()

    const user = userResponse.Item

    const doesNotExist = !user
    const incorrectPassword = doesNotExist || !(await crypto.bcrypt.compare(password, user['password-hash']))

    if (doesNotExist || incorrectPassword) return res
      .status(statusCodes['Unauthorized']).send('Invalid password')

    const session = await createSession(user['user-id'], appId)
    return res.send(session)
  } catch (e) {
    logger.error(`Username ${username} failed to sign in with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to sign in!')
  }
}

exports.signOut = async function (sessionId) {
  if (!sessionId) return responseBuilder.errorResponse(
    statusCodes['Unauthorized'],
    'Missing session id'
  )

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

    return responseBuilder.successResponse('Success!')
  } catch (e) {
    logger.error(`Failed to sign out session ${sessionId} with ${e}`)
    return responseBuilder.errorResponse(
      statusCodes['Internal Server Error'],
      'Failed to sign out!'
    )
  }
}

exports.requestSeed = async function (userId, senderPublicKey, connectionId, requesterPublicKey) {
  if (!requesterPublicKey) return responseBuilder.errorResponse(
    statusCodes['Bad Request'],
    'Missing requester public key'
  )

  const seedExchangeKey = {
    'user-id': userId,
    'requester-public-key': requesterPublicKey
  }

  const params = {
    TableName: setup.seedExchangeTableName,
    Item: {
      ...seedExchangeKey,
      ttl: getTtl(oneDaySeconds)
    },
    // do not overwrite if already exists. especially important if encrypted-seed already exists,
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
      connections.sendSeedRequest(userId, connectionId, requesterPublicKey)
    } catch (e) {

      if (e.name === 'ConditionalCheckFailedException') {

        const existingSeedExchangeParams = {
          TableName: setup.seedExchangeTableName,
          Key: seedExchangeKey
        }

        const existingSeedExchangeResponse = await ddbClient.get(existingSeedExchangeParams).promise()
        const existingSeedExchange = existingSeedExchangeResponse.Item

        const encryptedSeed = existingSeedExchange['encrypted-seed']
        if (encryptedSeed) {
          return responseBuilder.successResponse({ senderPublicKey, encryptedSeed })
        } else {
          connections.sendSeedRequest(userId, connectionId, requesterPublicKey)
        }

      } else {
        throw e
      }
    }

    return responseBuilder.successResponse('Successfully sent out request for seed!')
  } catch (e) {
    logger.error(`Failed to request seed for user ${userId} with ${e}`)
    return responseBuilder.errorResponse(
      statusCodes['Internal Server Error'],
      `Failed to request seed with ${e}`
    )
  }
}

exports.querySeedRequests = async function (userId) {
  const params = {
    TableName: setup.seedExchangeTableName,
    KeyName: '#userId',
    KeyConditionExpression: '#userId = :userId',
    FilterExpression: 'attribute_not_exists(#encryptedSeed)',
    ExpressionAttributeNames: {
      '#userId': 'user-id',
      '#encryptedSeed': 'encrypted-seed'
    },
    ExpressionAttributeValues: {
      ':userId': userId
    },
  }

  try {
    const ddbClient = connection.ddbClient()
    const seedRequests = await ddbClient.query(params).promise()

    return responseBuilder.successResponse({ seedRequests: seedRequests.Items })
  } catch (e) {
    return responseBuilder.errorResponse(
      statusCodes['Internal Server Error'],
      `Failed to get seed requests with ${e}`
    )
  }
}

exports.sendSeed = async function (userId, senderPublicKey, requesterPublicKey, encryptedSeed) {
  if (!requesterPublicKey || !encryptedSeed) return responseBuilder.errorResponse(
    statusCodes['Bad Request'],
    'Missing required items'
  )

  const updateSeedExchangeParams = {
    TableName: setup.seedExchangeTableName,
    Key: {
      'user-id': userId,
      'requester-public-key': requesterPublicKey
    },
    UpdateExpression: 'set #encryptedSeed = :encryptedSeed',
    ExpressionAttributeNames: {
      '#encryptedSeed': 'encrypted-seed'
    },
    ExpressionAttributeValues: {
      ':encryptedSeed': encryptedSeed
    },
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.update(updateSeedExchangeParams).promise()

    connections.sendSeed(userId, senderPublicKey, requesterPublicKey, encryptedSeed)

    return responseBuilder.successResponse('Success!')
  } catch (e) {
    return responseBuilder.errorResponse(
      statusCodes['Internal Server Error'],
      `Failed to send seed with ${e}`
    )
  }
}

const deleteSeedRequest = async function (userId, conn) {
  const requesterPublicKey = conn.requesterPublicKey

  const deleteSeedExchangeParams = {
    TableName: setup.seedExchangeTableName,
    Key: {
      'user-id': userId,
      'requester-public-key': requesterPublicKey
    }
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.delete(deleteSeedExchangeParams).promise()

    conn.deleteSeedRequest()
  } catch (e) {
    logger.warn(`Failed to delete seed request for user ${userId} and public key ${requesterPublicKey} with ${e}`)
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
  if (!encryptedAccessKey) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing access key')

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
      'read-only': readOnly,
      ttl: getTtl(oneDaySeconds)
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
    ownerIndex[ownerId] = ownerPromises.push(getUserByUserId(ownerId)) - 1
  }
  const owners = await Promise.all(ownerPromises)
  return { ownerIndex, owners }
}

const buildDatabaseAccessGrantsResponse = (databases, databaseAccessGrants, owners, ownerIndex) => {
  const response = []
  for (let i = 0; i < databases.length; i++) {
    const database = databases[i]
    if (!database) {
      logger.warn(`Unable to find database with id ${databaseAccessGrants[i]['database-id']}`)
      continue
    }

    const ownerId = database['owner-id']
    const owner = owners[ownerIndex[ownerId]]
    if (!owner) {
      logger.warn(`Unable to find user with id ${databaseAccessGrants[i]['owner-id']}`)
      continue
    }

    const grant = databaseAccessGrants[i]

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

const deleteGrantsAlreadyAccepted = async function (databaseAccessGrants) {
  const existingUserDatabases = await Promise.all(databaseAccessGrants.map(grant => {
    const granteeId = grant['grantee-id']
    const dbId = grant['database-id']
    return db.findUserDatabaseByDatabaseId(dbId, granteeId)
  }))

  const grantsPendingAcceptance = []
  const ddbClient = connection.ddbClient()
  for (let i = 0; i < databaseAccessGrants.length; i++) {
    const grant = databaseAccessGrants[i]
    const granteeId = grant['grantee-id']
    const dbId = grant['database-id']

    const existingUserDb = existingUserDatabases[i]

    if (!existingUserDb) {
      grantsPendingAcceptance.push(grant)
    } else {
      const deleteGrantParams = {
        TableName: setup.databaseAccessGrantsTableName,
        Key: {
          'grantee-id': granteeId,
          'database-id': dbId
        }
      }

      // don't need to wait for successful delete
      ddbClient.delete(deleteGrantParams).promise()
    }

  }
  return grantsPendingAcceptance
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
    const databaseAccessGrantsResponse = await ddbClient.query(params).promise()
    const databaseAccessGrants = databaseAccessGrantsResponse.Items

    if (!databaseAccessGrants || !databaseAccessGrants.length) {
      return responseBuilder.successResponse([])
    }

    // more efficient to clean up this way as opposed to enforcing when inserting grant
    const grantsPendingAcceptance = await deleteGrantsAlreadyAccepted(databaseAccessGrants)

    const databases = await Promise.all(grantsPendingAcceptance.map(grant => {
      const dbId = grant['database-id']
      return db.findDatabaseByDatabaseId(dbId)
    }))

    const { ownerIndex, owners } = await getDbOwners(databases)

    const response = buildDatabaseAccessGrantsResponse(databases, grantsPendingAcceptance, owners, ownerIndex)

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

    if (e.name === 'TransactionCanceledException' && e.message.includes(', ConditionalCheckFailed, ')) {
      return responseBuilder.errorResponse(statusCodes['Conflict'], `Database with name ${dbNameHash} already exists`)
    }

    return responseBuilder.errorResponse(
      statusCodes['Internal Server Error'],
      `Failed to accept access to db with ${e}`
    )
  }
}

async function getUserByUserId(userId) {
  const params = {
    TableName: setup.usersTableName,
    IndexName: setup.userIdIndex,
    KeyConditionExpression: '#userId = :userId',
    ExpressionAttributeNames: {
      '#userId': 'user-id'
    },
    ExpressionAttributeValues: {
      ':userId': userId
    },
    Select: 'ALL_ATTRIBUTES'
  }

  const ddbClient = connection.ddbClient()
  const userResponse = await ddbClient.query(params).promise()

  if (!userResponse || userResponse.Items.length === 0) return null

  if (userResponse.Items.length > 1) {
    const errorMsg = `Too many users found with id ${userId}`
    logger.fatal(errorMsg)
    throw new Error(errorMsg)
  }

  return userResponse.Items[0]
}
exports.getUserByUserId = getUserByUserId

exports.extendSession = async function (req, res) {
  const sessionId = req.query.sessionId

  const extendedDate = new Date().toISOString()

  const params = {
    TableName: setup.sessionsTableName,
    Key: {
      'session-id': sessionId
    },
    UpdateExpression: 'set #extendedDate = :extendedDate',
    ExpressionAttributeNames: {
      '#extendedDate': 'extended-date'
    },
    ExpressionAttributeValues: {
      ':extendedDate': extendedDate
    }
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.update(params).promise()
    return res.send(extendedDate)
  } catch (e) {
    logger.error(`Unable to extend session ${sessionId} with: ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to extend session')
  }
}

exports.getServerPublicKey = async function (_, res) {
  try {
    return res.send(crypto.diffieHellman.getPublicKey())
  } catch (e) {
    logger.error(`Failed to get server public key with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to get server public key')
  }
}
