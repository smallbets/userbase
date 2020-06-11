import uuidv4 from 'uuid/v4'
import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import responseBuilder from './responseBuilder'
import connections from './ws'
import logger from './logger'
import userController from './user'
import peers from './peers'
import {
  lastEvaluatedKeyToNextPageToken,
  nextPageTokenToLastEvaluatedKey,
  getTtl,
} from './utils'

const MAX_OPERATIONS_IN_TX = 10

const HOURS_IN_A_DAY = 24
const SECONDS_IN_A_DAY = 60 * 60 * HOURS_IN_A_DAY
const MS_IN_A_DAY = SECONDS_IN_A_DAY * 1000

const getS3DbStateKey = (databaseId, bundleSeqNo) => `${databaseId}/${bundleSeqNo}`

const _buildUserDatabaseParams = (userId, dbNameHash, dbId, encryptedDbKey, readOnly, resharingAllowed) => {
  return {
    TableName: setup.userDatabaseTableName,
    Item: {
      'user-id': userId,
      'database-name-hash': dbNameHash,
      'database-id': dbId,
      'encrypted-db-key': encryptedDbKey,
      'read-only': readOnly,
      'resharing-allowed': resharingAllowed
    },
    ConditionExpression: 'attribute_not_exists(#userId)',
    ExpressionAttributeNames: {
      '#userId': 'user-id',
    }
  }
}

const createDatabase = async function (userId, dbNameHash, dbId, encryptedDbName, encryptedDbKey) {
  try {
    const user = await userController.getUserByUserId(userId)
    if (!user || user['deleted']) throw new Error('UserNotFound')

    const database = {
      'database-id': dbId,
      'owner-id': userId,
      'database-name': encryptedDbName
    }

    const userDatabaseParams = _buildUserDatabaseParams(userId, dbNameHash, dbId, encryptedDbKey)

    const params = {
      TransactItems: [{
        Put: {
          TableName: setup.databaseTableName,
          Item: database,
          ConditionExpression: 'attribute_not_exists(#dbId)',
          ExpressionAttributeNames: {
            '#dbId': 'database-id',
          }
        }
      }, {
        Put: userDatabaseParams
      }]
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.transactWrite(params).promise()

    return { ...database, ...userDatabaseParams.Item }
  } catch (e) {

    if (e.message) {
      if (e.message.includes('UserNotFound')) {
        throw responseBuilder.errorResponse(statusCodes['Conflict'], 'UserNotFound')
      } else if (e.message.includes('ConditionalCheckFailed')) {
        throw responseBuilder.errorResponse(statusCodes['Conflict'], 'Database already exists')
      } else if (e.message.includes('TransactionConflict')) {
        throw responseBuilder.errorResponse(statusCodes['Conflict'], 'Database already creating')
      }
    }

    logger.error(`Failed to create database for user ${userId} with ${e}`)
    throw responseBuilder.errorResponse(statusCodes['Internal Server Error'], 'Failed to create database')
  }
}

const findDatabaseByDatabaseId = async function (dbId) {
  const databaseParams = {
    TableName: setup.databaseTableName,
    Key: {
      'database-id': dbId
    }
  }

  const ddbClient = connection.ddbClient()
  const dbResponse = await ddbClient.get(databaseParams).promise()

  if (!dbResponse || !dbResponse.Item) return null
  return dbResponse.Item
}
exports.findDatabaseByDatabaseId = findDatabaseByDatabaseId

const _getUserDatabase = async function (userId, dbNameHash) {
  const userDatabaseParams = {
    TableName: setup.userDatabaseTableName,
    Key: {
      'user-id': userId,
      'database-name-hash': dbNameHash
    }
  }

  const ddbClient = connection.ddbClient()
  const userDbResponse = await ddbClient.get(userDatabaseParams).promise()

  return userDbResponse && userDbResponse.Item
}

const _getUserDatabaseByUserIdAndDatabaseId = async function (userId, databaseId) {
  const params = {
    TableName: setup.userDatabaseTableName,
    IndexName: setup.userDatabaseIdIndex,
    KeyConditionExpression: '#databaseId = :databaseId and #userId = :userId',
    ExpressionAttributeNames: {
      '#databaseId': 'database-id',
      '#userId': 'user-id'
    },
    ExpressionAttributeValues: {
      ':databaseId': databaseId,
      ':userId': userId
    },
    Select: 'ALL_ATTRIBUTES'
  }

  const ddbClient = connection.ddbClient()
  const userDbResponse = await ddbClient.query(params).promise()

  if (!userDbResponse || userDbResponse.Items.length === 0) return null

  if (userDbResponse.Items.length > 1) {
    // this should never happen
    const errorMsg = `Too many user dbs found with database id ${databaseId} and userId ${userId}`
    logger.fatal(errorMsg)
    throw new Error(errorMsg)
  }

  return userDbResponse.Items[0]
}

const getDatabase = async function (userId, dbNameHash) {
  const userDb = await _getUserDatabase(userId, dbNameHash)
  if (!userDb) return null

  const dbId = userDb['database-id']

  const database = await findDatabaseByDatabaseId(dbId)
  if (!database) return null

  return { ...userDb, ...database }
}

exports.openDatabase = async function (user, app, admin, connectionId, dbNameHash, newDatabaseParams, reopenAtSeqNo) {
  if (!dbNameHash) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database name hash')
  if (reopenAtSeqNo && typeof reopenAtSeqNo !== 'number') return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Reopen at seq no must be number')
  const userId = user['user-id']

  try {
    try {
      userController.validatePayment(user, app, admin)
    } catch (e) {
      return responseBuilder.errorResponse(e.status, e.error)
    }

    let database
    try {
      database = await getDatabase(userId, dbNameHash)

      if (database && database['owner-id'] !== userId) return responseBuilder.errorResponse(statusCodes['Forbidden'], 'Database not owned by user')

      if (!database && !newDatabaseParams) return responseBuilder.errorResponse(statusCodes['Not Found'], 'Database not found')
      else if (!database) {
        // attempt to create new database
        const { dbId, encryptedDbName, encryptedDbKey } = newDatabaseParams
        if (!dbId) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database id')
        if (!encryptedDbName) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database name')
        if (!encryptedDbKey) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database key')

        database = await createDatabase(userId, dbNameHash, dbId, encryptedDbName, encryptedDbKey)
      }
    } catch (e) {
      if (e.data === 'Database already exists' || e.data === 'Database already creating') {
        // User must have made a concurrent request to open db with same name for the first time.
        // Can safely reattempt to get the database
        database = await getDatabase(userId, dbNameHash)
      }
      else return responseBuilder.errorResponse(e.status, e.data)
    }
    if (!database) return responseBuilder.errorResponse(statusCodes['Not Found'], 'Database not found')

    const dbId = database['database-id']
    const bundleSeqNo = database['bundle-seq-no']
    const dbKey = database['encrypted-db-key']

    const isOwner = true
    if (connections.openDatabase(userId, connectionId, dbId, bundleSeqNo, dbNameHash, dbKey, reopenAtSeqNo, isOwner)) {
      return responseBuilder.successResponse('Success!')
    } else {
      throw new Error('Unable to open database')
    }
  } catch (e) {
    logger.error(`Failed to open database for user ${userId} with ${e}`)
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], 'Failed to open database')
  }
}

