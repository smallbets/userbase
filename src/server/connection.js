import aws from 'aws-sdk'

let ddbClient = null

exports.ddbClient = function () {
  if (ddbClient) return ddbClient
  ddbClient = new aws.DynamoDB.DocumentClient()
  return ddbClient
}
