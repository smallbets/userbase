import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import responseBuilder from './responseBuilder'
import connections from './ws'
import logger from './logger'
import userController from './user'

const getS3DbStateKey = (databaseId, bundleSeqNo) => `${databaseId}/${bundleSeqNo}`

exports.createDatabase = async function (userId, dbNameHash, dbId, encryptedDbName, encryptedDbKey) {
  if (!dbNameHash) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database name hash')
  if (!dbId) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database id')
  if (!encryptedDbName) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database name')
  if (!encryptedDbKey) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database key')

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

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.transactWrite(params).promise()

    return responseBuilder.successResponse('Success!')
  } catch (e) {
    if (e.message && e.message.includes('ConditionalCheckFailed')) {
      return responseBuilder.errorResponse(statusCodes['Conflict'], 'Database already exists')
    } else if (e.message && e.message.includes('TransactionConflict')) {
      return responseBuilder.errorResponse(statusCodes['Conflict'], 'Database already creating')
    }
    logger.error(`Failed to create database for user ${userId} with ${e}`)
    return responseBuilder.errorResponse(
      statusCodes['Internal Server Error'],
      'Failed to create database'
    )
  }
}

exports.findUserDatabaseByDatabaseId = async function (dbId, userId) {
  const userDatabaseParams = {
    TableName: setup.userDatabaseTableName,
    IndexName: setup.userDatabaseIdIndex,
    KeyConditionExpression: '#dbId = :dbId and #userId = :userId',
    ExpressionAttributeNames: {
      '#dbId': 'database-id',
      '#userId': 'user-id'
    },
    ExpressionAttributeValues: {
      ':dbId': dbId,
      ':userId': userId
    },
  }

  const ddbClient = connection.ddbClient()
  const userDbResponse = await ddbClient.query(userDatabaseParams).promise()

  if (userDbResponse.Items.length > 1) {
    logger.warn(`Found too many user databases with db id ${dbId} and user id ${userId}`)
  }

  return userDbResponse.Items[0]
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

exports.openDatabase = async function (userId, connectionId, dbNameHash) {
  if (!dbNameHash) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database name hash')

  try {
    const database = await getDatabase(userId, dbNameHash)
    if (!database) return responseBuilder.errorResponse(statusCodes['Not Found'], 'Database not found')

    const dbId = database['database-id']
    const bundleSeqNo = database['bundle-seq-no']
    const dbKey = database['encrypted-db-key']

    if (connections.openDatabase(userId, connectionId, dbId, bundleSeqNo, dbNameHash, dbKey)) {
      return responseBuilder.successResponse('Success!')
    } else {
      throw new Error(`Unable to open database`)
    }
  } catch (e) {
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], `Failed to open database with ${e}`)
  }
}