exports.openDatabaseByDatabaseId = async function (user, app, admin, connectionId, databaseId, reopenAtSeqNo) {
  if (!databaseId) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database ID')
  if (reopenAtSeqNo && typeof reopenAtSeqNo !== 'number') return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Reopen at seq no must be number')
  const userId = user['user-id']

  try {
    try {
      userController.validatePayment(user, app, admin)
    } catch (e) {
      return responseBuilder.errorResponse(e.status, e.error)
    }

    const [db, userDb] = await Promise.all([
      findDatabaseByDatabaseId(databaseId),
      _getUserDatabaseByUserIdAndDatabaseId(userId, databaseId)
    ])

    if (!db || !userDb) return responseBuilder.errorResponse(statusCodes['Not Found'], 'Database not found')

    const isOwner = db['owner-id'] === userId
    if (isOwner) return responseBuilder.errorResponse(statusCodes['Forbidden'], 'Database is owned by user')

    const database = { ...db, ...userDb }
    const dbNameHash = database['database-name-hash']
    const bundleSeqNo = database['bundle-seq-no']
    const dbKey = database['encrypted-db-key']

    // user must call getDatabases() first to set the db key
    if (!dbKey) return responseBuilder.errorResponse(statusCodes['Not Found'], 'Database key not found')

    if (connections.openDatabase(userId, connectionId, databaseId, bundleSeqNo, dbNameHash, dbKey, reopenAtSeqNo, isOwner)) {
      return responseBuilder.successResponse('Success!')
    } else {
      throw new Error('Unable to open database')
    }
  } catch (e) {
    logger.error(`Failed to open database by database ID for user ${userId} with ${e}`)
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], 'Failed to open database by database ID')
  }
}

