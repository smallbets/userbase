import aws from 'aws-sdk'
import os from 'os'
import logger from './logger'
import memcache from './memcache'

// if running in dev mode, prefix the DynamoDB tables and S3 buckets with the username
const usernamePrefix = (process.env.NODE_ENV == 'development') ? os.userInfo().username + '-' : ''

const usersTableName = usernamePrefix + 'users'
const sessionsTableName = usernamePrefix + 'sessions'
const databaseTableName = usernamePrefix + 'database'
const transactionsTableName = usernamePrefix + 'transactions'
const keyExchangeTableName = usernamePrefix + 'key-exchange'
const dbStatesBucketName = usernamePrefix + 'db-states'

exports.usersTableName = usersTableName
exports.sessionsTableName = sessionsTableName
exports.databaseTableName = databaseTableName
exports.transactionsTableName = transactionsTableName
exports.keyExchangeTableName = keyExchangeTableName

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

  // the users table holds a record per user
  const usersTableParams = {
    TableName: usersTableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'username', AttributeType: 'S' },
      { AttributeName: 'user-id', AttributeType: 'S' }
    ],
    KeySchema: [
      { AttributeName: 'username', KeyType: 'HASH' }
    ],
    GlobalSecondaryIndexes: [{
      IndexName: 'UserIdIndex',
      KeySchema: [
        { AttributeName: 'user-id', KeyType: 'HASH' }
      ],
      Projection: { ProjectionType: 'ALL' }
    }]
  }

  // the sessions table holds a record per user session
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
      { AttributeName: 'user-id', AttributeType: 'S' },
      { AttributeName: 'database-name-hash', AttributeType: 'S' },
      { AttributeName: 'database-id', AttributeType: 'S' }
    ],
    KeySchema: [
      { AttributeName: 'user-id', KeyType: 'HASH' },
      { AttributeName: 'database-name-hash', KeyType: 'RANGE' }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    TableName: databaseTableName,
    GlobalSecondaryIndexes: [{
      IndexName: 'DatabaseIdIndex',
      KeySchema: [
        { AttributeName: 'database-id', KeyType: 'HASH' }
      ],
      Projection: { ProjectionType: 'ALL' }
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
  const keyExchangeTableParams = {
    AttributeDefinitions: [
      { AttributeName: 'user-id', AttributeType: 'S' },
      { AttributeName: 'requester-public-key', AttributeType: 'B' }
    ],
    KeySchema: [
      { AttributeName: 'user-id', KeyType: 'HASH' },
      { AttributeName: 'requester-public-key', KeyType: 'RANGE' }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    TableName: keyExchangeTableName
  }

  logger.info('Creating DynamoDB tables if necessary')
  await Promise.all([
    createTable(ddb, usersTableParams),
    createTable(ddb, sessionsTableParams),
    createTable(ddb, databaseTableParams),
    createTable(ddb, transactionsTableParams),
    createTable(ddb, keyExchangeTableParams)])
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
