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

// DynamoDB batch write limit: https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchWriteItem.html
const SIXTEEN_MB = 16 * ONE_MB

const MAX_REQUESTS_IN_DDB_BATCH = 25

const putBatch = async function (res, putRequests) {
  const params = {
    RequestItems: {
      [setup.databaseTableName]: putRequests
    }
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.batchWrite(params).promise()

  const result = putRequests.map(pr => {
    const transactionWithSequenceNo = pr.PutRequest.Item
    memcache.transactionPersistedToDisk(transactionWithSequenceNo)
    return {
      'item-id': transactionWithSequenceNo['item-id'],
      'sequence-no': transactionWithSequenceNo['sequence-no'],
      command: transactionWithSequenceNo.command
    }
  })

  return res.send(result)
}

const putTransaction = async function (res, transaction) {
  const transactionWithSequenceNo = memcache.pushTransaction(transaction)

  const params = {
    TableName: setup.databaseTableName,
    Item: transactionWithSequenceNo,
    ConditionExpression: 'attribute_not_exists(#userId)',
    ExpressionAttributeNames: {
      '#userId': 'user-id'
    },
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.put(params).promise()

  memcache.transactionPersistedToDisk(transactionWithSequenceNo)

  return res.send({
    'item-id': transaction['item-id'],
    'sequence-no': transactionWithSequenceNo['sequence-no'],
    command: transaction.command
  })
}

exports.insert = async function (req, res) {
  if (req.readableLength > FOUR_HUNDRED_KB) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Encrypted blob is too large' })

  const userId = res.locals.userId
  const itemId = req.query.itemId

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

    return putTransaction(res, transaction)
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

    return putTransaction(res, transaction)
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to delete with ${e}` })
  }
}

exports.update = async function (req, res) {
  const userId = res.locals.userId
  const itemId = req.query.itemId

  if (!itemId) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing item id' })

  if (req.readableLength > FOUR_HUNDRED_KB) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Encrypted blob is too large' })

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

    return putTransaction(res, transaction)
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
    const params = { Bucket: setup.dbStatesBucketName, Key: getS3DbStateKey(userId, bundleSeqNo) }
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
  if (req.readableLength > SIXTEEN_MB) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Batch of encrypted records cannot be larger than 16 MB' })

  const userId = res.locals.userId
  const itemsMetadata = req.query.itemsMetadata

  if (!itemsMetadata || itemsMetadata.length === 0) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing items metadata' })

  if (itemsMetadata.length > MAX_REQUESTS_IN_DDB_BATCH) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: `Cannot exceed ${MAX_REQUESTS_IN_DDB_BATCH} requests` })

  try {
    const putRequests = []
    for (let i = 0; i < itemsMetadata.length; i++) {
      const itemMetadata = JSON.parse(itemsMetadata[i])

      const byteLength = itemMetadata.byteLength
      const itemId = itemMetadata.itemId

      if (!byteLength) return res
        .status(statusCodes['Bad Request'])
        .send({ readableMessage: `Item ${i} missing buffer byte length` })

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

      const transactionWithSequenceNo = memcache.pushTransaction(transaction)

      putRequests.push({
        PutRequest: {
          Item: transactionWithSequenceNo
        }
      })
    }

    return putBatch(res, putRequests)
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to batch insert with ${e}` })
  }
}

exports.batchUpdate = async function (req, res) {
  if (req.readableLength > SIXTEEN_MB) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Batch of encrypted records cannot be larger than 16 MB' })

  const updatedRecordsMetadata = req.query.updatedRecordsMetadata
  if (!updatedRecordsMetadata || updatedRecordsMetadata.length === 0) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing metadata for updated records' })

  if (updatedRecordsMetadata.length > MAX_REQUESTS_IN_DDB_BATCH) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: `Cannot exceed ${MAX_REQUESTS_IN_DDB_BATCH} requests` })

  const userId = res.locals.userId

  try {
    const putRequests = []
    for (let i = 0; i < updatedRecordsMetadata.length; i++) {
      const updatedRecord = JSON.parse(updatedRecordsMetadata[i])

      const byteLength = updatedRecord.byteLength
      const itemId = updatedRecord['itemId']

      if (!byteLength) return res
        .status(statusCodes['Bad Request'])
        .send({ readableMessage: `Item ${i} missing buffer byte length` })

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

      const transactionWithSequenceNo = memcache.pushTransaction(transaction)

      putRequests.push({
        PutRequest: {
          Item: transactionWithSequenceNo
        }
      })
    }

    return putBatch(res, putRequests)
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to batch update with ${e}` })
  }
}

exports.batchDelete = async function (req, res) {
  const itemIds = req.body.itemIds

  if (!itemIds || itemIds.length === 0) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing item ids to delete' })

  if (itemIds.length > MAX_REQUESTS_IN_DDB_BATCH) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: `Cannot exceed ${MAX_REQUESTS_IN_DDB_BATCH} deletes` })

  const userId = res.locals.userId

  try {
    const putRequests = []
    for (let i = 0; i < itemIds.length; i++) {
      const transaction = {
        'user-id': userId,
        'item-id': itemIds[i],
        command: 'Delete',
      }

      const transactionWithSequenceNo = memcache.pushTransaction(transaction)

      putRequests.push({
        PutRequest: {
          Item: transactionWithSequenceNo
        }
      })
    }

    return putBatch(res, putRequests)
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

    res.send('Success!')
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to flush db state with ${e}` })
  }
}
