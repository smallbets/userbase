import aws from 'aws-sdk'
import os from 'os'
import memcache from './memcache'

const tableNamePrefix = (process.env.NODE_ENV == 'development') ? os.userInfo().username + '-' : ''

const usersTableName = tableNamePrefix + 'users'
const sessionsTableName = tableNamePrefix + 'sessions'
const databaseTableName = tableNamePrefix + 'database'

const dbStatesBucketName = tableNamePrefix + 'db-states'

exports.usersTableName = usersTableName
exports.sessionsTableName = sessionsTableName
exports.databaseTableName = databaseTableName

let s3
const getS3Connection = () => s3
exports.s3 = getS3Connection
exports.dbStatesBucketName = dbStatesBucketName

exports.init = async function () {
  const profile = 'encrypted'

  const chain = new aws.CredentialProviderChain([
    function () { return new aws.EnvironmentCredentials('AWS') },
    function () { return new aws.EnvironmentCredentials('AMAZON') },
    function () { return new aws.SharedIniFileCredentials({ profile }) },
    function () { return new aws.ECSCredentials() },
    function () { return new aws.ProcessCredentials({ profile }) },
    function () { return new aws.EC2MetadataCredentials() }
  ])

  console.log('Loading AWS credentials')
  aws.config.credentials = await chain.resolvePromise()
  aws.config.update({ region: 'us-west-2' })

  await setupDdb()
  await setupS3()

  console.log('Eager loading in-memory transaction log cache')
  await memcache.eagerLoad()
  console.log('Loaded transaction log cache successfully')
}

async function setupDdb() {
  const ddb = new aws.DynamoDB({ apiVersion: '2012-08-10' })

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
      Projection: { ProjectionType: 'KEYS_ONLY' }
    }]
  }

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

  const databaseTableParams = {
    AttributeDefinitions: [
      { AttributeName: 'user-id', AttributeType: 'S' },
      { AttributeName: 'sequence-no', AttributeType: 'N' }
    ],
    KeySchema: [
      { AttributeName: 'user-id', KeyType: 'HASH' },
      { AttributeName: 'sequence-no', KeyType: 'RANGE' }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    TableName: databaseTableName
  }

  console.log('Creating DynamoDB tables if necessary')
  await Promise.all([
    createTable(ddb, usersTableParams),
    createTable(ddb, sessionsTableParams),
    createTable(ddb, databaseTableParams)])
}

async function setupS3() {
  s3 = new aws.S3({ apiVersion: '2006-03-01' })

  const bucketParams = {
    Bucket: dbStatesBucketName,
    ACL: 'private'
  }

  console.log('Creating S3 bucket if necessary')
  await createBucket(s3, bucketParams)
}

async function createTable(ddb, params) {
  try {
    await ddb.createTable(params).promise()
    console.log(`Table ${params.TableName} created successfully`)
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
    console.log(`Bucket ${params.Bucket} created successfully`)
  } catch (e) {
    if (!e.message.includes('Your previous request to create the named bucket succeeded')) {
      throw e
    }
  }

  await s3.waitFor('bucketExists', { Bucket: params.Bucket, $waiter: { delay: 2, maxAttempts: 60 } }).promise()
}
