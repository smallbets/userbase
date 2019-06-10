import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'

const findUserByUserId = async function (userId) {
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

exports.findUserByUserId = findUserByUserId

exports.find = async function (req, res) {
  const userId = res.locals.userId

  try {
    const user = await findUserByUserId(userId)

    if (!user) return res
      .status(statusCodes['Not Found'])
      .send({ readableMessage: 'User not found' })

    res.send(user)
  } catch (e) {
    return res
      .status(e.statusCode || statusCodes['Internal Server Error'])
      .send({ err: `Failed to get user with ${e}` })
  }
}
