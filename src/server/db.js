import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import memcache from './memcache'
import connections from './ws'
import logger from './logger'

const getS3DbStateKey = (userId, bundleSeqNo) => `${userId}/${bundleSeqNo}`

const _errorResponse = (status, data) => ({
  status,
  data
})

const _successResponse = (data) => ({
  status: statusCodes['Success'],
  data
})

/**
 * Attempts to rollback a transaction that has not persisted to DDB
 * yet. Does not return anything because the caller does not need to
 * know whether or not this succeeds.
 *
 * @param {*} transaction
 */
const rollbackTransaction = async function (transaction) {
  const transactionWithRollbackCommand = {
    'user-id': transaction['user-id'],
    'sequence-no': transaction['sequence-no'],
    'item-id': transaction['item-id'],
    command: 'rollback'
  }

  const rollbackTransactionParams = {
    TableName: setup.databaseTableName,
    Item: transactionWithRollbackCommand,
    // if user id + seq no does not exist, insert
    // if it already exists and command is rollback, overwrite
    // if it already exists and command isn't rollback, fail with ConditionalCheckFailedException
    ConditionExpression: 'attribute_not_exists(#userId) or command = :command',
    ExpressionAttributeNames: {
      '#userId': 'user-id',
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

const putTransaction = async function (transaction) {
  const transactionWithSequenceNo = memcache.pushTransaction(transaction)

  const params = {
    TableName: setup.databaseTableName,
    Item: transactionWithSequenceNo,
    ConditionExpression: 'attribute_not_exists(#userId)',
    ExpressionAttributeNames: {
      '#userId': 'user-id'
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

  connections.push(transaction['user-id'])

  return transactionWithSequenceNo['sequence-no']
}

exports.insert = async function (userId, itemId, item) {
  if (!itemId) return _errorResponse(statusCodes['Bad Request'], 'Missing item id')
  if (!item) return _errorResponse(statusCodes['Bad Request'], 'Missing item')

  try {
    const command = 'Insert'

    const transaction = {
      'user-id': userId,
      'item-id': itemId,
      command,
      record: item
    }

    const sequenceNo = await putTransaction(transaction)
    return _successResponse({ sequenceNo })
  } catch (e) {
    return _errorResponse(statusCodes['Internal Server Error'], `Failed to insert with ${e}`)
  }
}

exports.delete = async function (userId, itemId, __v) {
  if (!itemId) return _errorResponse(statusCodes['Bad Request'], 'Missing item id')
  if (!__v) return _errorResponse(statusCodes['Bad Request'], 'Missing version number')

  try {
    const command = 'Delete'

    const transaction = {
      'user-id': userId,
      'item-id': itemId,
      __v,
      command
    }

    const sequenceNo = await putTransaction(transaction)
    return _successResponse({ sequenceNo })
  } catch (e) {
    return _errorResponse(statusCodes['Internal Server Error'], `Failed to delete with ${e}`)
  }
}

exports.update = async function (userId, itemId, item, __v) {
  if (!itemId) return _errorResponse(statusCodes['Bad Request'], 'Missing item id')
  if (!item) return _errorResponse(statusCodes['Bad Request'], 'Missing item')
  if (!__v) return _errorResponse(statusCodes['Bad Request'], 'Missing version number')

  try {
    const command = 'Update'

    const transaction = {
      'user-id': userId,
      'item-id': itemId,
      __v,
      command,
      record: item
    }

    const sequenceNo = await putTransaction(transaction)
    return _successResponse({ sequenceNo })
  } catch (e) {
    return _errorResponse(statusCodes['Internal Server Error'], `Failed to update with ${e}`)
  }
}

exports.batch = async function (userId, operations) {
  if (!operations || !operations.length) return _errorResponse(statusCodes['Bad Request'], 'Missing operations')

  const uniqueItemIds = {}
  const ops = []
  for (let i = 0; i < operations.length; i++) {
    const operation = operations[i]
    const itemId = operation.itemId
    const command = operation.command
    const encryptedItem = operation.encryptedItem
    const __v = operation.__v

    if (!itemId) return _errorResponse(statusCodes['Bad Request'], `Operation ${i} missing item id`)
    if (!command) return _errorResponse(statusCodes['Bad Request'], `Operation ${i} missing command`)
    if ((command === 'Insert' || command === 'Update') && !encryptedItem) {
      return _errorResponse(statusCodes['Bad Request'], `Operation ${i} missing item`)
    }
    if ((command === 'Update' || command === 'Delete') && !__v) {
      return _errorResponse(statusCodes['Bad Request'], `Operation ${i} missing version`)
    }

    if (uniqueItemIds[itemId]) return _errorResponse(statusCodes['Bad Request'], 'Only allowed one operation per item')
    uniqueItemIds[itemId] = true

    const result = {
      'item-id': itemId,
      command
    }

    if (command === 'Insert' || command === 'Update') result.record = encryptedItem
    if (command === 'Update' || command === 'Delete') result.__v = __v

    ops.push(result)
  }

  try {
    const command = 'Batch'

    const transaction = {
      'user-id': userId,
      command,
      operations: ops
    }

    const sequenceNo = await putTransaction(transaction)
    return _successResponse({ sequenceNo })
  } catch (e) {
    return _errorResponse(statusCodes['Internal Server Error'], `Failed to batch with ${e}`)
  }
}

exports.bundleTransactionLog = async function (userId, username, lastBundleSeqNo, seqNo, bundle) {
  const bundleSeqNo = Number(seqNo)

  if (!bundleSeqNo && bundleSeqNo !== 0) {
    return _errorResponse(statusCodes['Bad Request'], `Missing bundle sequence number`)
  }

  try {
    if (lastBundleSeqNo >= bundleSeqNo) {
      return _errorResponse(statusCodes['Bad Request'], 'Bundle sequence no must be greater than current bundle')
    }

    const dbStateParams = {
      Bucket: setup.dbStatesBucketName,
      Key: getS3DbStateKey(userId, bundleSeqNo),
      Body: bundle
    }

    logger.info(`Uploading user ${userId}'s db state to S3 at bundle seq no ${bundleSeqNo}...`)
    const s3 = setup.s3()
    await s3.upload(dbStateParams).promise()

    logger.info('Setting bundle sequence number on user...')

    const bundleParams = {
      TableName: setup.usersTableName,
      Key: {
        'username': username
      },
      UpdateExpression: 'set #bundleSeqNo = :bundleSeqNo',
      ExpressionAttributeNames: {
        '#bundleSeqNo': 'bundle-seq-no',
      },
      ExpressionAttributeValues: {
        ':bundleSeqNo': bundleSeqNo
      }
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.update(bundleParams).promise()

    memcache.setBundleSeqNo(userId, bundleSeqNo)

    return _successResponse({})
  } catch (e) {

    return _errorResponse(statusCodes['Internal Server Error'], `Failed to bundle with ${e}`)
  }
}

exports.getBundle = async function (userId, bundleSeqNo) {
  if (!bundleSeqNo && bundleSeqNo !== 0) {
    return _errorResponse(statusCodes['Bad Request'], `Missing bundle sequence number`)
  }

  try {
    const params = {
      Bucket: setup.dbStatesBucketName,
      Key: getS3DbStateKey(userId, bundleSeqNo)
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