const _queryUserDatabases = async (userId, nextPageToken) => {
  const userDatabasesParams = {
    TableName: setup.userDatabaseTableName,
    KeyConditionExpression: '#userId = :userId',
    ExpressionAttributeNames: {
      '#userId': 'user-id',
    },
    ExpressionAttributeValues: {
      ':userId': userId
    }
  }

  if (nextPageToken) {
    userDatabasesParams.ExclusiveStartKey = nextPageTokenToLastEvaluatedKey(nextPageToken)
  }

  const ddbClient = connection.ddbClient()
  const userDbsResponse = await ddbClient.query(userDatabasesParams).promise()

  return userDbsResponse
}

exports.getDatabases = async function (logChildObject, userId, nextPageToken) {
  try {
    const userDbsResponse = await _queryUserDatabases(userId, nextPageToken)
    const userDbs = userDbsResponse.Items

    const [databases, senders] = await Promise.all([
      Promise.all(userDbs.map(userDb => findDatabaseByDatabaseId(userDb['database-id']))),
      Promise.all(userDbs.map(userDb => userDb['sender-id'] && userController.getUserByUserId(userDb['sender-id'])))
    ])

    const finalResult = {
      databases: databases.map((db, i) => {
        const isOwner = db['owner-id'] === userId
        const userDb = userDbs[i]

        return {
          databaseName: db['database-name'],
          databaseId: db['database-id'],

          isOwner,
          readOnly: isOwner ? false : userDb['read-only'],
          resharingAllowed: isOwner ? true : userDb['resharing-allowed'],
          databaseNameHash: userDb['database-name-hash'],
          senderUsername: senders[i] && senders[i].username,
          senderEcdsaPublicKey: userDb['sender-ecdsa-public-key'],

          // if already has access to database
          encryptedDbKey: userDb['encrypted-db-key'],

          // if still does not have access to database
          wrappedDbKey: userDb['wrapped-db-key'],
          ephemeralPublicKey: userDb['ephemeral-public-key'],
          signedEphemeralPublicKey: userDb['signed-ephemeral-public-key'],
        }
      }),
      nextPageToken: userDbsResponse.LastEvaluatedKey && lastEvaluatedKeyToNextPageToken(userDbsResponse.LastEvaluatedKey)
    }

    return responseBuilder.successResponse(finalResult)
  } catch (e) {
    logChildObject.err = e
    return responseBuilder.errorResponse(
      statusCodes['Internal Server Error'],
      'Failed to get databases'
    )
  }
}

const _queryOtherUserDatabases = async function (dbId, userId, nextPageTokenLessThanUserId, nextPageTokenMoreThanUserId) {
  const otherUserDatabasesLessThanUserIdParams = {
    TableName: setup.userDatabaseTableName,
    IndexName: setup.userDatabaseIdIndex,
    // Condition operator != is not supported, must make separate queries using < and >
    KeyConditionExpression: '#dbId = :dbId and #userId < :userId',
    ExpressionAttributeNames: {
      '#dbId': 'database-id',
      '#userId': 'user-id'
    },
    ExpressionAttributeValues: {
      ':dbId': dbId,
      ':userId': userId
    },
  }

  const otherUserDatabasesMoreThanUserIdParams = {
    ...otherUserDatabasesLessThanUserIdParams,
    KeyConditionExpression: '#dbId = :dbId and #userId > :userId',
  }

  if (nextPageTokenLessThanUserId) {
    otherUserDatabasesLessThanUserIdParams.ExclusiveStartKey = nextPageTokenToLastEvaluatedKey(nextPageTokenLessThanUserId)
  }

  if (nextPageTokenMoreThanUserId) {
    otherUserDatabasesMoreThanUserIdParams.ExclusiveStartKey = nextPageTokenToLastEvaluatedKey(nextPageTokenMoreThanUserId)
  }

  const ddbClient = connection.ddbClient()
  const [otherUserDbsLessThanResponse, otherUserDbsMoreThanResponse] = await Promise.all([
    ddbClient.query(otherUserDatabasesLessThanUserIdParams).promise(),
    ddbClient.query(otherUserDatabasesMoreThanUserIdParams).promise(),
  ])

  const otherUserDbsLessThan = (otherUserDbsLessThanResponse && otherUserDbsLessThanResponse.Items) || []
  const otherUserDbsMoreThan = (otherUserDbsMoreThanResponse && otherUserDbsMoreThanResponse.Items) || []

  return {
    otherUserDatabases: otherUserDbsLessThan.concat(otherUserDbsMoreThan),
    nextPageTokenLessThanUserId: otherUserDbsLessThanResponse && otherUserDbsLessThanResponse.LastEvaluatedKey
      && lastEvaluatedKeyToNextPageToken(otherUserDbsLessThanResponse.LastEvaluatedKey),
    nextPageTokenMoreThanUserId: otherUserDbsMoreThanResponse && otherUserDbsMoreThanResponse.LastEvaluatedKey
      && lastEvaluatedKeyToNextPageToken(otherUserDbsMoreThanResponse.LastEvaluatedKey),
  }
}

