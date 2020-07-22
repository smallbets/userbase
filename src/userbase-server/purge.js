import logger from './logger'
import setup from './setup'
import connection from './connection'
import connections from './ws'
import dbController from './db'
import userController from './user'
import appController from './app'
import adminController from './admin'
import stripe from './stripe'

const MS_IN_AN_HOUR = 60 * 60 * 1000
const MS_IN_A_DAY = 24 * MS_IN_AN_HOUR
const TIME_TO_PURGE = 30 * MS_IN_A_DAY

const ddbWhileLoop = async (params, ddbQuery, action) => {
  let itemsResponse = await ddbQuery(params)
  let items = itemsResponse.Items

  await action(items)

  // can be optimized with parallel scan
  while (itemsResponse.LastEvaluatedKey) {
    params.ExclusiveStartKey = itemsResponse.LastEvaluatedKey
    itemsResponse = await ddbQuery(params)
    items = itemsResponse.Items

    await action(items)
  }
}

const permanentDeleteDeletedItems = async (items, closeConnectedClients, permanentDelete) => {
  const permanentDeletePromises = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    if (item['deleted']) {
      // closing connected clients tries to prevent lingering clients from inserting data while purge is under way
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
  const ddbQuery = (params) => connection.ddbClient().scan(params).promise()
  const action = (items) => permanentDeleteDeletedItems(items, closeConnectedClients, permanentDelete)
  await ddbWhileLoop(params, ddbQuery, action)
}

const scanForDeletedApps = async (nightlyId) => {
  const start = Date.now()
  const logChildObject = { nightlyId }
  logger.child(logChildObject).info('Scanning for deleted apps')

  await scanForDeleted(
    setup.appsTableName,
    (app) => connections.closeAppsConnectedClients(app['app-id']),
    (app) => appController.permanentDelete(app['admin-id'], app['app-name'], app['app-id'])
  )

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished scanning for deleted apps')
}

const scanForDeletedAdmins = async (nightlyId) => {
  const start = Date.now()
  const logChildObject = { nightlyId }
  logger.child(logChildObject).info('Scanning for deleted admins')

  await scanForDeleted(
    setup.adminTableName,
    (admin) => connections.closeAdminsConnectedClients(admin['admin-id']),
    (admin) => adminController.permanentDelete(admin)
  )

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished scanning for deleted admins')
}

const scanForDeletedUsers = async (nightlyId) => {
  const start = Date.now()
  const logChildObject = { nightlyId }
  logger.child(logChildObject).info('Scanning for deleted users')

  await scanForDeleted(
    setup.usersTableName,
    (user) => connections.closeUsersConnectedClients(user['user-id']),
    (user) => userController.permanentDelete(user)
  )

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished scanning for deleted users')
}

const removeUserDb = async (userDb) => {
  const params = {
    TableName: setup.userDatabaseTableName,
    Key: {
      'user-id': userDb['user-id'],
      'database-name-hash': userDb['database-name-hash']
    }
  }
  await connection.ddbClient().delete(params).promise()
}

const purgeDatabase = async (userDb) => {
  // delete all userDatabases associated with this database
  const allUserDatabasesParams = {
    TableName: setup.userDatabaseTableName,
    IndexName: setup.userDatabaseIdIndex,
    KeyConditionExpression: '#databaseId = :databaseId',
    ExpressionAttributeNames: {
      '#databaseId': 'database-id',
    },
    ExpressionAttributeValues: {
      ':databaseId': userDb['database-id'],
    },
    Select: 'ALL_ATTRIBUTES'
  }

  const ddbQuery = (allUserDatabasesParams) => connection.ddbClient().query(allUserDatabasesParams).promise()
  const action = (userDbs) => Promise.all(userDbs.map(userDb => removeUserDb(userDb)))
  await ddbWhileLoop(allUserDatabasesParams, ddbQuery, action)

  // delete database
  const deleteDatabaseParams = {
    TableName: setup.databaseTableName,
    Key: {
      'database-id': userDb['database-id'],
    }
  }
  await connection.ddbClient().delete(deleteDatabaseParams).promise()
}

const removeS3Objects = async (bucketName, prefix) => {
  const params = {
    Bucket: bucketName,
    Prefix: prefix
  }

  let response = await setup.s3().listObjectsV2(params).promise()
  if (!response.KeyCount) return

  const deleteParams = {
    Bucket: bucketName,
    Delete: {
      Objects: response.Contents.map(object => ({ Key: object.Key }))
    }
  }

  await setup.s3().deleteObjects(deleteParams).promise()

  while (response.IsTruncated) {
    params.ContinuationToken = response.NextContinuationToken
    response = await setup.s3().listObjectsV2(params).promise()
    if (!response.KeyCount) return

    deleteParams.Delete.Objects = response.Contents.map(object => ({ Key: object.Key }))

    await setup.s3().deleteObjects(deleteParams).promise()
  }
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

  // if user is not owner of db, just delete userDb and move on
  const database = await dbController.findDatabaseByDatabaseId(userDb['database-id'])
  if (database && userDb['user-id'] !== database['owner-id']) {
    logger.child(logChildObject).info('Purging user database')
    await removeUserDb(userDb)
    logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purging user database')
    return
  } else {
    logger.child(logChildObject).info('Purging transactions')
  }

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
  const action = (transactions) => Promise.all(transactions.map(tx => removeTransaction(tx)))

  await Promise.all([
    ddbWhileLoop(params, ddbQuery, action),
    removeS3Objects(setup.getDbStatesBucketName(), userDb['database-id']),
    removeS3Objects(setup.getFilesBucketName(), userDb['database-id']),
  ])

  await purgeDatabase(userDb)

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purging transactions')
}

const _deleteConnectedStripeCustomer = async (customerId, stripeAccount, useTestClient) => {
  if (customerId && stripeAccount) {
    try {
      await stripe.getClient(useTestClient).customers.del(customerId, { stripeAccount })
    } catch (e) {
      // only ok to let fail if customer is already deleted
      if (e.message !== 'No such customer: ' + customerId) throw e
    }
  }
}

const _getAdmin = async (appId, _adminId = undefined, _admin = undefined) => {
  let admin
  if (_admin) {
    admin = _admin
  } else if (_adminId) {
    admin = await adminController.findAdminByAdminId(_adminId)
  } else {
    // the app will either be in regular app table, or permanent delete table if admin
    // has called .permanentDeleteApp() after purge of users began
    const [app, permanentDeletedApp] = await Promise.all([
      appController.getAppByAppId(appId),
      appController.getDeletedApp(appId),
    ])

    if (app) {
      admin = await adminController.findAdminByAdminId(app['admin-id'])
    } else if (permanentDeletedApp) {
      admin = await adminController.findAdminByAdminId(permanentDeletedApp['admin-id'])
    }
  }

  return admin
}

const deleteUserFromUsersTable = async (user) => {
  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.delete({
      TableName: setup.usersTableName,
      Key: {
        'username': user['username'],
        'app-id': user['app-id']
      },
      ConditionExpression: '#userId = :userId',
      ExpressionAttributeNames: {
        '#userId': 'user-id'
      },
      ExpressionAttributeValues: {
        ':userId': user['user-id']
      }
    }).promise()
  } catch (e) {
    // if a new user with the same username was created, safe to continue without deleting it
    if (e.name !== 'ConditionalCheckFailedException') throw e
  }
}

