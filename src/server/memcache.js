import connection from './connection'
import setup from './setup'

function MemCache() {
  this.transactionLogByUserId = {}
}

MemCache.prototype.setTransactionsInTransactionLog = function (transactions) {
  for (const transaction of transactions) {
    const userId = transaction['user-id']
    const sequenceNo = transaction['sequence-no']
    if (!this.transactionLogByUserId[userId]) this.initUser(userId)
    this.transactionLogByUserId[userId].transactionArray[sequenceNo] = transaction
  }
}

MemCache.prototype.setBundleSeqNosInTransactionLog = function (users) {
  for (const user of users) {
    const userId = user['user-id']
    const bundleSeqNo = user['bundle-seq-no']
    if (!this.transactionLogByUserId[userId]) this.initUser(userId)
    this.setBundleSeqNo(userId, bundleSeqNo)
  }
}

MemCache.prototype.eagerLoadTransactionLog = async function () {
  const params = {
    TableName: setup.databaseTableName,
  }

  const ddbClient = connection.ddbClient()
  let transactionLogResponse = await ddbClient.scan(params).promise()
  let transactions = transactionLogResponse.Items

  // Warning: transaction log must fit in memory, otherwise
  // node will crash inside this while loop.
  //
  // Optimization note: this can be sped up by parallel scanning the table
  while (transactionLogResponse.LastEvaluatedKey) {
    params.ExclusiveStartKey = transactionLogResponse.LastEvaluatedKey
    const transactionLogPromise = ddbClient.scan(params).promise()
    this.setTransactionsInTransactionLog(transactions)
    transactionLogResponse = await transactionLogPromise
    transactions = transactionLogResponse.Items
  }

  this.setTransactionsInTransactionLog(transactions)
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
    this.setBundleSeqNosInTransactionLog(users)
    usersResponse = await usersPromise
    users = usersResponse.Items
  }

  this.setBundleSeqNosInTransactionLog(users)
}

MemCache.prototype.eagerLoad = async function () {
  return Promise.all([
    this.eagerLoadTransactionLog(),
    this.eagerLoadBundleSeqNos()
  ])
}

MemCache.prototype.initUser = function (userId) {
  this.transactionLogByUserId[userId] = {
    transactionArray: [],
    bundleSeqNo: null
  }
}

MemCache.prototype.pushTransaction = function (transaction) {
  const userId = transaction['user-id']

  const transactionToPush = {
    ...transaction,
    persistingToDisk: true
  }
  const sequenceNo = this.transactionLogByUserId[userId].transactionArray.push(transactionToPush) - 1

  this.transactionLogByUserId[userId].transactionArray[sequenceNo]['sequence-no'] = sequenceNo

  return {
    ...transaction,
    'sequence-no': sequenceNo
  }
}

MemCache.prototype.transactionPersistedToDisk = function (transactionWithSequenceNo) {
  const userId = transactionWithSequenceNo['user-id']
  const sequenceNo = transactionWithSequenceNo['sequence-no']
  delete this.transactionLogByUserId[userId].transactionArray[sequenceNo].persistingToDisk
}

MemCache.prototype.getTransactions = function (userId, startingSeqNo) {
  const transactionLog = this.transactionLogByUserId[userId].transactionArray
  const result = []
  for (let i = startingSeqNo; i < transactionLog.length; i++) {
    const transaction = transactionLog[i]

    if (transaction && transaction.persistingToDisk) {
      break
    } else if (transaction) {
      result.push(transaction)
    }
  }

  return result
}

MemCache.prototype.setBundleSeqNo = function (userId, bundleSeqNo) {
  this.transactionLogByUserId[userId].bundleSeqNo = Number(bundleSeqNo)
}

MemCache.prototype.getBundleSeqNo = function (userId) {
  return this.transactionLogByUserId[userId].bundleSeqNo
}

MemCache.prototype.getStartingSeqNo = function (bundleSeqNo) {
  return bundleSeqNo ? bundleSeqNo + 1 : 0
}

export default new MemCache()
