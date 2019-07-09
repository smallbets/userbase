import connection from './connection'
import setup from './setup'

exports.findUserByUserId = async function (userId) {
  const params = {
    TableName: setup.usersTableName,
    IndexName: 'UserIdIndex',
    KeyConditionExpression: '#userId = :userId',
    ExpressionAttributeNames: {
      '#userId': 'user-id'
    },
    ExpressionAttributeValues: {
      ':userId': userId
    },
  }

  const ddbClient = connection.ddbClient()
  const userResponse = await ddbClient.query(params).promise()

  if (!userResponse || userResponse.Items.length === 0) return null

  if (userResponse.Items.length > 1) {
    console.warn(`Too many users found with id ${userId}`)
  }

  return userResponse.Items[0]
}