const findOtherUserDbsGrantedAccessToDb = async function (dbId, userId) {
  const otherUserDbGrantedAccessParamsLessThan = {
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

  const otherUserDbGrantedAccessParamsMoreThan = {
    ...otherUserDbGrantedAccessParamsLessThan,
    KeyConditionExpression: '#dbId = :dbId and #userId > :userId',
  }

  const ddbClient = connection.ddbClient()
  const result = await Promise.all([
    ddbClient.query(otherUserDbGrantedAccessParamsLessThan).promise(),
    ddbClient.query(otherUserDbGrantedAccessParamsMoreThan).promise()
  ])

  const otherUserDbsLessThan = (result[0] && result[0].Items) || []
  const otherUserDbsMoreThan = (result[1] && result[1].Items) || []

  return otherUserDbsLessThan.concat(otherUserDbsMoreThan)
}

const findOtherUsersGrantedAccessToDb = async function (dbId, userId, otherUsersByUserId) {
  const otherUserDbsGrantedAccess = await findOtherUserDbsGrantedAccessToDb(dbId, userId)

  const userQueries = []
  for (const otherUserDb of otherUserDbsGrantedAccess) {
    const otherUserId = otherUserDb['user-id']
    if (!otherUsersByUserId[otherUserId]) {
      otherUsersByUserId[otherUserId] = userQueries.push(userController.getUserByUserId(otherUserId))
    }
  }
  const uniqueUsers = await Promise.all(userQueries)

  for (const uniqueUser of uniqueUsers) {
    const otherUserId = uniqueUser['user-id']
    otherUsersByUserId[otherUserId] = uniqueUser
  }

  return otherUserDbsGrantedAccess
}

exports.findDatabases = async function (userId, username) {
  try {
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

    const ddbClient = connection.ddbClient()
    const userDbsResponse = await ddbClient.query(userDatabasesParams).promise()

    const userDbs = userDbsResponse && userDbsResponse.Items
    if (!userDbs || !userDbs.length) return responseBuilder.successResponse([])

    const databaseQueries = []
    const otherUsersByUserId = {}
    const otherUsersGrantedDbAccessQueries = []
    for (const userDb of userDbs) {
      const dbId = userDb['database-id']

      databaseQueries.push(findDatabaseByDatabaseId(dbId))
      otherUsersGrantedDbAccessQueries.push(findOtherUsersGrantedAccessToDb(dbId, userId, otherUsersByUserId))
    }

    const [databases, otherUserDbsGrantedAccess] = await Promise.all([
      Promise.all(databaseQueries),
      Promise.all(otherUsersGrantedDbAccessQueries)
    ])

    if (!databases) {
      logger.error(`User ${userId} is missing databases in database table`)
      throw new Error('Missing databases')
    }

    const finalResult = databases.map((db, i) => {
      const ownerId = db['owner-id']

      return {
        encryptedDbKey: userDbs[i]['encrypted-db-key'],
        dbName: db['database-name'],
        owner: ownerId === userId ? username : otherUsersByUserId[ownerId].username,
        access: otherUserDbsGrantedAccess[i].map(otherUserDb => {
          const otherUserId = otherUserDb['user-id']
          return {
            readOnly: otherUserDb['read-only'],
            username: otherUsersByUserId[otherUserId].username
          }
        })
      }
    })

    return responseBuilder.successResponse(finalResult)
  } catch (e) {
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], `Failed to find databases with ${e}`)
  }
}

const failedTxConditionCheckMsg = 'Make sure user has write permission to this db and the db id and hash are correct'
const putTransaction = async function (transaction, userId, dbNameHash, databaseId) {
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
    throw new Error(`Failed with ${e}.`)
  }

  // write the transaction using the next sequence number
  const params = {
    TransactItems: [{
      ConditionCheck: {
        TableName: setup.userDatabaseTableName,
        Key: {
          'user-id': userId,
          'database-name-hash': dbNameHash
        },
        ConditionExpression: '#readOnly <> :readOnly and #dbId = :dbId',
        ExpressionAttributeNames: {
          '#readOnly': 'read-only',
          '#dbId': 'database-id'
        },
        ExpressionAttributeValues: {
          ':readOnly': true,
          ':dbId': databaseId
        },
      }
    }, {
      Put: {
        TableName: setup.transactionsTableName,
        Item: transaction,
        ConditionExpression: 'attribute_not_exists(#databaseId)',
        ExpressionAttributeNames: {
          '#databaseId': 'database-id'
        }
      }
    }]
  }

  try {
    await ddbClient.transactWrite(params).promise()
  } catch (e) {
    // best effort rollback - if the rollback fails here, it will get attempted again when the transactions are read
    await rollbackAttempt(transaction, ddbClient)
    throw new Error(`Failed with ${e}.`)
  }

  // notify all websocket connections that there's a database change
  connections.push(transaction['database-id'], userId)

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
    throw new Error(`Failed with ${e}.`)
  }
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
    if (e.message === failedTxConditionCheckMsg) return responseBuilder.errorResponse(statusCodes['Bad Request'], failedTxConditionCheckMsg)
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], `Failed to ${command} with ${e}`)
  }
}

exports.batchTransaction = async function (userId, dbNameHash, databaseId, operations) {
  if (!dbNameHash) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database name hash')
  if (!databaseId) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing database id')
  if (!operations || !operations.length) return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing operations')

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
    if (e.message === failedTxConditionCheckMsg) return responseBuilder.errorResponse(statusCodes['Bad Request'], failedTxConditionCheckMsg)
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], `Failed to batch with ${e}`)
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
