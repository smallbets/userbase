import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import memcache from './memcache'
import connections from './ws'
import logger from './logger'

const getS3DbStateKey = (databaseId, bundleSeqNo) => `${databaseId}/${bundleSeqNo}`

const _errorResponse = (status, data) => ({
  status,
  data
})

const _successResponse = (data) => ({
  status: statusCodes['Success'],
  data
})

exports.createDatabase = async function (userId, dbNameHash, dbId, encryptedDbName, encryptedDbKey, encryptedMetadata) {
  if (!dbNameHash) return _errorResponse(statusCodes['Bad Request'], 'Missing database name hash')
  if (!dbId) return _errorResponse(statusCodes['Bad Request'], 'Missing database id')
  if (!encryptedDbName) return _errorResponse(statusCodes['Bad Request'], 'Missing database name')
  if (!encryptedDbKey) return _errorResponse(statusCodes['Bad Request'], 'Missing database key')

  const database = {
    'user-id': userId,
    'database-name-hash': dbNameHash,
    'database-id': dbId,
    'database-name': encryptedDbName,
    'database-key': encryptedDbKey,
    metadata: encryptedMetadata
  }

  const params = {
    TableName: setup.databaseTableName,
    Item: database,
    ConditionExpression: 'attribute_not_exists(#userId)',
    ExpressionAttributeNames: {
      '#userId': 'user-id',
    }
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.put(params).promise()

    memcache.initDatabase(dbId)

    return _successResponse('Success!')
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      return _errorResponse(statusCodes['Conflict'], 'Database already exists')
    }
    return _errorResponse(statusCodes['Internal Server Error'], `Failed to create database with ${e}`)
  }
}

exports.getDatabase = async function (userId, dbNameHash) {
  if (!dbNameHash) return _errorResponse(statusCodes['Bad Request'], 'Missing database name hash')

  const params = {
    TableName: setup.databaseTableName,
    Key: {
      'user-id': userId,
      'database-name-hash': dbNameHash
    }
  }

  try {
    const ddbClient = connection.ddbClient()
    const dbResponse = await ddbClient.get(params).promise()

    const database = dbResponse && dbResponse.Item
    if (!database) return _errorResponse(statusCodes['Not Found'], 'Database not found')

    return _successResponse({
      dbId: database['database-id'],
      dbKey: database['database-key'],
      bundleSeqNo: database['bundle-seq-no']
    })
  } catch (e) {
    return _errorResponse(statusCodes['Internal Server Error'], `Failed to create database with ${e}`)
  }
}

