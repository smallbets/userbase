import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import memcache from './memcache'
import userController from './user'

const getS3DbStateKey = (userId, bundleSeqNo) => `${userId}/${bundleSeqNo}`

const ONE_KB = 1024
const ONE_MB = ONE_KB * 1024

// DynamoDB single item limit: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Limits.html#limits-items
const FOUR_HUNDRED_KB = 400 * ONE_KB

const BATCH_SIZE_LIMIT = 10 * ONE_MB

const rollbackTransaction = async function (transaction) {
  const rollbackTransactionParams = {
    TableName: setup.databaseTableName,
    Item: {
      'user-id': transaction['user-id'],
      'sequence-no': transaction['sequence-no'],
      'item-id': transaction['item-id'],
      command: 'rollback'
    },
    // if this user id + seq no does not exist, insert
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

    memcache.transactionRolledBack(transaction)
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      // This is good -- must have been persisted to disk because it exists and was not rolled back
      memcache.transactionPersistedToDisk(transaction)
      console.log('Failed to rollback -- transaction already persisted to disk')
    } else {
      console.warn(`Failed to rollback with ${e}`)
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

    memcache.transactionPersistedToDisk(transactionWithSequenceNo)
  } catch (e) {

    console.log(`Transaction failed with ${e}! Rolling back...`)
    await rollbackTransaction(transactionWithSequenceNo)

    throw new Error(`Failed with ${e}. Transaction rolled back.`)
  }

  return {
    'item-id': transaction['item-id'],
    'sequence-no': transactionWithSequenceNo['sequence-no'],
    command: transaction.command
  }
}

exports.insert = async function (req, res) {
  const userId = res.locals.userId
  const itemId = req.query.itemId

  if (req.readableLength > FOUR_HUNDRED_KB) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Encrypted blob is too large' })

  if (!itemId) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing item id' })

  try {
    // Warning: if the server receives many large simultaneous requests, memory could fill up here.
    // The solution to this is to read the buffer in small chunks and pipe the chunks to
    // S3 and store the S3 URL in DynamoDB.
    const buffer = req.read()

    const command = 'Insert'

    const transaction = {
      'user-id': userId,
      'item-id': itemId,
      command,
      record: buffer
    }

    const result = await putTransaction(transaction)
    return res.send(result)
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to insert with ${e}` })
  }
}

exports.delete = async function (req, res) {
  const userId = res.locals.userId
  const itemId = req.body.itemId

  if (!itemId) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: `Missing item id` })

  try {
    const command = 'Delete'

    const transaction = {
      'user-id': userId,
      'item-id': itemId,
      command
    }

    const result = await putTransaction(res, transaction)
    return result
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to delete with ${e}` })
  }
}

exports.update = async function (req, res) {
  const userId = res.locals.userId
  const itemId = req.query.itemId

  if (req.readableLength > FOUR_HUNDRED_KB) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Encrypted blob is too large' })

  if (!itemId) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing item id' })

  try {

    // Warning: if the server receives many large simultaneous requests, memory could fill up here.
    // The solution to this is to read the buffer in small chunks and pipe the chunks to
    // S3 and store the S3 URL in DynamoDB.
    const buffer = req.read()

    const command = 'Update'

    const transaction = {
      'user-id': userId,
      'item-id': itemId,
      command,
      record: buffer,
    }

    const result = await putTransaction(transaction)
    return res.send(result)
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to update with ${e}` })
  }
}

exports.queryTransactionLog = async function (req, res) {
  const userId = res.locals.userId

  try {
    const bundleSeqNo = memcache.getBundleSeqNo(userId)

    const startingSeqNo = memcache.getStartingSeqNo(bundleSeqNo)

    const transactionLog = memcache.getTransactions(userId, startingSeqNo)

    res.set('bundle-seq-no', bundleSeqNo)

    return res.send(transactionLog)
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to query db state with ${e}` })
  }
}

