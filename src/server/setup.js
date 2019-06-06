import aws from 'aws-sdk'
import os from 'os'

const tableNamePrefix = (process.env.NODE_ENV == 'development') ? os.userInfo().username + '-' : ''

const usersTableName = tableNamePrefix + 'users'
const sessionsTableName = tableNamePrefix + 'sessions'
const databaseTableName = tableNamePrefix + 'database'

exports.usersTableName = usersTableName
exports.sessionsTableName = sessionsTableName
exports.databaseTableName = databaseTableName

exports.init = function () {
  aws.config.update({ region: 'us-west-2' })
  aws.config.credentials = new aws.SharedIniFileCredentials({ profile: 'encrypted' })

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
      { AttributeName: 'username', AttributeType: 'S' },
      { AttributeName: 'sequence-no', AttributeType: 'N' }
    ],
    KeySchema: [
      { AttributeName: 'username', KeyType: 'HASH' },
      { AttributeName: 'sequence-no', KeyType: 'RANGE' }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    TableName: databaseTableName
  }

  Promise.all([
    createTable(ddb, usersTableParams),
    createTable(ddb, sessionsTableParams),
    createTable(ddb, databaseTableParams)])
}

function createTable(ddb, params) {
  return ddb.createTable(params).promise()
    .then(() => { console.log(`Table ${params.TableName} created successfully`) },
      (err) => {
        if (err != undefined && err.message.includes('Table already exists')) {
          return Promise.resolve()
        }

        throw err
      })
}
