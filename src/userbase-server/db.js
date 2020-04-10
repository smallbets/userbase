import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import responseBuilder from './responseBuilder'
import connections from './ws'
import logger from './logger'
import userController from './user'
import peers from './peers'

const MAX_OPERATIONS_IN_TX = 10

const getS3DbStateKey = (databaseId, bundleSeqNo) => `${databaseId}/${bundleSeqNo}`

const createDatabase = async function (userId, dbNameHash, dbId, encryptedDbName, encryptedDbKey) {
  try {
    const user = await userController.getUserByUserId(userId)
    if (!user || user['deleted']) throw new Error('UserNotFound')

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

exports.openDatabase = async function (user, app, connectionId, dbNameHash, newDatabaseParams, reopenAtSeqNo) {
  if (!dbNameHash) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database name hash')
  if (reopenAtSeqNo && typeof reopenAtSeqNo !== 'number') return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Reopen at seq no must be number')
  const userId = user['user-id']

  try {
    try {
      userController.validatePayment(user, app)
    } catch (e) {
      return responseBuilder.errorResponse(e.status, e.error)
    }

    let database
    try {
      database = await getDatabase(userId, dbNameHash)

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

    if (connections.openDatabase(userId, connectionId, dbId, bundleSeqNo, dbNameHash, dbKey, reopenAtSeqNo)) {
      return responseBuilder.successResponse('Success!')
    } else {
      throw new Error('Unable to open database')
    }
  } catch (e) {
    logger.error(`Failed to open database for user ${userId} with ${e}`)
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], 'Failed to open database')
  }
}

const putTransaction = async function (transaction, userId, databaseId) {
  const ddbClient = connection.ddbClient()

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
    const db = await ddbClient.update(incrementSeqNoParams).promise()
    transaction['sequence-no'] = db.Attributes['next-seq-number']
    transaction['creation-date'] = new Date().toISOString()
  } catch (e) {
    throw new Error(`Failed to increment sequence number with ${e}.`)
  }

  // write the transaction using the next sequence number
  const params = {
    TableName: setup.transactionsTableName,
    Item: transaction,
    ConditionExpression: 'attribute_not_exists(#databaseId)',
    ExpressionAttributeNames: {
      '#databaseId': 'database-id'
    }
  }

  try {
    await ddbClient.put(params).promise()
  } catch (e) {
    // best effort rollback - if the rollback fails here, it will get attempted again when the transactions are read
    await rollbackAttempt(transaction, ddbClient)
    throw new Error(`Failed to put transaction with ${e}.`)
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
    logger.warn(`Failed command ${command} for user ${userId} with ${e}`)
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], `Failed to ${command}`)
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
    logger.warn(`Failed batch transaction for user ${userId} with ${e}`)
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], 'Failed to batch transaction')
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
