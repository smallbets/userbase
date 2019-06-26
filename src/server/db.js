import uuidv4 from 'uuid/v4'
import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import userController from './user'

const ONE_KB = 1024
const ONE_MB = ONE_KB * 1024

// DynamoDB single item limit: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Limits.html#limits-items
const FOUR_HUNDRED_KB = 400 * ONE_KB

// DynamoDB batch write limit: https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchWriteItem.html
const SIXTEEN_MB = 16 * ONE_MB

const MAX_REQUESTS_IN_DDB_BATCH = 25

/**
 * Atomically increments the last sequence no on a user and returns the updated sequence no.
 *
 * Safe to keep this outside a tx because it's ok if there are non-existent ops for a sequence no.
 * For example, assume the user's last sequence no gets set to 5 and then the insert operation fails
 * -- there will be no associated insert operation with sequence no 5. This is ok.
 *
 * @param {String} userId
 * @returns {Number} user's updated last sequence no
 */
const setNextSequenceNo = async function (userId, sequenceNoIncrement) {
  const user = await userController.findUserByUserId(userId)
  const username = user.username

  const atomicIncrementUserSeqNoParams = {
    TableName: setup.usersTableName,
    Key: {
      username: username // if username changes before update is called but after it's found by user id, this will fail
    },
    ExpressionAttributeNames: {
      '#lastSequenceNo': 'last-sequence-no',
      '#userId': 'user-id'
    },
    ExpressionAttributeValues: {
      ':incrementSequenceNo': sequenceNoIncrement || 1,
      ':userId': userId
    },
    UpdateExpression: 'SET #lastSequenceNo = #lastSequenceNo + :incrementSequenceNo',
    ConditionExpression: '#userId = :userId',
    ReturnValues: 'UPDATED_NEW'
  }

  const ddbClient = connection.ddbClient()
  const updatedUser = await ddbClient.update(atomicIncrementUserSeqNoParams).promise()
  return updatedUser.Attributes['last-sequence-no']
}

const putItem = async function (res, item) {
  const params = {
    TableName: setup.databaseTableName,
    Item: item,
    ConditionExpression: 'attribute_not_exists(#userId)',
    ExpressionAttributeNames: {
      '#userId': 'user-id'
    },
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.put(params).promise()
  return res.send({
    'item-id': item['item-id'],
    'sequence-no': item['sequence-no'],
    command: item.command
  })
}

exports.insert = async function (req, res) {
  if (req.readableLength > FOUR_HUNDRED_KB) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Encrypted blob is too large' })

  const userId = res.locals.userId

  try {
    const sequenceNo = await setNextSequenceNo(userId)

    // Warning: if the server receives many large simultaneous requests, memory could fill up here.
    // The solution to this is to read the buffer in small chunks and pipe the chunks to
    // S3 and store the S3 URL in DynamoDB.
    const buffer = req.read()

    const command = 'Insert'

    const item = {
      'user-id': userId,
      'item-id': uuidv4(),
      command,
      record: buffer,
      'sequence-no': sequenceNo
    }

    return putItem(res, item)
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
    const sequenceNo = await setNextSequenceNo(userId)

    const command = 'Delete'

    const item = {
      'user-id': userId,
      'item-id': itemId,
      command,
      'sequence-no': sequenceNo
    }

    return putItem(res, item)
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
    .send({ readableMessage: `Missing item id` })

  if (req.readableLength > FOUR_HUNDRED_KB) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Encrypted blob is too large' })

  try {
    const sequenceNo = await setNextSequenceNo(userId)

    // Warning: if the server receives many large simultaneous requests, memory could fill up here.
    // The solution to this is to read the buffer in small chunks and pipe the chunks to
    // S3 and store the S3 URL in DynamoDB.
    const buffer = req.read()

    const command = 'Update'

    const item = {
      'user-id': userId,
      'item-id': itemId,
      command,
      record: buffer,
      'sequence-no': sequenceNo
    }

    return putItem(res, item)
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to update with ${e}` })
  }
}

exports.queryDbOperationLog = async function (req, res) {
  const userId = res.locals.userId

  const params = {
    TableName: setup.databaseTableName,
    KeyName: '#userId',
    KeyConditionExpression: '#userId = :userId',
    ExpressionAttributeNames: {
      '#userId': 'user-id'
    },
    ExpressionAttributeValues: {
      ':userId': userId
    },
  }

  try {
    const ddbClient = connection.ddbClient()
    let itemsResponse = await ddbClient.query(params).promise()
    let items = itemsResponse.Items

    // Warning: memory could fill up here when building the items array.
    // Note that this while loop is necessary in the first place because
    // DDB itself limits each query response to 1mb.
    while (itemsResponse.LastEvaluatedKey) {
      params.ExclusiveStartKey = itemsResponse.LastEvaluatedKey
      itemsResponse = await ddbClient.query(params).promise()
      items = items.concat(itemsResponse.Items)
    }

    return res.send(items)
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to query operation log with ${e}` })
  }
}