exports.openDatabase = async function (userId, connectionId, dbId, bundleSeqNo) {
  try {
    if (connections.openDatabase(userId, connectionId, dbId, bundleSeqNo)) {
      return _successResponse('Success!')
    } else {
      throw new Error(`Unable to open database ${dbId} for user ${userId}`)
    }
  } catch (e) {
    return _errorResponse(statusCodes['Internal Server Error'], `Failed to create database with ${e}`)
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

const putTransaction = async function (transaction, userId) {
  const transactionWithSequenceNo = memcache.pushTransaction(transaction)

  const params = {
    TableName: setup.transactionsTableName,
    Item: transactionWithSequenceNo,
    ConditionExpression: 'attribute_not_exists(#databaseId)',
    ExpressionAttributeNames: {
      '#databaseId': 'database-id'
    },
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.put(params).promise()

    memcache.transactionPersistedToDdb(transactionWithSequenceNo)
  } catch (e) {
    logger.warn(`Transaction ${transactionWithSequenceNo['sequence-no']} failed with ${e}! Rolling back...`)

    rollbackTransaction(transactionWithSequenceNo)

    throw new Error(`Failed with ${e}.`)
  }

  connections.push(transaction['database-id'], userId)

  return transactionWithSequenceNo['sequence-no']
}

exports.doCommand = async function (command, userId, databaseId, key, record) {
  if (!databaseId) return _errorResponse(statusCodes['Bad Request'], 'Missing database id')
  if (!key) return _errorResponse(statusCodes['Bad Request'], 'Missing item key')
  if (!record) return _errorResponse(statusCodes['Bad Request'], 'Missing record')

  const transaction = {
    'database-id': databaseId,
    key,
    command,
    record
  }

  try {
    const sequenceNo = await putTransaction(transaction, userId)
    return _successResponse({ sequenceNo })
  } catch (e) {
    return _errorResponse(statusCodes['Internal Server Error'], `Failed to ${command} with ${e}`)
  }
}

exports.batch = async function (userId, databaseId, operations) {
  if (!databaseId) return _errorResponse(statusCodes['Bad Request'], 'Missing database id')
  if (!operations || !operations.length) return _errorResponse(statusCodes['Bad Request'], 'Missing operations')

  const ops = []
  for (let i = 0; i < operations.length; i++) {
    const operation = operations[i]
    const key = operation.itemKey
    const command = operation.command

    if (!key) return _errorResponse(statusCodes['Bad Request'], `Operation ${i} missing item key`)
    if (!command) return _errorResponse(statusCodes['Bad Request'], `Operation ${i} missing command`)

    const result = {
      key,
      command
    }

    ops.push(result)
  }

  try {
    const command = 'Batch'

    const transaction = {
      'database-id': databaseId,
      command,
      operations: ops
    }

    const sequenceNo = await putTransaction(transaction, userId)
    return _successResponse({ sequenceNo })
  } catch (e) {
    return _errorResponse(statusCodes['Internal Server Error'], `Failed to batch with ${e}`)
  }
}

const findDatabaseByDatabaseId = async function (databaseId) {
  const params = {
    TableName: setup.databaseTableName,
    IndexName: 'DatabaseIdIndex',
    KeyConditionExpression: '#dbId = :dbId',
    ExpressionAttributeNames: {
      '#dbId': 'database-id'
    },
    ExpressionAttributeValues: {
      ':dbId': databaseId
    },
    Select: 'ALL_ATTRIBUTES'
  }

  const ddbClient = connection.ddbClient()
  const databaseResponse = await ddbClient.query(params).promise()

  if (!databaseResponse || databaseResponse.Items.length === 0) return null

  if (databaseResponse.Items.length > 1) {
    console.warn(`Too many databases found with id ${databaseId}`)
  }

  return databaseResponse.Items[0]
}

exports.bundleTransactionLog = async function (userId, databaseId, dbNameHash, seqNo, bundle) {
  const bundleSeqNo = Number(seqNo)

  if (!bundleSeqNo && bundleSeqNo !== 0) {
    return _errorResponse(statusCodes['Bad Request'], `Missing bundle sequence number`)
  }

  try {
    const database = await findDatabaseByDatabaseId(databaseId)
    const lastBundleSeqNo = database['bundle-seq-no']
    if (lastBundleSeqNo >= bundleSeqNo) {
      return _errorResponse(statusCodes['Bad Request'], 'Bundle sequence no must be greater than current bundle')
    }

    const dbStateParams = {
      Bucket: setup.dbStatesBucketName,
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
        'user-id': userId,
        'database-name-hash': dbNameHash
      },
      UpdateExpression: 'set #bundleSeqNo = :bundleSeqNo',
      ConditionExpression: '#bundleSeqNo < :bundleSeqNo and #dbId = :dbId',
      ExpressionAttributeNames: {
        '#bundleSeqNo': 'bundle-seq-no',
        '#dbId': 'database-id'
      },
      ExpressionAttributeValues: {
        ':bundleSeqNo': bundleSeqNo,
        ':dbId': databaseId
      }
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.update(bundleParams).promise()

    memcache.setBundleSeqNo(databaseId, bundleSeqNo)

    return _successResponse({})
  } catch (e) {

    return _errorResponse(statusCodes['Internal Server Error'], `Failed to bundle with ${e}`)
  }
}

exports.getBundle = async function (databaseId, bundleSeqNo) {
  if (!bundleSeqNo && bundleSeqNo !== 0) {
    return _errorResponse(statusCodes['Bad Request'], `Missing bundle sequence number`)
  }

  try {
    const params = {
      Bucket: setup.dbStatesBucketName,
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
        ? _errorResponse(statusCodes['Not Found'], `Failed to query db state with ${error}`)
        : _errorResponse(statusCodes['Internal Server Error'], `Failed to query db state with ${error}`)
    }

  } catch (e) {
    return _errorResponse(statusCodes['Internal Server Error'], `Failed to query db state with ${e}`)
  }
}
