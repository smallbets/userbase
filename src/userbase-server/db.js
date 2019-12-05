import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import responseBuilder from './responseBuilder'
import memcache from './memcache'
import connections from './ws'
import logger from './logger'
import userController from './user'

const MAX_OPERATIONS_IN_TX = 10

const getS3DbStateKey = (databaseId, bundleSeqNo) => `${databaseId}/${bundleSeqNo}`

const createDatabase = async function (userId, dbNameHash, dbId, encryptedDbName, encryptedDbKey) {
  try {
    const user = await userController.getUserByUserId(userId)
    if (!user || user['deleted']) throw new Error('UserNotFound')

    memcache.initTransactionLog(dbId)

    const database = {
      'database-id': dbId,
      'owner-id': userId,
      'database-name': encryptedDbName
    }

    const userDatabase = {
      'user-id': userId,
      'database-name-hash': dbNameHash,
      'database-id': dbId,
      'encrypted-db-key': encryptedDbKey,
    }

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
        Put: {
          TableName: setup.userDatabaseTableName,
          Item: userDatabase,
          ConditionExpression: 'attribute_not_exists(#userId)',
          ExpressionAttributeNames: {
            '#userId': 'user-id',
          }
        }
      }]
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.transactWrite(params).promise()

    return { ...database, ...userDatabase }
  } catch (e) {

    if (e.message) {
      if (e.message.includes('UserNotFound')) {
        return responseBuilder.errorResponse(statusCodes['Conflict'], 'UserNotFound')
      } else if (e.message.includes('ConditionalCheckFailed')) {
        return responseBuilder.errorResponse(statusCodes['Conflict'], 'Database already exists')
      } else if (e.message.includes('TransactionConflict')) {
        return responseBuilder.errorResponse(statusCodes['Conflict'], 'Database already creating')
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

const getDatabase = async function (userId, dbNameHash) {
  const userDatabaseParams = {
    TableName: setup.userDatabaseTableName,
    Key: {
      'user-id': userId,
      'database-name-hash': dbNameHash
    }
  }

  const ddbClient = connection.ddbClient()
  const userDbResponse = await ddbClient.get(userDatabaseParams).promise()
  if (!userDbResponse || !userDbResponse.Item) return null

  const userDb = userDbResponse.Item
  const dbId = userDb['database-id']

  const database = await findDatabaseByDatabaseId(dbId)
  if (!database) return null

  return { ...userDb, ...database }
}

exports.openDatabase = async function (userId, connectionId, dbNameHash, newDatabaseParams) {
  if (!dbNameHash) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database name hash')
  if (!newDatabaseParams) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing new database params')

  const newDbId = newDatabaseParams.dbId
  const { encryptedDbName, encryptedDbKey } = newDatabaseParams
  if (!newDbId) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database id')
  if (!encryptedDbName) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database name')
  if (!encryptedDbKey) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database key')

  try {
    let database
    try {
      database = await getDatabase(userId, dbNameHash) || await createDatabase(userId, dbNameHash, newDbId, encryptedDbName, encryptedDbKey)
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

    if (connections.openDatabase(userId, connectionId, dbId, bundleSeqNo, dbNameHash, dbKey)) {
      return responseBuilder.successResponse('Success!')
    } else {
      throw new Error('Unable to open database')
    }
  } catch (e) {
    logger.error(`Failed to open database for user ${userId} with ${e}`)
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], 'Failed to open database')
  }
}

/**
 * Attempts to rollback a transaction that has not persisted to DDB
 * yet. Does not return anything because the caller does not need to
 * know whether or not this succeeds.
 *
 * @param {*} transaction
 */
const rollbackTransaction = async function (transaction) {
  const transactionWithRollbackCommand = {
    'database-id': transaction['database-id'],
    'sequence-no': transaction['sequence-no'],
    'item-id': transaction['item-id'],
    command: 'rollback'
  }

  const rollbackTransactionParams = {
    TableName: setup.transactionsTableName,
    Item: transactionWithRollbackCommand,
    // if database id + seq no does not exist, insert
    // if it already exists and command is rollback, overwrite
    // if it already exists and command isn't rollback, fail with ConditionalCheckFailedException
    ConditionExpression: 'attribute_not_exists(#databaseId) or command = :command',
    ExpressionAttributeNames: {
      '#databaseId': 'database-id',
    },
    ExpressionAttributeValues: {
      ':command': 'rollback',
    }
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.put(rollbackTransactionParams).promise()

    memcache.transactionRolledBack(transactionWithRollbackCommand)
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      // This is good -- must have been persisted to disk because it exists and was not rolled back
      memcache.transactionPersistedToDdb(transaction)
      logger.info('Failed to rollback -- transaction already persisted to disk')
    } else {
      // No need to throw, can fail gracefully and log error
      logger.warn(`Failed to rollback with ${e}`)
    }
  }
}

exports.rollbackTransaction = rollbackTransaction

const putTransaction = async function (transaction, userId, dbNameHash, databaseId) {
  const [user, database] = await Promise.all([
    userController.getUserByUserId(userId),
    getDatabase(userId, dbNameHash)
  ])

  if (!user || user['deleted']) throw new Error('UserNotFound')
  if (!database) throw new Error('DatabaseNotFound')
  if (database['read-only']) throw new Error('DatabaseIsReadOnly')

  const transactionWithSequenceNo = memcache.pushTransaction(transaction)

  const params = {
    TableName: setup.transactionsTableName,
    Item: transactionWithSequenceNo,
    ConditionExpression: 'attribute_not_exists(#databaseId)',
    ExpressionAttributeNames: {
      '#databaseId': 'database-id'
    }
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.put(params).promise()

    memcache.transactionPersistedToDdb(transactionWithSequenceNo)
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      memcache.transactionCancelled(transactionWithSequenceNo)
    } else {
      logger.warn(`Transaction ${transactionWithSequenceNo['sequence-no']} failed for user ${userId} on db ${databaseId} with ${e}! Rolling back...`)
      rollbackTransaction(transactionWithSequenceNo)
    }

    throw new Error(`Failed with ${e}.`)
  }

  connections.push(transaction['database-id'], userId)

  return transactionWithSequenceNo['sequence-no']
}