const _getOtherDatabaseUsers = async function (dbId, userId) {
  const otherDatabaseUsersQueryResult = await _queryOtherUserDatabases(dbId, userId)
  const { otherUserDatabases } = otherDatabaseUsersQueryResult

  const userQueries = []
  for (const otherUserDb of otherUserDatabases) {
    const otherUserId = otherUserDb['user-id']
    userQueries.push(userController.getUserByUserId(otherUserId))
  }
  const otherDatabaseUsers = await Promise.all(userQueries)

  return {
    otherDatabaseUsers,
    otherUserDatabases,
    nextPageTokenLessThanUserId: otherDatabaseUsersQueryResult.nextPageTokenLessThanUserId,
    nextPageTokenMoreThanUserId: otherDatabaseUsersQueryResult.nextPageTokenMoreThanUserId,
  }
}

exports.getDatabaseUsers = async function (logChildObject, userId, databaseId, databaseNameHash,
  nextPageTokenLessThanUserId, nextPageTokenMoreThanUserId
) {
  try {
    logChildObject.databaseId = databaseId
    logChildObject.databaseNameHash = databaseNameHash

    const [userDatabase, database] = await Promise.all([
      _getUserDatabase(userId, databaseNameHash),
      findDatabaseByDatabaseId(databaseId)
    ])

    if (!userDatabase || !database || userDatabase['database-id'] !== databaseId) throw {
      status: statusCodes['Not Found'],
      error: { message: 'Database not found' }
    }

    const otherDatabaseUsersResult = await _getOtherDatabaseUsers(databaseId, userId, nextPageTokenLessThanUserId, nextPageTokenMoreThanUserId)
    const { otherDatabaseUsers, otherUserDatabases } = otherDatabaseUsersResult

    const usernamesByUserId = {}
    otherDatabaseUsers.forEach(user => usernamesByUserId[user['user-id']] = user['username'])

    const finalResult = {
      users: otherDatabaseUsers.map((user, i) => {
        const isOwner = database['owner-id'] === user['user-id']
        const otherUserDb = otherUserDatabases[i]
        const isChild = userId === otherUserDb['sender-id'] // user sent database to this user
        const isParent = userDatabase['sender-id'] === otherUserDb['user-id'] // user received database from this user

        return {
          username: user['username'],
          isOwner,
          senderUsername: usernamesByUserId[otherUserDb['sender-id']],
          readOnly: isOwner ? false : otherUserDb['read-only'],
          resharingAllowed: isOwner ? true : otherUserDb['resharing-allowed'],

          // used to verify other user with access to the database
          verificationValues: {
            sentSignature: otherUserDb['sent-signature'],
            receivedSignature: otherUserDb['received-signature'],
            senderEcdsaPublicKey: otherUserDb['sender-ecdsa-public-key'],
            recipientEcdsaPublicKey: otherUserDb['recipient-ecdsa-public-key'],

            // used to verify the requesting user sent the database to this user
            isChild,

            // the folowing additional values are used to verify the requesting user received the database from this user
            mySentSignature: isParent && userDatabase['sent-signature'],
            myReceivedSignature: isParent && userDatabase['received-signature'],
            mySenderEcdsaPublicKey: isParent && userDatabase['sender-ecdsa-public-key'],
          }
        }
      }),
      nextPageTokenLessThanUserId: otherDatabaseUsersResult.nextPageTokenLessThanUserId,
      nextPageTokenMoreThanUserId: otherDatabaseUsersResult.nextPageTokenMoreThanUserId,
    }

    return responseBuilder.successResponse(finalResult)
  } catch (e) {
    logChildObject.err = e

    if (e.status && e.error) {
      return responseBuilder.errorResponse(e.status, e.error.message)
    } else {
      return responseBuilder.errorResponse(
        statusCodes['Internal Server Error'],
        'Failed to get database users'
      )
    }
  }
}

const _getUserDatabaseOverWebSocket = async function (logChildObject, userDbDdbQuery, internalServerErrorLog) {
  try {
    const userDb = await userDbDdbQuery()
    if (!userDb) return responseBuilder.errorResponse(statusCodes['Not Found'], { message: 'DatabaseNotFound' })

    return responseBuilder.successResponse({
      encryptedDbKey: userDb['encrypted-db-key'],
      dbId: userDb['database-id'],
      dbNameHash: userDb['database-name-hash']
    })
  } catch (e) {
    logChildObject.err = e
    return responseBuilder.errorResponse(
      statusCodes['Internal Server Error'],
      internalServerErrorLog
    )
  }
}

