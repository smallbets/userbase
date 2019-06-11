import uuidv4 from 'uuid/v4'
import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import userController from './user'

/**
 * Atomically increments the last sequence no on a user and returns the updated sequence no.
 *
 * Safe to keep this outside a tx because it's ok if there are non-existent ops for a sequence no.
 * For example, assume the user's last sequence no gets set to 5 and then the insert operation fails
 * -- there will be no associated insert operation with sequence no 5. This is ok.
 *
 * @param {String} userId
 * @returns {Number} user's updated last sequence no
 */
const setNextSequenceNo = async function (userId) {
  const user = await userController.findUserByUserId(userId)
  const username = user.username

  const atomicIncrementUserSeqNoParams = {
    TableName: setup.usersTableName,
    Key: {
      username: username // if username changes before update is called but after it's found by user id, this will fail
    },
    ExpressionAttributeNames: {
      '#lastSequenceNo': 'last-sequence-no',
      '#userId': 'user-id'
    },
    ExpressionAttributeValues: {
      ':incrementSequenceNo': 1,
      ':userId': userId
    },
    UpdateExpression: 'SET #lastSequenceNo = #lastSequenceNo + :incrementSequenceNo',
    ConditionExpression: '#userId = :userId',
    ReturnValues: 'UPDATED_NEW'
  }

  const ddbClient = connection.ddbClient()
  const updatedUser = await ddbClient.update(atomicIncrementUserSeqNoParams).promise()
  return updatedUser.Attributes['last-sequence-no']
}

exports.insert = async function (req, res) {
  // DynamoDB limit: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Limits.html#limits-items
  const FOUR_HUNDRED_KBS = 400 * 1024

  if (req.readableLength > FOUR_HUNDRED_KBS) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Encrypted blob is too large' })

  const userId = res.locals.userId

  try {
    const sequenceNo = await setNextSequenceNo(userId)

    // Warning: if the server receives many large simultaneous requests, memory could fill up here.
    // The solution to this is to read the buffer in small chunks and pipe the chunks to
    // S3 and store the S3 URL in DynamoDB.
    const buffer = req.read()

    const item = {
      'user-id': userId,
      'item-id': uuidv4(),
      command: 'Insert',
      record: buffer,
      'sequence-no': sequenceNo
    }

    const params = {
      TableName: setup.databaseTableName,
      Item: item,
      ConditionExpression: 'attribute_not_exists(#userId)',
      ExpressionAttributeNames: {
        '#userId': 'user-id'
      },
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.put(params).promise()
    return res.send({
      'item-id': item['item-id'],
      'sequence-no': item['sequence-no']
    })
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to sign up with ${e}` })
  }
}

exports.delete = function (req, res) {
  res.send('Got a Delete request')
}

exports.update = function (req, res) {
  res.send('Got an Update request')
}

exports.query = async function (req, res) {
  const userId = res.locals.userId

  const params = {
    TableName: setup.databaseTableName,
    KeyName: '#userId',
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
    const itemsResponse = await ddbClient.query(params).promise()
    return res.send(itemsResponse.Items)
  } catch (e) {
    return res
      .status(statusCodes['Internal Server Error'])
      .send({ err: `Failed to sign up with ${e}` })
  }
}