const purgeUser = async (user, _adminId = undefined, _admin = undefined) => {
  const start = Date.now()
  const logChildObject = { userId: user['user-id'], appId: user['app-id'], username: user['username'], deleted: user['deleted'] }
  logger.child(logChildObject).info('Purging user')

  // purge user's databases that user is an owner of
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
  const action = (userDbs) => Promise.all(userDbs.map(userDb => purgeTransactions(userDb)))
  await ddbWhileLoop(params, ddbQuery, action)

  // purge user's Stripe data if present
  const admin = await _getAdmin(user['app-id'], _adminId, _admin)
  if (admin) {
    logChildObject.adminId = admin['admin-id']
    logChildObject.prodCustomerId = user['prod-stripe-customer-id']
    logChildObject.testCustomerId = user['test-stripe-customer-id']
    logChildObject.stripeAccountId = admin['stripe-account-id']
    const useTestClient = true
    await Promise.all([
      _deleteConnectedStripeCustomer(user['test-stripe-customer-id'], admin['stripe-account-id'], useTestClient),
      _deleteConnectedStripeCustomer(user['prod-stripe-customer-id'], admin['stripe-account-id']),
    ])
  }

  // should only be present in this table if purging deleted app or admin.
  const deleteFromTable = deleteUserFromUsersTable(user)

  // should only be present in this table if purging deleted user
  const deleteFromDeletedTable = ddbClient.delete({
    TableName: setup.deletedUsersTableName,
    Key: {
      'user-id': user['user-id']
    }
  }).promise()

  await Promise.all([deleteFromDeletedTable, deleteFromTable])

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purging user')
}

const deleteAppFromAppsTable = async (app) => {
  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.delete({
      TableName: setup.appsTableName,
      Key: {
        'admin-id': app['admin-id'],
        'app-name': app['app-name']
      },
      ConditionExpression: '#appId = :appId',
      ExpressionAttributeNames: {
        '#appId': 'app-id'
      },
      ExpressionAttributeValues: {
        ':appId': app['app-id']
      }
    }).promise()
  } catch (e) {
    // if a new app with the same app name was created, safe to continue without deleting it
    if (e.name !== 'ConditionalCheckFailedException') throw e
  }
}

