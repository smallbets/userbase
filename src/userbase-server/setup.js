import aws from 'aws-sdk'
import os from 'os'
import logger from './logger'
import memcache from './memcache'

// if running in dev mode, prefix the DynamoDB tables and S3 buckets with the username
const usernamePrefix = (process.env.NODE_ENV == 'development') ? os.userInfo().username + '-' : ''

const adminTableName = usernamePrefix + 'admin'
const appsTableName = usernamePrefix + 'apps'
const usersTableName = usernamePrefix + 'users'
const sessionsTableName = usernamePrefix + 'sessions'
const databaseTableName = usernamePrefix + 'database'
const userDatabaseTableName = usernamePrefix + 'user-database'
const transactionsTableName = usernamePrefix + 'transactions'
const seedExchangeTableName = usernamePrefix + 'seed-exchange'
const databaseAccessGrantsTableName = usernamePrefix + 'database-access-grants'
const dbStatesBucketName = usernamePrefix + 'db-states'

exports.adminTableName = adminTableName
exports.appsTableName = appsTableName
exports.usersTableName = usersTableName
exports.sessionsTableName = sessionsTableName
exports.databaseTableName = databaseTableName
exports.userDatabaseTableName = userDatabaseTableName
exports.transactionsTableName = transactionsTableName
exports.seedExchangeTableName = seedExchangeTableName
exports.databaseAccessGrantsTableName = databaseAccessGrantsTableName

const adminIdIndex = 'AdminIdIndex'
const userIdIndex = 'UserIdIndex'
const appIdIndex = 'AppIdIndex'
const userDatabaseIdIndex = 'UserDatabaseIdIndex'

exports.adminIdIndex = adminIdIndex
exports.userIdIndex = userIdIndex
exports.appIdIndex = appIdIndex
exports.userDatabaseIdIndex = userDatabaseIdIndex

let s3
const getS3Connection = () => s3
exports.s3 = getS3Connection
exports.dbStatesBucketName = dbStatesBucketName

exports.init = async function () {
  // look for AWS credentials under the 'encrypted' profile
  const profile = 'encrypted'

  // create a custom AWS credentials chain to provide the custom profile
  const chain = new aws.CredentialProviderChain([
    function () { return new aws.EnvironmentCredentials('AWS') },
    function () { return new aws.EnvironmentCredentials('AMAZON') },
    function () { return new aws.SharedIniFileCredentials({ profile }) },
    function () { return new aws.ECSCredentials() },
    function () { return new aws.ProcessCredentials({ profile }) },
    function () { return new aws.EC2MetadataCredentials() }
  ])

  logger.info('Loading AWS credentials')
  aws.config.credentials = await chain.resolvePromise()
  aws.config.update({ region: 'us-west-2' })

  await setupDdb()
  await setupS3()
  await setupSM()

  logger.info('Eager loading in-memory transaction log cache')
  await memcache.eagerLoad()
  logger.info('Loaded transaction log cache successfully')
}