exports.queryDbState = async function (req, res) {
  const userId = res.locals.userId

  const params = { Bucket: setup.dbStatesBucketName, Key: userId }

  try {
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

  const bufferByteLengths = req.query.byteLengths
  if (!bufferByteLengths || bufferByteLengths.length === 0) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing buffer byte lengths' })

  if (bufferByteLengths.length > MAX_REQUESTS_IN_DDB_BATCH) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: `Cannot exceed ${MAX_REQUESTS_IN_DDB_BATCH} requests` })

  const userId = res.locals.userId

  try {
    const sequenceNoIncrement = bufferByteLengths.length
    const startingSeqNo = await setNextSequenceNo(userId, sequenceNoIncrement) - sequenceNoIncrement

    const putRequests = []
    for (let i = 0; i < bufferByteLengths.length; i++) {
      const byteLength = bufferByteLengths[i]

      // Warning: if the server receives many large simultaneous requests, memory could fill up here.
      // The solution to this is to read the buffer in small chunks and pipe the chunks to
      // S3 and store the S3 URL in DynamoDB.
      const buffer = req.read(byteLength)

      const item = {
        'user-id': userId,
        'item-id': uuidv4(),
        command: 'Insert',
        record: buffer,
        'sequence-no': startingSeqNo + i
      }

      putRequests.push({
        PutRequest: {
          Item: item
        }
      })
    }

    const params = {
      RequestItems: {
        [setup.databaseTableName]: putRequests
      }
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.batchWrite(params).promise()

    res.send(putRequests.map(pr => pr.PutRequest.Item))
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
    const sequenceNoIncrement = updatedRecordsMetadata.length
    const startingSeqNo = await setNextSequenceNo(userId, sequenceNoIncrement) - sequenceNoIncrement

    const putRequests = []
    for (let i = 0; i < updatedRecordsMetadata.length; i++) {
      const updatedRecord = JSON.parse(updatedRecordsMetadata[i])
      const byteLength = updatedRecord.byteLength
      const itemId = updatedRecord['item-id']

      // Warning: if the server receives many large simultaneous requests, memory could fill up here.
      // The solution to this is to read the buffer in small chunks and pipe the chunks to
      // S3 and store the S3 URL in DynamoDB.
      const buffer = req.read(byteLength)

      const item = {
        'user-id': userId,
        'item-id': itemId,
        command: 'Update',
        record: buffer,
        'sequence-no': startingSeqNo + i
      }

      putRequests.push({
        PutRequest: {
          Item: item
        }
      })
    }

    const params = {
      RequestItems: {
        [setup.databaseTableName]: putRequests
      }
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.batchWrite(params).promise()

    res.send(putRequests.map(pr => pr.PutRequest.Item))
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
    const sequenceNoIncrement = itemIds.length
    const startingSeqNo = await setNextSequenceNo(userId, sequenceNoIncrement) - sequenceNoIncrement

    const putRequests = []
    for (let i = 0; i < itemIds.length; i++) {
      const item = {
        'user-id': userId,
        'item-id': itemIds[i],
        command: 'Delete',
        'sequence-no': startingSeqNo + i
      }

      putRequests.push({
        PutRequest: {
          Item: item
        }
      })
    }

    const params = {
      RequestItems: {
        [setup.databaseTableName]: putRequests
      }
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.batchWrite(params).promise()

    res.send(putRequests.map(pr => pr.PutRequest.Item))
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to batch delete with ${e}` })
  }
}

exports.flushDbState = async function (req, res) {
  const userId = res.locals.userId
  const sequenceNos = req.query.sequenceNos

  if (!sequenceNos) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Missing sequence numbers to delete' })

  const params = { Bucket: setup.dbStatesBucketName, Key: userId, Body: req }
  try {

    console.log('Uploading db state to S3...')
    const s3 = setup.s3()
    await s3.upload(params).promise()

    console.log('Deleting operations from operation log...')
    const ddbClient = connection.ddbClient()

    let deleteRequestBatch = []
    const promises = []
    for (let i = 0; i < sequenceNos.length; i++) {
      deleteRequestBatch.push({
        DeleteRequest: {
          Key: {
            'user-id': userId,
            'sequence-no': Number(sequenceNos[i])
          }
        }
      })

      if (i === sequenceNos.length - 1 || deleteRequestBatch.length === MAX_REQUESTS_IN_DDB_BATCH) {
        const params = {
          RequestItems: {
            [setup.databaseTableName]: deleteRequestBatch
          }
        }

        const promise = ddbClient.batchWrite(params).promise()
        promises.push(promise)

        deleteRequestBatch = []
      }
    }

    await Promise.all(promises)

    res.send('Success!')
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to flush db state with ${e}` })
  }
}