exports.queryDbState = async function (req, res) {
  const userId = res.locals.userId
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

exports.batchInsert = async function (req, res) {
  const userId = res.locals.userId
  const itemsMetadata = req.query.itemsMetadata

  if (req.readableLength > BATCH_SIZE_LIMIT) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: `Batch of encrypted records cannot be larger than ${BATCH_SIZE_LIMIT} MB` })

  if (!itemsMetadata || itemsMetadata.length === 0) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing items metadata' })

  try {
    const insertPromises = itemsMetadata.map((itemMetadataStr, i) => {
      const itemMetadata = JSON.parse(itemMetadataStr)

      const byteLength = itemMetadata.byteLength
      const itemId = itemMetadata.itemId

      if (!byteLength) return res
        .status(statusCodes['Bad Request'])
        .send({ readableMessage: `Item ${i} missing buffer byte length` })

      if (byteLength > FOUR_HUNDRED_KB) return res
        .status(statusCodes['Bad Request'])
        .send({ readableMessage: `Item ${i} encrypted blob is too large` })

      if (!itemId) return res
        .status(statusCodes['Bad Request'])
        .send({ readableMessage: `Item ${i} missing item id` })

      // Warning: if the server receives many large simultaneous requests, memory could fill up here.
      // The solution to this is to read the buffer in small chunks and pipe the chunks to
      // S3 and store the S3 URL in DynamoDB.
      const buffer = req.read(byteLength)

      const transaction = {
        'user-id': userId,
        'item-id': itemId,
        command: 'Insert',
        record: buffer
      }

      return putTransaction(transaction)
    })

    const result = await Promise.all(insertPromises)
    return res.send(result)
  } catch (e) {
    console.log(e)
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to batch insert with ${e}` })
  }
}

exports.batchUpdate = async function (req, res) {
  const userId = res.locals.userId
  const updatedItemsMetadata = req.query.updatedItemsMetadata

  if (req.readableLength > BATCH_SIZE_LIMIT) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: `Batch of encrypted records cannot be larger than ${BATCH_SIZE_LIMIT} MB` })

  if (!updatedItemsMetadata || updatedItemsMetadata.length === 0) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing metadata for updated records' })

  try {
    const updatePromises = updatedItemsMetadata.map((updatedItemsMetadataStr, i) => {
      const updatedItemMetadata = JSON.parse(updatedItemsMetadataStr)

      const byteLength = updatedItemMetadata.byteLength
      const itemId = updatedItemMetadata['itemId']

      if (!byteLength) return res
        .status(statusCodes['Bad Request'])
        .send({ readableMessage: `Item ${i} missing buffer byte length` })

      if (byteLength > FOUR_HUNDRED_KB) return res
        .status(statusCodes['Bad Request'])
        .send({ readableMessage: `Item ${i} encrypted blob is too large` })

      if (!itemId) return res
        .status(statusCodes['Bad Request'])
        .send({ readableMessage: `Item ${i} missing item id` })

      // Warning: if the server receives many large simultaneous requests, memory could fill up here.
      // The solution to this is to read the buffer in small chunks and pipe the chunks to
      // S3 and store the S3 URL in DynamoDB.
      const buffer = req.read(byteLength)

      const transaction = {
        'user-id': userId,
        'item-id': itemId,
        command: 'Update',
        record: buffer,
      }

      return putTransaction(transaction)
    })

    const result = await Promise.all(updatePromises)
    return res.send(result)
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to batch update with ${e}` })
  }
}

exports.batchDelete = async function (req, res) {
  const itemIds = req.body.itemIds
  const userId = res.locals.userId

  if (!itemIds || itemIds.length === 0) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing item ids to delete' })

  const MAX_DELETIONS = 100
  if (itemIds.length > MAX_DELETIONS) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: `Cannot exceed ${MAX_DELETIONS} deletes` })

  try {
    const deletePromises = itemIds.map(itemId => {
      const transaction = {
        'user-id': userId,
        'item-id': itemId,
        command: 'Delete',
      }

      return putTransaction(transaction)
    })

    const result = await Promise.all(deletePromises)
    return res.send(result)
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to batch delete with ${e}` })
  }
}

exports.bundleTransactionLog = async function (req, res) {
  const userId = res.locals.userId
  const bundleSeqNo = req.query.bundleSeqNo

  if (!bundleSeqNo) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing bundle sequence number' })

  try {
    const user = await userController.findUserByUserId(userId)
    if (user.bundleSeqNo >= bundleSeqNo) return res
      .status(statusCodes['Bad Request'])
      .send({ readableMessage: 'Bundle sequence no must be greater than current bundle' })

    const dbStateParams = {
      Bucket: setup.dbStatesBucketName,
      Key: getS3DbStateKey(userId, bundleSeqNo),
      Body: req
    }

    console.log('Uploading db state to S3...')
    const s3 = setup.s3()
    await s3.upload(dbStateParams).promise()

    console.log('Setting bundle sequence number on user...')
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

    return res.send('Success!')
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to flush db state with ${e}` })
  }
}
