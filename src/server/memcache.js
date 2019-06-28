import connection from './connection'
import setup from './setup'
import { sizeOfDdbOperations } from './utils'

function MemCache() {
  this.dbOperationLogByUserId = {}
}

MemCache.prototype.setOperationsInDbOperationLog = function (operations) {
  for (const operation of operations) {
    const userId = operation['user-id']
    const sequenceNo = operation['sequence-no']
    if (!this.dbOperationLogByUserId[userId]) this.initUser(userId)
    this.dbOperationLogByUserId[userId].operationArray[sequenceNo] = operation
  }
}

MemCache.prototype.setBundleSeqNosInDbOperationLog = function (users) {
  for (const user of users) {
    const userId = user['user-id']
    const bundleSeqNo = user['bundle-seq-no']
    if (!this.dbOperationLogByUserId[userId]) this.initUser(userId)
    this.setBundleSeqNo(userId, bundleSeqNo)
  }
}

MemCache.prototype.eagerLoadDbOperationLog = async function () {
  const params = {
    TableName: setup.databaseTableName,
  }

  const ddbClient = connection.ddbClient()
  let dbOperationsResponse = await ddbClient.scan(params).promise()
  let operations = dbOperationsResponse.Items

  // Warning: db operation log must fit in memory, otherwise
  // node will crash inside this while loop.
  //
  // Optimization note: this can be sped up by parallel scanning the table
  while (dbOperationsResponse.LastEvaluatedKey) {
    params.ExclusiveStartKey = dbOperationsResponse.LastEvaluatedKey
    const dbOperationsPromise = ddbClient.scan(params).promise()
    this.setOperationsInDbOperationLog(operations)
    dbOperationsResponse = await dbOperationsPromise
    operations = dbOperationsResponse.Items
  }

  this.setOperationsInDbOperationLog(operations)
}

MemCache.prototype.eagerLoadBundleSeqNos = async function () {
  const params = {
    TableName: setup.usersTableName,
  }

  const ddbClient = connection.ddbClient()
  let usersResponse = await ddbClient.scan(params).promise()
  let users = usersResponse.Items

  // Optimization note: this can be sped up by parallel scanning the table
  while (usersResponse.LastEvaluatedKey) {
    params.ExclusiveStartKey = usersResponse.LastEvaluatedKey
    const usersPromise = ddbClient.scan(params).promise()
    this.setBundleSeqNosInDbOperationLog(users)
    usersResponse = await usersPromise
    users = usersResponse.Items
  }

  this.setBundleSeqNosInDbOperationLog(users)
}

MemCache.prototype.eagerLoad = async function () {
  return Promise.all([
    this.eagerLoadDbOperationLog(),
    this.eagerLoadBundleSeqNos()
  ])
}

MemCache.prototype.initUser = function (userId) {
  this.dbOperationLogByUserId[userId] = {
    operationArray: [],
    bundleSeqNo: null
  }
}

MemCache.prototype.pushOperation = function (operation) {
  const userId = operation['user-id']

  const operationToPush = {
    ...operation,
    persistingToDisk: true
  }
  const sequenceNo = this.dbOperationLogByUserId[userId].operationArray.push(operationToPush) - 1

  this.dbOperationLogByUserId[userId].operationArray[sequenceNo]['sequence-no'] = sequenceNo

  return {
    ...operation,
    'sequence-no': sequenceNo
  }
}

MemCache.prototype.operationPersistedToDisk = function (operationWithSequenceNo) {
  const userId = operationWithSequenceNo['user-id']
  const sequenceNo = operationWithSequenceNo['sequence-no']
  delete this.dbOperationLogByUserId[userId].operationArray[sequenceNo].persistingToDisk
}

MemCache.prototype.getOperations = function (userId, startingSeqNo) {
  const dbOperationLog = this.dbOperationLogByUserId[userId].operationArray
  const result = []
  for (let i = startingSeqNo; i < dbOperationLog.length; i++) {
    const operation = dbOperationLog[i]

    if (operation && operation.persistingToDisk) {
      break
    } else if (operation) {
      result.push(operation)
    }
  }

  return result
}

MemCache.prototype.setBundleSeqNo = function (userId, bundleSeqNo) {
  this.dbOperationLogByUserId[userId].bundleSeqNo = Number(bundleSeqNo)
}

MemCache.prototype.getBundleSeqNo = function (userId) {
  return this.dbOperationLogByUserId[userId].bundleSeqNo
}

MemCache.prototype.getStartingSeqNo = function (bundleSeqNo) {
  return bundleSeqNo ? bundleSeqNo + 1 : 0
}

MemCache.prototype.getSizeOfOperationLog = function (userId, startingSeqNo) {
  const operations = this.getOperations(userId, startingSeqNo)
  return sizeOfDdbOperations(operations)
}

export default new MemCache()