exports.doCommand = async function (command, userId, dbNameHash, databaseId, key, record) {
  if (!dbNameHash) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database name hash')
  if (!databaseId) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database id')
  if (!key) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing item key')
  if (!record) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing record')

  const transaction = {
    'database-id': databaseId,
    key,
    command,
    record
  }

  try {
    const sequenceNo = await putTransaction(transaction, userId, dbNameHash, databaseId)
    return responseBuilder.successResponse({ sequenceNo })
  } catch (e) {
    if (e.message === 'UserNotFound') return responseBuilder.errorResponse(statusCodes['Not Found'], 'UserNotFound')
    else if (e.message === 'DatabaseNotFound') return responseBuilder.errorResponse(statusCodes['Not Found'], 'DatabaseNotFound')
    else if (e.message === 'DatabaseIsReadOnly') return responseBuilder.errorResponse(statusCodes['Unauthorized'], 'DatabaseIsReadOnly')

    logger.warn(`Failed command ${command} for user ${userId} with ${e}`)
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], `Failed to ${command}`)
  }
}

exports.batchTransaction = async function (userId, dbNameHash, databaseId, operations) {
  if (!dbNameHash) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database name hash')
  if (!databaseId) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database id')
  if (!operations || !operations.length) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing operations')

  if (operations.length > MAX_OPERATIONS_IN_TX) return responseBuilder.errorResponse(statusCodes['Bad Request'], {
    error: 'OperationsExceedLimit',
    limit: MAX_OPERATIONS_IN_TX
  })

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

    const sequenceNo = await putTransaction(transaction, userId, dbNameHash, databaseId)
    return responseBuilder.successResponse({ sequenceNo })
  } catch (e) {
    if (e.message === 'UserNotFound') return responseBuilder.errorResponse(statusCodes['Not Found'], 'UserNotFound')
    else if (e.message === 'DatabaseNotFound') return responseBuilder.errorResponse(statusCodes['Not Found'], 'DatabaseNotFound')
    else if (e.message === 'DatabaseIsReadOnly') return responseBuilder.errorResponse(statusCodes['Unauthorized'], 'DatabaseIsReadOnly')

    logger.warn(`Failed batch transaction for user ${userId} with ${e}`)
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], 'Failed to batch transaction')
  }
}

exports.bundleTransactionLog = async function (databaseId, seqNo, bundle) {
  const bundleSeqNo = Number(seqNo)

  if (!bundleSeqNo && bundleSeqNo !== 0) {
    return responseBuilder.errorResponse(statusCodes['Bad Request'], `Missing bundle sequence number`)
  }

  try {
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

    logger.info('Setting bundle sequence number on user...')

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

    memcache.setBundleSeqNo(databaseId, bundleSeqNo)

    return responseBuilder.successResponse({})
  } catch (e) {

    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], `Failed to bundle with ${e}`)
  }
}

exports.getBundle = async function (databaseId, bundleSeqNo) {
  if (!bundleSeqNo && bundleSeqNo !== 0) {
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
