import logger from './logger'
import setup from './setup'
import connection from './connection'
import dbController from './db'
import { estimateSizeOfDdbItem } from './utils'

const ddbWhileLoop = async (params, ddbQuery, action) => {
  let itemsResponse = await ddbQuery(params)
  let items = itemsResponse.Items

  let total = 0
  total += (await action(items)).reduce((a, b) => a + b, 0)

  // can be optimized with parallel scan
  while (itemsResponse.LastEvaluatedKey) {
    params.ExclusiveStartKey = itemsResponse.LastEvaluatedKey
    itemsResponse = await ddbQuery(params)
    items = itemsResponse.Items

    total += (await action(items)).reduce((a, b) => a + b, 0)
  }

  return total
}

const meterS3Objects = async (bucketName, prefix) => {
  const params = {
    Bucket: bucketName,
    Prefix: prefix
  }

  let response = await setup.s3().listObjectsV2(params).promise()
  if (!response.KeyCount) return 0

  let totalSize = 0

  totalSize += response.Contents
    .map(object => object.Size)
    .reduce((a, b) => a + b, 0)

  while (response.IsTruncated) {
    params.ContinuationToken = response.NextContinuationToken
    response = await setup.s3().listObjectsV2(params).promise()
    if (!response.KeyCount) return totalSize

    totalSize += response.Contents
      .map(object => object.Size)
      .reduce((a, b) => a + b, 0)
  }

  return totalSize
}

const meterTransactions = async (userDb) => {
  const params = {
    TableName: setup.transactionsTableName,
    KeyConditionExpression: '#dbId = :dbId',
    ExpressionAttributeNames: {
      '#dbId': 'database-id',
    },
    ExpressionAttributeValues: {
      ':dbId': userDb['database-id']
    }
  }

  const ddbClient = connection.ddbClient()

  const ddbQuery = (params) => ddbClient.query(params).promise()
  const action = (transactions) => transactions.map(tx => estimateSizeOfDdbItem(tx))

  const transactionLogSize = await ddbWhileLoop(params, ddbQuery, action)
  return transactionLogSize
}

const storeDatabaseSizes = async (dbId, size, transactionLogSize, dbStatesSize, filesSize, lastMetered) => {
  await connection.ddbClient().update({
    TableName: setup.databaseTableName,
    Key: {
      'database-id': dbId
    },
    UpdateExpression: 'SET #size = :size, #transactionLogSize = :transactionLogSize, #dbStatesSize = :dbStatesSize, #filesSize = :filesSize, #lastMetered = :lastMetered',
    ExpressionAttributeNames: {
      '#size': 'size',
      '#transactionLogSize': 'transaction-log-size',
      '#dbStatesSize': 'db-states-size',
      '#filesSize': 'files-size',
      '#lastMetered': 'last-metered',
    },
    ExpressionAttributeValues: {
      ':size': size,
      ':transactionLogSize': transactionLogSize,
      ':dbStatesSize': dbStatesSize,
      ':filesSize': filesSize,
      ':lastMetered': new Date(lastMetered).toISOString()
    }
  }).promise()
}

const meterDatabase = async (nightlyId, userDb) => {
  const start = Date.now()
  const logChildObject = { nightlyId, userId: userDb['user-id'], databaseId: userDb['database-id'] }
  logger.child(logChildObject).info('Metering database')

  let totalDatabaseSize = estimateSizeOfDdbItem(userDb)

  // if user is not owner of db, just add size of userDb
  const database = await dbController.findDatabaseByDatabaseId(userDb['database-id'])
  if (database && userDb['user-id'] === database['owner-id']) {
    logChildObject.isOwner = true

    const [transactionLogSize, dbStatesSize, filesSize] = await Promise.all([
      meterTransactions(userDb),
      meterS3Objects(setup.getDbStatesBucketName(), userDb['database-id']),
      meterS3Objects(setup.getFilesBucketName(), userDb['database-id']),
    ])

    totalDatabaseSize += estimateSizeOfDdbItem(database) + transactionLogSize + dbStatesSize + filesSize

    logChildObject.transactionLogSize = transactionLogSize
    logChildObject.dbStatesSize = dbStatesSize
    logChildObject.filesSize = filesSize

    try {
      await storeDatabaseSizes(userDb['database-id'], totalDatabaseSize, transactionLogSize, dbStatesSize, filesSize, start)
    } catch (e) {
      logger.child({ timeToMeter: Date.now() - start, err: e, ...logChildObject }).warn('Error metering database')
    }
  }

  logChildObject.totalDatabaseSize = totalDatabaseSize

  logger.child({ timeToMeter: Date.now() - start, ...logChildObject }).info('Finished metering database')

  return totalDatabaseSize
}

const storeSize = async (TableName, Key, size, lastMetered, ConditionExpression, ExpressionAttributeNames, ExpressionAttributeValues) => {
  await connection.ddbClient().update({
    TableName,
    Key,
    UpdateExpression: 'SET #size = :size, #lastMetered = :lastMetered',
    ConditionExpression,
    ExpressionAttributeNames: {
      '#size': 'size',
      '#lastMetered': 'last-metered',
      ...ExpressionAttributeNames
    },
    ExpressionAttributeValues: {
      ':size': size,
      ':lastMetered': new Date(lastMetered).toISOString(),
      ...ExpressionAttributeValues
    }
  }).promise()
}

