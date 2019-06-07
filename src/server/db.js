import uuidv4 from 'uuid/v4'
import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'

// DynamoDB limit: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Limits.html#limits-items
const FOUR_HUNDRED_KBS = 400 * 1024

exports.insert = async function (req, res) {
  if (req.readableLength > FOUR_HUNDRED_KBS) return res
    .status(statusCodes['Bad Request'])
    .send({ readableMessage: 'Encrypted blob is too large' })

  const userId = res.locals.userId

  try {
    // Warning: if the server receives many large simultaneous requests, memory could fill up here.
    // The solution to this is to read the buffer in small chunks and pipe the chunks to
    // the data store. S3 offers this. I can't find an implementation in DynamoDB for this.
    const buffer = req.read()

    const item = {
      'user-id': userId,
      'item-id': uuidv4(),
      command: 'Insert',
      record: buffer,
      'sequence-no': 0 // TO-DO: atomic counter increase
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
    return res.send({ 'item-id': item['item-id'], 'sequence-no': item['sequence-no'] })
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