async function setupDdb() {
  const ddb = new aws.DynamoDB({ apiVersion: '2012-08-10' })

  // the admin table holds a record per admin account
  const adminTableParams = {
    TableName: adminTableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'admin-name', AttributeType: 'S' },
      { AttributeName: 'admin-id', AttributeType: 'S' }
    ],
    KeySchema: [
      { AttributeName: 'admin-name', KeyType: 'HASH' }
    ],
    GlobalSecondaryIndexes: [{
      IndexName: adminIdIndex,
      KeySchema: [
        { AttributeName: 'admin-id', KeyType: 'HASH' }
      ],
      Projection: { ProjectionType: 'ALL' }
    }]
  }

  // the apps table holds a record for apps per admin account
  const appsTableParams = {
    TableName: appsTableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'admin-id', AttributeType: 'S' },
      { AttributeName: 'app-name', AttributeType: 'S' }
    ],
    KeySchema: [
      { AttributeName: 'admin-id', KeyType: 'HASH' },
      { AttributeName: 'app-name', KeyType: 'RANGE' }
    ]
  }

  // the users table holds a record for user per app
  const usersTableParams = {
    TableName: usersTableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'username', AttributeType: 'S' },
      { AttributeName: 'app-id', AttributeType: 'S' },
      { AttributeName: 'user-id', AttributeType: 'S' }
    ],
    KeySchema: [
      { AttributeName: 'username', KeyType: 'HASH' },
      { AttributeName: 'app-id', KeyType: 'RANGE' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: userIdIndex,
        KeySchema: [
          { AttributeName: 'user-id', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' }
      },
      {
        IndexName: appIdIndex,
        KeySchema: [
          { AttributeName: 'app-id', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' }
      }
    ]
  }

  // the sessions table holds a record per admin OR user session
  const sessionsTableParams = {
    AttributeDefinitions: [
      { AttributeName: 'session-id', AttributeType: 'S' }
    ],
    KeySchema: [
      { AttributeName: 'session-id', KeyType: 'HASH' }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    TableName: sessionsTableName
  }

  // the database table holds a record per database
  const databaseTableParams = {
    AttributeDefinitions: [
      { AttributeName: 'database-id', AttributeType: 'S' }
    ],
    KeySchema: [
      { AttributeName: 'database-id', KeyType: 'HASH' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    TableName: databaseTableName,
  }

  // the user database table holds a record for each user database relationship
  const userDatabaseTableParams = {
    AttributeDefinitions: [
      { AttributeName: 'user-id', AttributeType: 'S' },
      { AttributeName: 'database-name-hash', AttributeType: 'S' },
      { AttributeName: 'database-id', AttributeType: 'S' }
    ],
    KeySchema: [
      { AttributeName: 'user-id', KeyType: 'HASH' },
      { AttributeName: 'database-name-hash', KeyType: 'RANGE' }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    TableName: userDatabaseTableName,
    GlobalSecondaryIndexes: [{
      IndexName: userDatabaseIdIndex,
      KeySchema: [
        { AttributeName: 'database-id', KeyType: 'HASH' },
        { AttributeName: 'user-id', KeyType: 'RANGE' },
      ],
      Projection: {
        NonKeyAttributes: [
          'database-id'
        ],
        ProjectionType: 'INCLUDE'
      }
    }]
  }

  // the transactions table holds a record per database transaction
  const transactionsTableParams = {
    AttributeDefinitions: [
      { AttributeName: 'database-id', AttributeType: 'S' },
      { AttributeName: 'sequence-no', AttributeType: 'N' }
    ],
    KeySchema: [
      { AttributeName: 'database-id', KeyType: 'HASH' },
      { AttributeName: 'sequence-no', KeyType: 'RANGE' }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    TableName: transactionsTableName
  }

  // the key exchange table holds key data per user request
  const seedExchangeTableParams = {
    AttributeDefinitions: [
      { AttributeName: 'user-id', AttributeType: 'S' },
      { AttributeName: 'requester-public-key', AttributeType: 'S' }
    ],
    KeySchema: [
      { AttributeName: 'user-id', KeyType: 'HASH' },
      { AttributeName: 'requester-public-key', KeyType: 'RANGE' }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    TableName: seedExchangeTableName
  }
  const seedExchangeTimeToLive = {
    TableName: seedExchangeTableName,
    TimeToLiveSpecification: {
      AttributeName: 'ttl',
      Enabled: true
    }
  }

  // holds key data per db access grant
  const databaseAccessGrantsTableParams = {
    AttributeDefinitions: [
      { AttributeName: 'grantee-id', AttributeType: 'S' },
      { AttributeName: 'database-id', AttributeType: 'S' }
    ],
    KeySchema: [
      { AttributeName: 'grantee-id', KeyType: 'HASH' },
      { AttributeName: 'database-id', KeyType: 'RANGE' }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    TableName: databaseAccessGrantsTableName
  }
  const databaseAccessGrantTimeToLive = {
    TableName: databaseAccessGrantsTableName,
    TimeToLiveSpecification: {
      AttributeName: 'ttl',
      Enabled: true
    }
  }

  logger.info('Creating DynamoDB tables if necessary')
  await Promise.all([
    createTable(ddb, adminTableParams),
    createTable(ddb, appsTableParams),
    createTable(ddb, usersTableParams),
    createTable(ddb, sessionsTableParams),
    createTable(ddb, databaseTableParams),
    createTable(ddb, userDatabaseTableParams),
    createTable(ddb, transactionsTableParams),
    createTable(ddb, seedExchangeTableParams),
    createTable(ddb, databaseAccessGrantsTableParams)
  ])

  logger.info('Setting time to live on tables if necessary')
  await Promise.all([
    setTimeToLive(ddb, seedExchangeTimeToLive),
    setTimeToLive(ddb, databaseAccessGrantTimeToLive)
  ])
}

async function setupS3() {
  s3 = new aws.S3({ apiVersion: '2006-03-01' })

  const bucketParams = {
    Bucket: dbStatesBucketName,
    ACL: 'private'
  }

  logger.info('Creating S3 bucket if necessary')
  await createBucket(s3, bucketParams)
}

async function createTable(ddb, params) {
  try {
    await ddb.createTable(params).promise()
    logger.info(`Table ${params.TableName} created successfully`)
  } catch (e) {
    if (!e.message.includes('Table already exists')) {
      throw e
    }
  }

  await ddb.waitFor('tableExists', { TableName: params.TableName, $waiter: { delay: 2, maxAttempts: 60 } }).promise()
}

async function setTimeToLive(ddb, params) {
  try {
    await ddb.updateTimeToLive(params).promise()
    logger.info(`Time to live set on ${params.TableName} successfully`)
  } catch (e) {
    if (!e.message.includes('TimeToLive is already enabled')) {
      throw e
    }
  }
}

async function createBucket(s3, params) {
  try {
    await s3.createBucket(params).promise()
    logger.info(`Bucket ${params.Bucket} created successfully`)
  } catch (e) {
    if (!e.message.includes('Your previous request to create the named bucket succeeded')) {
      throw e
    }
  }

  await s3.waitFor('bucketExists', { Bucket: params.Bucket, $waiter: { delay: 2, maxAttempts: 60 } }).promise()
}

async function setupSM() {
  const sm = new aws.SecretsManager()

  const secret = await sm.getSecretValue({ SecretId: 'env' }).promise()

  for (const [key, value] of Object.entries(JSON.parse(secret.SecretString))) {
    process.env['sm.' + key] = value
  }
}