exports.getUserDatabaseByDbNameHash = async function (logChildObject, userId, dbNameHash) {
  const userDbDdbQuery = () => _getUserDatabase(userId, dbNameHash)
  const internalServerErrorLog = 'Failed to get user database by db name hash'
  const response = await _getUserDatabaseOverWebSocket(logChildObject, userDbDdbQuery, internalServerErrorLog)
  return response
}

exports.getUserDatabaseByDatabaseId = async function (logChildObject, userId, databaseId) {
  const userDbDdbQuery = () => _getUserDatabaseByUserIdAndDatabaseId(userId, databaseId)
  const internalServerErrorLog = 'Failed to get user database by db id'
  const response = await _getUserDatabaseOverWebSocket(logChildObject, userDbDdbQuery, internalServerErrorLog)
  return response
}

const _incrementSeqNo = async function (transaction, databaseId) {
  const incrementSeqNoParams = {
    TableName: setup.databaseTableName,
    Key: {
      'database-id': databaseId
    },
    UpdateExpression: 'add #nextSeqNumber :num',
    ExpressionAttributeNames: {
      '#nextSeqNumber': 'next-seq-number'
    },
    ExpressionAttributeValues: {
      ':num': 1
    },
    ReturnValues: 'UPDATED_NEW'
  }

  // atomically increments and gets the next sequence number for the database
  try {
    const ddbClient = connection.ddbClient()
    const db = await ddbClient.update(incrementSeqNoParams).promise()
    transaction['sequence-no'] = db.Attributes['next-seq-number']
    transaction['creation-date'] = new Date().toISOString()
  } catch (e) {
    throw new Error(`Failed to increment sequence number with ${e}.`)
  }
}

const putTransaction = async function (transaction, userId, databaseId) {
  // make both requests async to keep the time for successful putTransaction low
  const [userDb] = await Promise.all([
    _getUserDatabaseByUserIdAndDatabaseId(userId, databaseId),
    _incrementSeqNo(transaction, databaseId)
  ])

  const ddbClient = connection.ddbClient()

  try {
    if (!userDb) {
      throw {
        status: statusCodes['Not Found'],
        error: { name: 'DatabaseNotFound' }
      }
    } else if (userDb['read-only']) {
      throw {
        status: statusCodes['Forbidden'],
        error: { name: 'DatabaseIsReadOnly' }
      }
    } else {

      // write the transaction using the next sequence number
      const params = {
        TableName: setup.transactionsTableName,
        Item: transaction,
        ConditionExpression: 'attribute_not_exists(#databaseId)',
        ExpressionAttributeNames: {
          '#databaseId': 'database-id'
        }
      }

      await ddbClient.put(params).promise()
    }
  } catch (e) {
    // best effort rollback - if the rollback fails here, it will get attempted again when the transactions are read
    await rollbackAttempt(transaction, ddbClient)

    if (e.status && e.error) throw e
    else throw new Error(`Failed to put transaction with ${e}.`)
  }

  // notify all websocket connections that there's a database change
  connections.push(transaction, userId)

  // broadcast transaction to all peers so they also push to their connected clients
  peers.broadcast(transaction, userId)

  return transaction['sequence-no']
}

const rollbackAttempt = async function (transaction, ddbClient) {
  const rollbackParams = {
    TableName: setup.transactionsTableName,
    Item: {
      'database-id': transaction['database-id'],
      'sequence-no': transaction['sequence-no'],
      'command': 'Rollback',
      'creation-date': new Date().toISOString()
    },
    ConditionExpression: 'attribute_not_exists(#databaseId)',
    ExpressionAttributeNames: {
      '#databaseId': 'database-id'
    }
  }

  try {
    await ddbClient.put(rollbackParams).promise()
  } catch (e) {
    throw new Error(`Failed to rollback with ${e}.`)
  }
}

exports.doCommand = async function (command, userId, connectionId, dbNameHash, databaseId, key, record) {
  if (!dbNameHash) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database name hash')
  if (!databaseId) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database id')
  if (!key) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing item key')
  if (!record) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing record')

  if (!connections.isDatabaseOpen(userId, connectionId, databaseId)) {
    return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Database not open')
  }

  const transaction = {
    'database-id': databaseId,
    key,
    command,
    record
  }

  try {
    const sequenceNo = await putTransaction(transaction, userId, databaseId)
    return responseBuilder.successResponse({ sequenceNo })
  } catch (e) {
    const message = `Failed to ${command}`
    const logChildObject = { userId, databaseId, command, connectionId }

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).info(message)
      return responseBuilder.errorResponse(e.status, e.error)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).warn(message)
      return responseBuilder.errorResponse(statusCode, message)
    }
  }
}