const purgeApp = async (app, _admin = undefined) => {
  const start = Date.now()
  const logChildObject = { userId: app['user-id'], appId: app['app-id'], adminId: app['admin-id'], appName: app['app-name'], deleted: app['deleted'] }
  logger.child(logChildObject).info('Purging app')

  // purge all app's users
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
  const action = (users) => Promise.all(users.map(user => purgeUser(user, app['admin-id'], _admin)))
  await ddbWhileLoop(params, ddbQuery, action)

  // should only be present in this table if purging deleted admin
  const deleteFromTable = deleteAppFromAppsTable(app)

  // should only be present in this table if purging deleted app
  const deleteFromDeletedTable = ddbClient.delete({
    TableName: setup.deletedAppsTableName,
    Key: {
      'app-id': app['app-id']
    }
  }).promise()

  await Promise.all([deleteFromDeletedTable, deleteFromTable])

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purging app')
}

const removeAccessToken = async (accessToken) => {
  await connection.ddbClient().delete({
    TableName: setup.adminAccessTokensTableName,
    Key: {
      'admin-id': accessToken['admin-id'],
      'label': accessToken['label']
    }
  }).promise()
}

const purgeAccessTokens = async (admin) => {
  const params = {
    TableName: setup.adminAccessTokensTableName,
    KeyConditionExpression: '#adminId = :adminId',
    ExpressionAttributeNames: {
      '#adminId': 'admin-id'
    },
    ExpressionAttributeValues: {
      ':adminId': admin['admin-id']
    }
  }

  const ddbClient = connection.ddbClient()

  const ddbQuery = (params) => ddbClient.query(params).promise()
  const action = (accessTokens) => Promise.all(accessTokens.map(accessToken => removeAccessToken(accessToken)))
  await ddbWhileLoop(params, ddbQuery, action)
}

const purgeApps = async (admin) => {
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
  const action = (apps) => Promise.all(apps.map(app => purgeApp(app, admin)))
  await ddbWhileLoop(params, ddbQuery, action)
}

const _deleteStripeCustomer = async (customerId) => {
  if (customerId) {
    try {
      await stripe.getClient().customers.del(customerId)
    } catch (e) {
      // only ok to let fail if customer is already deleted
      if (e.message !== 'No such customer: ' + customerId) throw e
    }
  }
}
const purgeAdmin = async (admin) => {
  const start = Date.now()
  const logChildObject = { adminId: admin['admin-id'], email: admin['email'], deleted: admin['deleted'] }
  logger.child(logChildObject).info('Purging admin')

  await Promise.all([
    purgeAccessTokens(admin),
    purgeApps(admin),
    _deleteStripeCustomer(admin['stripe-customer-id']),
  ])

  await connection.ddbClient().delete({
    TableName: setup.deletedAdminsTableName,
    Key: {
      'admin-id': admin['admin-id']
    }
  }).promise()

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purging admin')
}

const purgeDeletedUsers = async (nightlyId) => {
  const start = Date.now()
  const logChildObject = { nightlyId }
  logger.child(logChildObject).info('Purging deleted users')

  const params = {
    TableName: setup.deletedUsersTableName
  }

  const ddbClient = connection.ddbClient()

  const ddbQuery = (params) => ddbClient.scan(params).promise()
  const action = (users) => Promise.all(users.map(user => purgeUser(user)))
  await ddbWhileLoop(params, ddbQuery, action)

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purging deleted users')
}

const purgeDeletedApps = async (nightlyId) => {
  const start = Date.now()
  const logChildObject = { nightlyId }
  logger.child(logChildObject).info('Purging deleted apps')

  const params = {
    TableName: setup.deletedAppsTableName
  }

  const ddbClient = connection.ddbClient()

  const ddbQuery = (params) => ddbClient.scan(params).promise()
  const action = (apps) => Promise.all(apps.map(app => purgeApp(app)))
  await ddbWhileLoop(params, ddbQuery, action)

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purging deleted apps')
}

const purgeDeletedAdmins = async (nightlyId) => {
  const start = Date.now()
  const logChildObject = { nightlyId }
  logger.child(logChildObject).info('Purging deleted admins')

  const params = {
    TableName: setup.deletedAdminsTableName
  }

  const ddbQuery = (params) => connection.ddbClient().scan(params).promise()
  const action = (admins) => Promise.all(admins.map(admin => purgeAdmin(admin)))
  await ddbWhileLoop(params, ddbQuery, action)

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purging deleted admins')
}

const purge = async (nightlyId) => {
  const start = Date.now()
  const logChildObject = { nightlyId, start }

  try {
    logger.child(logChildObject).info('Commencing purge')

    // place deleted items in permanent deleted tables
    await Promise.all([
      scanForDeletedAdmins(nightlyId),
      scanForDeletedApps(nightlyId),
      scanForDeletedUsers(nightlyId),
    ])

    // purge items from permanent deleted tables. Do each synchronously because top level may delete level below it;
    // for example, purging admins will purge apps and users, reducing the number of deleted apps and deleted users
    await purgeDeletedAdmins(nightlyId)
    await purgeDeletedApps(nightlyId)
    await purgeDeletedUsers(nightlyId)

    logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purge')
  } catch (e) {
    logger.child({ timeToPurge: Date.now() - start, err: e, ...logChildObject }).fatal('Failed purge')
  }
}

export default purge
