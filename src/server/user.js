import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'

exports.query = async function (req, res) {
  const userId = res.locals.userId

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

  try {
    const ddbClient = connection.ddbClient()
    const userResponse = await ddbClient.query(params).promise()

    if (!userResponse || userResponse.Items.length === 0) return res
      .status(statusCodes['Not Found'])
      .send({ readableMessage: 'User not found' })

    if (userResponse.Items.length > 1) {
      console.warn(`Too many users found with id ${userId}`)
    }

    const user = userResponse.Items[0]

    res.send(user)
  } catch (e) {
    return res
      .status(e.statusCode || statusCodes['Internal Server Error'])
      .send({ err: `Failed to get user with ${e}` })
  }
}
