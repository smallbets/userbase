import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import memcache from './memcache'
import lock from './lock'
import connections from './ws'
import logger from './logger'

const getS3DbStateKey = (userId, bundleSeqNo) => `${userId}/${bundleSeqNo}`

const ONE_KB = 1024
const ONE_MB = ONE_KB * 1024

// DynamoDB single item limit: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Limits.html#limits-items
const FOUR_HUNDRED_KB = 400 * ONE_KB

const BATCH_SIZE_LIMIT = 10 * ONE_MB

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

exports.delete = async function (userId, itemId) {
  if (!itemId) return _errorResponse(statusCodes['Bad Request'], 'Missing item id')

  try {
    const command = 'Delete'

    const transaction = {
      'user-id': userId,
      'item-id': itemId,
      command
    }

    const sequenceNo = await putTransaction(transaction)
    return _successResponse({ sequenceNo })
  } catch (e) {
    return _errorResponse(statusCodes['Internal Server Error'], `Failed to delete with ${e}`)
  }
}

exports.update = async function (userId, itemId, item) {
  if (!itemId) return _errorResponse(statusCodes['Bad Request'], 'Missing item id')

  try {
    const command = 'Update'

    const transaction = {
      'user-id': userId,
      'item-id': itemId,
      command,
      record: item
    }

    const sequenceNo = await putTransaction(transaction)
    return _successResponse({ sequenceNo })
  } catch (e) {
    return _errorResponse(statusCodes['Internal Server Error'], `Failed to update with ${e}`)
  }
}

exports.queryTransactionLog = async function (req, res) {
  const userId = res.locals.user['user-id']
  let startingSeqNo = req.query.startingSeqNo || 0

  try {
    const bundleSeqNo = memcache.getBundleSeqNo(userId)

    const userShouldAlsoQueryForBundle = startingSeqNo <= bundleSeqNo
    if (userShouldAlsoQueryForBundle) {
      res.set('bundle-seq-no', bundleSeqNo)
      startingSeqNo = memcache.getStartingSeqNo(bundleSeqNo)
    }

    const transactionLog = memcache.getTransactions(userId, startingSeqNo)

    return res.send(transactionLog)
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to query db state with ${e}` })
  }
}

exports.queryDbState = async function (req, res) {
  const userId = res.locals.user['user-id']
  const bundleSeqNo = req.query.bundleSeqNo

  if (!bundleSeqNo && bundleSeqNo !== 0) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Must include bundle sequence no' })

  try {
    const params = {
      Bucket: setup.dbStatesBucketName,
      Key: getS3DbStateKey(userId, bundleSeqNo)
    }
    const s3 = setup.s3()

    s3.getObject(params)
      .on('httpHeaders', function (statusCode, headers, response, error) {

        if (statusCode < 300) {
          res.set('Content-Length', headers['content-length'])
          res.set('Content-Type', headers['content-type'])

          const stream = this.response.httpResponse.createUnbufferedStream()

          stream.pipe(res)
        } else {
          return statusCode === 404 && error === 'Not Found'
            ? res
              .status(statusCodes['Not Found'])
              .send({ err: `Failed to query db state with ${error}` })
            : res
              .status(statusCode)
              .send({ err: `Failed to query db state with ${error}` })
        }
      })
      .send()
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to query db state with ${e}` })
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

    if (!itemId) return _errorResponse(statusCodes['Bad Request'], `Operation ${i} missing item id`)
    if (!command) return _errorResponse(statusCodes['Bad Request'], `Operation ${i} missing command`)

    if (uniqueItemIds[itemId]) return _errorResponse(statusCodes['Bad Request'], 'Only allowed one operation per item')
    uniqueItemIds[itemId] = true

    const result = {
      'item-id': itemId,
      command
    }

    if (command === 'Insert' || command === 'Update') result.record = encryptedItem

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

exports.acquireBundleTransactionLogLock = function (req, res) {
  const userId = res.locals.user['user-id']

  const newLock = lock.acquireLock(userId)

  if (!newLock) return res
    .status(statusCodes['Unauthorized'])
    .send({ readableMessage: 'Failed to acquire lock' })

  return res.send(newLock.lockId)
}

exports.releaseBundleTransactionLogLock = function (req, res) {
  const userId = res.locals.user['user-id']
  const lockId = req.query.lockId

  if (!lockId) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing lock id' })

  if (!lock.releaseLock(userId, lockId)) return res
    .status(statusCodes['Unauthorized'])
    .send({ readableMessage: 'Caller does not own this lock' })

  return res.send('Success!')
}

exports.bundleTransactionLog = async function (req, res) {
  const user = res.locals.user
  const userId = user['user-id']
  const bundleSeqNo = Number(req.query.bundleSeqNo)
  const lockId = req.query.lockId

  if (!bundleSeqNo) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing bundle sequence number' })

  if (!lockId) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing lock id' })

  try {

    // Warning: this isn't a perfect mutually exclusive lock that only allows this code
    // to execute once at a time. If it takes >= SECONDS_ALLOWED_TO_KEEP_BUNDLE_LOCK
    // for the code after this if statement to finish executing, it's possible the user
    // can acquire a new lock, allowing the user to call the function again and get past
    // this if statement -- even though this function would still continue executing.
    //
    // Note that THIS IS OK because a user can safely call this function twice. This
    // lock is simply an optimization to try to prevent both the client
    // and server from doing extra unnecessary work if possible.
    if (!lock.callerOwnsLock(userId, lockId)) return res
      .status(statusCodes['Unauthorized'])
      .send({ readableMessage: 'Caller does not own this lock' })

    if (user['bundle-seq-no'] >= bundleSeqNo) return res
      .status(statusCodes['Bad Request'])
      .send({ readableMessage: 'Bundle sequence no must be greater than current bundle' })

    const dbStateParams = {
      Bucket: setup.dbStatesBucketName,
      Key: getS3DbStateKey(userId, bundleSeqNo),
      Body: req
    }

    logger.info(`Uploading user ${userId}'s db state to S3 at bundle seq no ${bundleSeqNo}...`)
    const s3 = setup.s3()
    await s3.upload(dbStateParams).promise()

    logger.info('Setting bundle sequence number on user...')
    const username = user.username

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

    lock.releaseLock(userId, lockId)
    logger.info(`Released user ${userId}'s bundle lock ${lockId}...`)

    return res.send('Success!')
  } catch (e) {

    lock.releaseLock(userId, lockId)

    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to flush db state with ${e}` })
  }
}
