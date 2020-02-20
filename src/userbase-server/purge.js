import uuidv4 from 'uuid/v4'
import logger from './logger'
import setup from './setup'
import connection from './connection'
import connections from './ws'
import userController from './user'

const MS_IN_A_DAY = 60 * 60 * 24 * 1000
const TIME_TO_PURGE = 30 * MS_IN_A_DAY

const permanentDeleteDeletedItems = async (items, closeConnectedClients, permanentDelete) => {
  const permanentDeletePromises = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    if (item['deleted']) {
      // closing connected clients guarantees no lingering clients will be able to insert data while purge is under way
      closeConnectedClients(item)

      if (new Date() - new Date(item['deleted']) > TIME_TO_PURGE) {
        permanentDeletePromises.push(permanentDelete(item))
      }
    }
  }

  await Promise.all(permanentDeletePromises)
}

const scanForDeleted = async (TableName, closeConnectedClients, permanentDelete) => {
  const params = { TableName }

  const ddbClient = connection.ddbClient()
  let itemsResponse = await ddbClient.scan(params).promise()
  let items = itemsResponse.Items

  await permanentDeleteDeletedItems(items, closeConnectedClients, permanentDelete)

  // can be optimized with parallel scan
  while (itemsResponse.LastEvaluatedKey) {
    params.ExclusiveStartKey = itemsResponse.LastEvaluatedKey
    itemsResponse = await ddbClient.scan(params).promise()
    items = itemsResponse.Items

    await permanentDeleteDeletedItems(items, closeConnectedClients, permanentDelete)
  }
}

const scanForDeletedUsers = async (purgeId) => {
  const start = Date.now()
  const logChildObject = { purgeId }
  logger.child(logChildObject).info('Scanning for deleted users')

  await scanForDeleted(
    setup.usersTableName,
    (user) => connections.closeUsersConnectedClients(user['user-id']),
    (user) => userController.permanentDelete(user)
  )

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished scanning for deleted users')
}

const removeTransaction = async (transaction) => {
  const transactionParams = {
    TableName: setup.transactionsTableName,
    Key: {
      'database-id': transaction['database-id'],
      'sequence-no': transaction['sequence-no']
    }
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.delete(transactionParams).promise()
}

const purgeTransactions = async (userDb) => {
  const start = Date.now()
  const logChildObject = { userId: userDb['user-id'], databaseId: userDb['database-id'] }
  logger.child(logChildObject).info('Purging transactions')

  const transactionParams = {
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
  let transactionsResponse = await ddbClient.query(transactionParams).promise()
  let transactions = transactionsResponse.Items

  await Promise.all(transactions.map(tx => removeTransaction(tx)))

  while (transactionsResponse.LastEvaluatedKey) {
    transactionParams.ExclusiveStartKey = transactionsResponse.LastEvaluatedKey
    transactionsResponse = await ddbClient.query(transactionParams).promise()
    transactions = transactionsResponse.Items

    await Promise.all(transactions.map(tx => removeTransaction(tx)))
  }

  // delete database before deleting user database to maintain reference in case of failure
  await ddbClient.delete({
    TableName: setup.databaseTableName,
    Key: {
      'database-id': userDb['database-id']
    }
  }).promise()

  await ddbClient.delete({
    TableName: setup.userDatabaseTableName,
    Key: {
      'user-id': userDb['user-id'],
      'database-name-hash': userDb['database-name-hash']
    }
  }).promise()

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purging transactions')
}

const purgeUser = async (user) => {
  const start = Date.now()
  const logChildObject = { userId: user['user-id'], appId: user['app-id'] }
  logger.child(logChildObject).info('Purging user')

  const userDatabasesParams = {
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
  let userDbsResponse = await ddbClient.query(userDatabasesParams).promise()
  let userDbs = userDbsResponse.Items

  await Promise.all(userDbs.map(userDb => purgeTransactions(userDb)))

  while (userDbsResponse.LastEvaluatedKey) {
    userDatabasesParams.ExclusiveStartKey = userDbsResponse.LastEvaluatedKey
    userDbsResponse = await ddbClient.query(userDatabasesParams).promise()
    userDbs = userDbsResponse.Items

    await Promise.all(userDbs.map(userDb => purgeTransactions(userDb)))
  }

  await ddbClient.delete({
    TableName: setup.deletedUsersTableName,
    Key: {
      'user-id': user['user-id']
    }
  }).promise()

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purging user')
}

const purgeDeletedUsers = async (purgeId) => {
  const start = Date.now()
  const logChildObject = { purgeId }
  logger.child(logChildObject).info('Purging deleted users')

  const params = {
    TableName: setup.deletedUsersTableName
  }

  const ddbClient = connection.ddbClient()
  let itemsResponse = await ddbClient.scan(params).promise()
  let items = itemsResponse.Items

  await Promise.all(items.map(user => purgeUser(user)))

  while (itemsResponse.LastEvaluatedKey) {
    params.ExclusiveStartKey = itemsResponse.LastEvaluatedKey
    itemsResponse = await ddbClient.scan(params).promise()
    items = itemsResponse.Items

    await Promise.all(items.map(user => purgeUser(user)))
  }

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purging deleted users')
}

const commencePurge = async () => {
  const start = Date.now()
  const purgeId = uuidv4()
  const logChildObject = { purgeId }

  try {
    logger.child(logChildObject).info('Commencing purge')

    await scanForDeletedUsers(purgeId)
    await purgeDeletedUsers(purgeId)

    logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purge')
  } catch (e) {
    logger.child({ timeToPurge: Date.now() - start, err: e, ...logChildObject }).warn('Failed purge')
  }
}

export default async function () {
  await commencePurge()
  setInterval(commencePurge, MS_IN_A_DAY)
}
