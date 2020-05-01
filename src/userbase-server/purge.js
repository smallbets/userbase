import uuidv4 from 'uuid/v4'
import logger from './logger'
import setup from './setup'
import connection from './connection'
import connections from './ws'
import userController from './user'
import appController from './app'
import adminController from './admin'
import { getMsUntil1AmPst } from './utils'
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

const scanForDeletedApps = async (purgeId) => {
  const start = Date.now()
  const logChildObject = { purgeId }
  logger.child(logChildObject).info('Scanning for deleted apps')

  await scanForDeleted(
    setup.appsTableName,
    (app) => connections.closeAppsConnectedClients(app['app-id']),
    (app) => appController.permanentDelete(app['admin-id'], app['app-name'], app['app-id'])
  )

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished scanning for deleted apps')
}

const scanForDeletedAdmins = async (purgeId) => {
  const start = Date.now()
  const logChildObject = { purgeId }
  logger.child(logChildObject).info('Scanning for deleted admins')

  await scanForDeleted(
    setup.adminTableName,
    (admin) => connections.closeAdminsConnectedClients(admin['admin-id']),
    (admin) => adminController.permanentDelete(admin)
  )

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished scanning for deleted admins')
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

const removeDatabase = async (userDb) => {
  // delete inside transaction to maintain reference in case of failure
  const params = {
    TransactItems: [{
      Delete: {
        TableName: setup.databaseTableName,
        Key: {
          'database-id': userDb['database-id']
        }
      }
    }, {
      Delete: {
        TableName: setup.userDatabaseTableName,
        Key: {
          'user-id': userDb['user-id'],
          'database-name-hash': userDb['database-name-hash']
        }
      }
    }]
  }

  await connection.ddbClient().transactWrite(params).promise()
}

const removeS3DatabaseStates = async (databaseId) => {
  const params = {
    Bucket: setup.getDbStatesBucketName(),
    Prefix: databaseId
  }

  let dbStatesResponse = await setup.s3().listObjectsV2(params).promise()
  if (!dbStatesResponse.KeyCount) return

  const deleteParams = {
    Bucket: setup.getDbStatesBucketName(),
    Delete: {
      Objects: dbStatesResponse.Contents.map(dbState => ({ Key: dbState.Key }))
    }
  }

  await setup.s3().deleteObjects(deleteParams).promise()

  while (dbStatesResponse.IsTruncated) {
    params.ContinuationToken = dbStatesResponse.NextContinuationToken
    dbStatesResponse = await setup.s3().listObjectsV2(params).promise()
    if (!dbStatesResponse.KeyCount) return

    deleteParams.Delete.Objects = dbStatesResponse.Contents.map(dbState => ({ Key: dbState.Key }))

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
  logger.child(logChildObject).info('Purging transactions')

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
    removeS3DatabaseStates(userDb['database-id'])
  ])

  await removeDatabase(userDb)

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purging transactions')
}

const _deleteConnectedStripeCustomer = async (customerId, stripe_account, useTestClient) => {
  if (customerId && stripe_account) {
    try {
      await stripe.getClient(useTestClient).customers.del(customerId, { stripe_account })
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

const purgeUser = async (user, _adminId = undefined, _admin = undefined) => {
  const start = Date.now()
  const logChildObject = { userId: user['user-id'], appId: user['app-id'], username: user['username'], deleted: user['deleted'] }
  logger.child(logChildObject).info('Purging user')

  // purge all user's databases
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

  // should only be present in this table if purging deleted app or admin
  const deleteFromTable = ddbClient.delete({
    TableName: setup.usersTableName,
    Key: {
      'username': user['username'],
      'app-id': user['app-id']
    }
  }).promise()

  // should only be present in this table if purging deleted user
  const deleteFromDeletedTable = ddbClient.delete({
    TableName: setup.deletedUsersTableName,
    Key: {
      'user-id': user['user-id']
    }
  }).promise()

  // safe to just try and delete from both
  await Promise.all([deleteFromDeletedTable, deleteFromTable])

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purging user')
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
  const deleteFromTable = ddbClient.delete({
    TableName: setup.appsTableName,
    Key: {
      'admin-id': app['admin-id'],
      'app-name': app['app-name']
    }
  }).promise()

  // should only be present in this table if purging deleted app
  const deleteFromDeletedTable = ddbClient.delete({
    TableName: setup.deletedAppsTableName,
    Key: {
      'app-id': app['app-id']
    }
  }).promise()

  // safe to just try and delete from both
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

const purgeDeletedUsers = async (purgeId) => {
  const start = Date.now()
  const logChildObject = { purgeId }
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

const purgeDeletedApps = async (purgeId) => {
  const start = Date.now()
  const logChildObject = { purgeId }
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

const purgeDeletedAdmins = async (purgeId) => {
  const start = Date.now()
  const logChildObject = { purgeId }
  logger.child(logChildObject).info('Purging deleted admins')

  const params = {
    TableName: setup.deletedAdminsTableName
  }

  const ddbQuery = (params) => connection.ddbClient().scan(params).promise()
  const action = (admins) => Promise.all(admins.map(admin => purgeAdmin(admin)))
  await ddbWhileLoop(params, ddbQuery, action)

  logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purging deleted admins')
}

const commencePurge = async (purgeId) => {
  const start = Date.now()
  const logChildObject = { purgeId }

  try {
    logger.child(logChildObject).info('Commencing purge')

    // place deleted items in permanent deleted tables
    await Promise.all([
      scanForDeletedAdmins(purgeId),
      scanForDeletedApps(purgeId),
      scanForDeletedUsers(purgeId),
    ])

    // purge items from permanent deleted tables. Do each synchronously because top level may delete level below it;
    // for example, purging admins will purge apps and users, reducing the number of deleted apps and deleted users
    await purgeDeletedAdmins(purgeId)
    await purgeDeletedApps(purgeId)
    await purgeDeletedUsers(purgeId)

    logger.child({ timeToPurge: Date.now() - start, ...logChildObject }).info('Finished purge')
  } catch (e) {
    logger.child({ timeToPurge: Date.now() - start, err: e, ...logChildObject }).fatal('Failed purge')
  }

  schedulePurge()
}

const schedulePurge = () => {
  const msUntil1AmPst = getMsUntil1AmPst()

  // quick and dirty way to reduce the chance >1 instances run the purge at the same time. Ok if 2 happen
  // to run at the same time, worst case is 1 encounters a conflict error and fails, but other should succeed
  const randomTwoHourWindow = Math.random() * 2 * MS_IN_AN_HOUR
  const nextPurgeStart = msUntil1AmPst + randomTwoHourWindow

  const purgeId = uuidv4()

  // schedule next purge to start some time between 1am - 3am PST
  setTimeout(() => commencePurge(purgeId), nextPurgeStart)

  logger.child({ purgeId, nextPurge: new Date(Date.now() + nextPurgeStart).toISOString() }).info('Scheduled purge')
}

export default function () {
  schedulePurge()
}