exports.batchTransaction = async function (userId, connectionId, dbNameHash, databaseId, operations) {
  if (!dbNameHash) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database name hash')
  if (!databaseId) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database id')
  if (!operations || !operations.length) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing operations')

  if (operations.length > MAX_OPERATIONS_IN_TX) return responseBuilder.errorResponse(statusCodes['Bad Request'], {
    error: 'OperationsExceedLimit',
    limit: MAX_OPERATIONS_IN_TX
  })

  if (!connections.isDatabaseOpen(userId, connectionId, databaseId)) {
    return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Database not open')
  }

  const ops = []
  for (let i = 0; i < operations.length; i++) {
    const operation = operations[i]
    const key = operation.itemKey
    const record = operation.encryptedItem
    const command = operation.command

    if (!key) return responseBuilder.errorResponse(statusCodes['Bad Request'], `Operation ${i} missing item key`)
    if (!record) return responseBuilder.errorResponse(statusCodes['Bad Request'], `Operation ${i} missing record`)
    if (!command) return responseBuilder.errorResponse(statusCodes['Bad Request'], `Operation ${i} missing command`)

    ops.push({
      key,
      record,
      command
    })
  }

  try {
    const command = 'BatchTransaction'

    const transaction = {
      'database-id': databaseId,
      command,
      operations: ops
    }

    const sequenceNo = await putTransaction(transaction, userId, databaseId)
    return responseBuilder.successResponse({ sequenceNo })
  } catch (e) {
    const message = 'Failed to batch transaction'
    const logChildObject = { userId, databaseId, connectionId }

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).info(message)
      return responseBuilder.errorResponse(e.status, e.error)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).warn(message)
      return responseBuilder.errorResponse(statusCode, message)
    }
  }
}

exports.bundleTransactionLog = async function (userId, connectionId, databaseId, seqNo, bundle) {
  const bundleSeqNo = Number(seqNo)

  if (!bundleSeqNo) {
    return responseBuilder.errorResponse(statusCodes['Bad Request'], `Missing bundle sequence number`)
  }

  try {
    if (!connections.isDatabaseOpen(userId, connectionId, databaseId)) {
      return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Database not open')
    }

    const database = await findDatabaseByDatabaseId(databaseId)
    if (!database) return responseBuilder.errorResponse(statusCodes['Not Found'], 'Database not found')

    const lastBundleSeqNo = database['bundle-seq-no']
    if (lastBundleSeqNo >= bundleSeqNo) {
      return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Bundle sequence no must be greater than current bundle')
    }

    const dbStateParams = {
      Bucket: setup.getDbStatesBucketName(),
      Key: getS3DbStateKey(databaseId, bundleSeqNo),
      Body: bundle
    }

    logger.info(`Uploading db ${databaseId}'s state to S3 at bundle seq no ${bundleSeqNo}...`)
    const s3 = setup.s3()
    await s3.upload(dbStateParams).promise()

    const bundleParams = {
      TableName: setup.databaseTableName,
      Key: {
        'database-id': databaseId
      },
      UpdateExpression: 'set #bundleSeqNo = :bundleSeqNo',
      ConditionExpression: '(attribute_not_exists(#bundleSeqNo) or #bundleSeqNo < :bundleSeqNo)',
      ExpressionAttributeNames: {
        '#bundleSeqNo': 'bundle-seq-no',
      },
      ExpressionAttributeValues: {
        ':bundleSeqNo': bundleSeqNo,
      }
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.update(bundleParams).promise()

    logger.info(`Set bundle sequence number ${bundleSeqNo} on database ${databaseId}...`)

    return responseBuilder.successResponse({})
  } catch (e) {
    logger.error(`Failed to bundle database ${databaseId} at sequence number ${bundleSeqNo} with ${e}`)
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], 'Failed to bundle')
  }
}

exports.getBundle = async function (databaseId, bundleSeqNo) {
  if (!bundleSeqNo) {
    return responseBuilder.errorResponse(statusCodes['Bad Request'], `Missing bundle sequence number`)
  }

  try {
    const params = {
      Bucket: setup.getDbStatesBucketName(),
      Key: getS3DbStateKey(databaseId, bundleSeqNo)
    }
    const s3 = setup.s3()

    try {
      const result = await s3.getObject(params).promise()
      return result.Body.toString()
    } catch (e) {
      const statusCode = e.statusCode
      const error = e.message

      return statusCode === 404 && error === 'Not Found'
        ? responseBuilder.errorResponse(statusCodes['Not Found'], `Failed to query db state with ${error}`)
        : responseBuilder.errorResponse(statusCodes['Internal Server Error'], `Failed to query db state with ${error}`)
    }

  } catch (e) {
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], `Failed to query db state with ${e}`)
  }
}