const meterUser = async (nightlyId, user) => {
  const start = Date.now()
  const logChildObject = { nightlyId, userId: user['user-id'], appId: user['app-id'], username: user['username'] }
  logger.child(logChildObject).info('Metering user')

  // meter user's databases that user is an owner of
  const params = {
    TableName: setup.userDatabaseTableName,
    KeyConditionExpression: '#userId = :userId',
    ExpressionAttributeNames: {
      '#userId': 'user-id',
    },
    ExpressionAttributeValues: {
      ':userId': user['user-id']
    }
  }

  const ddbClient = connection.ddbClient()

  const ddbQuery = (params) => ddbClient.query(params).promise()
  const action = (userDbs) => Promise.all(userDbs.map(userDb => meterDatabase(nightlyId, userDb)))

  const totalDataStoredByUser = await ddbWhileLoop(params, ddbQuery, action) + estimateSizeOfDdbItem(user)

  try {
    await storeSize(
      setup.usersTableName,
      {
        'username': user['username'],
        'app-id': user['app-id']
      },
      totalDataStoredByUser,
      start,
      '#userId = :userId',
      { '#userId': 'user-id' },
      { ':userId': user['user-id'] }
    )
  } catch (e) {
    logger.child({ timeToMeter: Date.now() - start, err: e, ...logChildObject }).warn('Error metering user')
  }

  return totalDataStoredByUser
}

const meterApp = async (nightlyId, app) => {
  const start = Date.now()
  const logChildObject = { nightlyId, userId: app['user-id'], appId: app['app-id'], adminId: app['admin-id'], appName: app['app-name'] }
  logger.child(logChildObject).info('Metering app')

  // meter all app's users
  const params = {
    TableName: setup.usersTableName,
    IndexName: setup.appIdIndex,
    KeyConditionExpression: '#appId = :appId',
    ExpressionAttributeNames: {
      '#appId': 'app-id'
    },
    ExpressionAttributeValues: {
      ':appId': app['app-id']
    }
  }

  const ddbClient = connection.ddbClient()

  const ddbQuery = (params) => ddbClient.query(params).promise()
  const action = (users) => Promise.all(users.map(user => meterUser(nightlyId, user)))
  const totalDataStoredByApp = await ddbWhileLoop(params, ddbQuery, action) + estimateSizeOfDdbItem(app)

  try {
    await storeSize(
      setup.appsTableName,
      {
        'admin-id': app['admin-id'],
        'app-name': app['app-name']
      },
      totalDataStoredByApp,
      start,
      '#appId = :appId',
      { '#appId': 'app-id' },
      { ':appId': app['app-id'] }
    )
    logger.child({ timeToMeter: Date.now() - start, totalDataStoredByApp, ...logChildObject }).info('Finished metering app')
  } catch (e) {
    logger.child({ timeToMeter: Date.now() - start, err: e, ...logChildObject }).warn('Error metering app')
  }

  return totalDataStoredByApp
}

const meterApps = async (nightlyId, admin) => {
  const params = {
    TableName: setup.appsTableName,
    KeyConditionExpression: '#adminId = :adminId',
    ExpressionAttributeNames: {
      '#adminId': 'admin-id'
    },
    ExpressionAttributeValues: {
      ':adminId': admin['admin-id']
    }
  }

  const ddbQuery = (params) => connection.ddbClient().query(params).promise()
  const action = (apps) => Promise.all(apps.map(app => meterApp(nightlyId, app)))
  const totalStoredByApps = await ddbWhileLoop(params, ddbQuery, action)

  return totalStoredByApps
}

const meterAdmin = async (nightlyId, admin) => {
  const start = Date.now()
  const logChildObject = { nightlyId, adminId: admin['admin-id'], email: admin['email'] }
  logger.child(logChildObject).info('Metering admin')

  const totalDataStoredByAdmin = await meterApps(nightlyId, admin)

  try {
    await storeSize(
      setup.adminTableName,
      {
        email: admin['email']
      },
      totalDataStoredByAdmin,
      start,
      '#adminId = :adminId',
      { '#adminId': 'admin-id' },
      { ':adminId': admin['admin-id'] }
    )
    logger.child({ timeToMeter: Date.now() - start, ...logChildObject }).info('Finished metering admin')
  } catch (e) {
    logger.child({ timeToMeter: Date.now() - start, err: e, ...logChildObject }).warn('Error metering admin')
  }

  return totalDataStoredByAdmin
}

const meterAdmins = async (nightlyId) => {
  const start = Date.now()
  const logChildObject = { nightlyId }
  logger.child(logChildObject).info('Metering admins')

  const params = {
    TableName: setup.adminTableName,
  }

  const ddbQuery = (params) => connection.ddbClient().scan(params).promise()
  const action = (admins) => Promise.all(admins.map(admin => meterAdmin(nightlyId, admin)))
  const totalDataStored = await ddbWhileLoop(params, ddbQuery, action)

  logger.child({ timeToMeter: Date.now() - start, ...logChildObject }).info('Finished metering admins')

  return totalDataStored
}

const meter = async (nightlyId) => {
  const start = Date.now()
  const logChildObject = { nightlyId, start }

  try {
    logger.child(logChildObject).info('Metering data storage')

    const totalDataStored = await meterAdmins(nightlyId)

    logger.child({ timeToMeter: Date.now() - start, totalDataStored, ...logChildObject }).info('Finished metering')
  } catch (e) {
    logger.child({ timeToMeter: Date.now() - start, err: e, ...logChildObject }).fatal('Failed metering')
  }
}

export default meter