const _validateShareDatabase = async function (sender, dbId, dbNameHash, recipientUsername, readOnly) {
  const [database, senderUserDb, recipient] = await Promise.all([
    findDatabaseByDatabaseId(dbId),
    _getUserDatabase(sender['user-id'], dbNameHash),
    userController.getUser(sender['app-id'], recipientUsername)
  ])

  if (!database || !senderUserDb || senderUserDb['database-id'] !== dbId) throw {
    status: statusCodes['Not Found'],
    error: { message: 'DatabaseNotFound' }
  }

  if (!recipient || recipient['deleted']) throw {
    status: statusCodes['Not Found'],
    error: { message: 'UserNotFound' }
  }

  if (sender['user-id'] === recipient['user-id']) throw {
    status: statusCodes['Conflict'],
    error: { message: 'SharingWithSelfNotAllowed' }
  }

  if (database['owner-id'] !== sender['user-id'] && !senderUserDb['resharing-allowed']) throw {
    status: statusCodes['Forbidden'],
    error: { message: 'ResharingNotAllowed' }
  }

  if (readOnly !== undefined && database['owner-id'] !== sender['user-id'] && senderUserDb['read-only'] && !readOnly) throw {
    status: statusCodes['Forbidden'],
    error: { message: 'ResharingWithWriteAccessNotAllowed' }
  }

  const recipientUserDb = await _getUserDatabaseByUserIdAndDatabaseId(recipient['user-id'], senderUserDb['database-id'])

  return { recipient, database, recipientUserDb }
}

const _buildSharedUserDatabaseParams = (userId, dbId, readOnly, resharingAllowed, senderId, wrappedDbKey, ephemeralPublicKey, signedEphemeralPublicKey,
  ecdsaPublicKey, sentSignature, recipientEcdsaPublicKey) => {
  // user will only be able to open the database using database ID. Only requirement is that this value is unique
  const placeholderDbNameHash = '__userbase_shared_database_' + uuidv4()

  // user must get the database within 24 hours or it will be deleted
  const expirationDate = Date.now() + MS_IN_A_DAY

  return {
    TableName: setup.userDatabaseTableName,
    Item: {
      'user-id': userId,
      'database-name-hash': placeholderDbNameHash,
      'database-id': dbId,
      'read-only': readOnly,
      'resharing-allowed': resharingAllowed,
      'wrapped-db-key': wrappedDbKey,
      'ephemeral-public-key': ephemeralPublicKey,
      'signed-ephemeral-public-key': signedEphemeralPublicKey,
      'sender-ecdsa-public-key': ecdsaPublicKey,
      'sent-signature': sentSignature,
      'sender-id': senderId,
      'recipient-ecdsa-public-key': recipientEcdsaPublicKey,
      ttl: getTtl(expirationDate),
    },
    ConditionExpression: 'attribute_not_exists(#userId)',
    ExpressionAttributeNames: {
      '#userId': 'user-id',
    }
  }
}

exports.shareDatabase = async function (logChildObject, sender, dbId, dbNameHash, recipientUsername, readOnly, resharingAllowed,
  wrappedDbKey, ephemeralPublicKey, signedEphemeralPublicKey, sentSignature, recipientEcdsaPublicKey
) {
  try {
    if (typeof readOnly !== 'boolean') throw {
      status: statusCodes['Bad Request'],
      error: { message: 'ReadOnlyMustBeBoolean' }
    }

    if (typeof resharingAllowed !== 'boolean') throw {
      status: statusCodes['Bad Request'],
      error: { message: 'ResharingAllowedMustBeBoolean' }
    }

    const { recipient, database, recipientUserDb } = await _validateShareDatabase(sender, dbId, dbNameHash, recipientUsername, readOnly, resharingAllowed)

    if (recipientUserDb) throw {
      status: statusCodes['Conflict'],
      error: { message: 'DatabaseAlreadyShared' }
    }

    const recipientUserDbParams = _buildSharedUserDatabaseParams(recipient['user-id'], database['database-id'], readOnly, resharingAllowed, sender['user-id'], wrappedDbKey,
      ephemeralPublicKey, signedEphemeralPublicKey, sender['ecdsa-public-key'], sentSignature, recipientEcdsaPublicKey)

    const ddbClient = connection.ddbClient()
    await ddbClient.put(recipientUserDbParams).promise()

    return responseBuilder.successResponse('Success!')
  } catch (e) {
    logChildObject.err = e

    if (e.status && e.error) {
      return responseBuilder.errorResponse(e.status, e.error)
    } else {
      return responseBuilder.errorResponse(statusCodes['Internal Server Error'], 'Failed to share database')
    }
  }
}

exports.saveDatabase = async function (logChildObject, user, dbNameHash, encryptedDbKey, receivedSignature) {
  try {
    const params = {
      TableName: setup.userDatabaseTableName,
      Key: {
        'user-id': user['user-id'],
        'database-name-hash': dbNameHash,
      },
      UpdateExpression: 'SET #encryptedDbKey = :encryptedDbKey, #receivedSignature = :receivedSignature'
        + ' REMOVE #ttl, #wrappedDbKey, #ephemeralPublicKey, #signedEphemeralPublicKey',
      ExpressionAttributeNames: {
        '#encryptedDbKey': 'encrypted-db-key',
        '#receivedSignature': 'received-signature',
        '#ttl': 'ttl',
        '#wrappedDbKey': 'wrapped-db-key',
        '#ephemeralPublicKey': 'ephemeral-public-key',
        '#signedEphemeralPublicKey': 'signed-ephemeral-public-key',
      },
      ExpressionAttributeValues: {
        ':encryptedDbKey': encryptedDbKey,
        ':receivedSignature': receivedSignature,
      }
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.update(params).promise()

    return responseBuilder.successResponse('Success!')
  } catch (e) {
    logChildObject.err = e

    if (e.status && e.error) {
      return responseBuilder.errorResponse(e.status, e.error)
    } else {
      return responseBuilder.errorResponse(statusCodes['Internal Server Error'], 'Failed to save database')
    }
  }
}

exports.modifyDatabasePermissions = async function (logChildObject, sender, dbId, dbNameHash, recipientUsername, readOnly, resharingAllowed, revoke) {
  try {
    const { recipientUserDb, database } = await _validateShareDatabase(sender, dbId, dbNameHash, recipientUsername, readOnly)

    if (recipientUserDb && recipientUserDb['user-id'] === database['owner-id']) throw {
      status: statusCodes['Forbidden'],
      error: { message: 'CannotModifyOwnerPermissions' }
    }

    const params = {
      TableName: setup.userDatabaseTableName,
      Key: {
        'user-id': recipientUserDb['user-id'],
        'database-name-hash': recipientUserDb['database-name-hash'],
      },
    }

    if (revoke) {
      // only need to delete if recipient has access to database
      if (recipientUserDb) {
        const ddbClient = connection.ddbClient()
        await ddbClient.delete(params).promise()
      }

    } else {
      if (readOnly === undefined && resharingAllowed === undefined) throw {
        status: statusCodes['Bad Request'],
        error: { message: 'ParamsMissing' }
      }

      if (!recipientUserDb) throw {
        status: statusCodes['Not Found'],
        error: { message: 'DatabaseNotFound' }
      }

      params.UpdateExpression = ''
      params.ExpressionAttributeNames = {}
      params.ExpressionAttributeValues = {}

      if (readOnly !== undefined) {
        if (typeof readOnly !== 'boolean') throw {
          status: statusCodes['Bad Request'],
          error: { message: 'ReadOnlyMustBeBoolean' }
        }

        // only update if necessary
        if (readOnly !== recipientUserDb['read-only']) {
          params.UpdateExpression += 'SET #readOnly = :readOnly'
          params.ExpressionAttributeNames['#readOnly'] = 'read-only'
          params.ExpressionAttributeValues[':readOnly'] = readOnly
        }
      }

      if (resharingAllowed !== undefined) {
        if (typeof resharingAllowed !== 'boolean') throw {
          status: statusCodes['Bad Request'],
          error: { message: 'ResharingAllowedMustBeBoolean' }
        }

        // only update if necessary
        if (resharingAllowed !== recipientUserDb['resharing-allowed']) {
          params.UpdateExpression += (params.UpdateExpression ? ', ' : 'SET ') + '#resharingAllowed = :resharingAllowed'
          params.ExpressionAttributeNames['#resharingAllowed'] = 'resharing-allowed'
          params.ExpressionAttributeValues[':resharingAllowed'] = resharingAllowed
        }
      }

      // only need to update if necessary
      if (params.UpdateExpression) {
        const ddbClient = connection.ddbClient()
        await ddbClient.update(params).promise()
      }
    }

    return responseBuilder.successResponse('Success!')
  } catch (e) {
    logChildObject.err = e

    if (e.status && e.error) {
      return responseBuilder.errorResponse(e.status, e.error)
    } else {
      return responseBuilder.errorResponse(statusCodes['Internal Server Error'], 'Failed to modify database permissions')
    }
  }
}
