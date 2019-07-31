import connection from './connection'
import setup from './setup'
import db from './db'

const SECONDS_BEFORE_ROLLBACK_TRIGGERED = 10

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
    persistingToDdb: process.hrtime(),
  }
  const sequenceNo = this.transactionLogByUserId[userId].transactionArray.push(transactionToPush) - 1

  this.transactionLogByUserId[userId].transactionArray[sequenceNo]['sequence-no'] = sequenceNo

  return {
    ...transaction,
    'sequence-no': sequenceNo
  }
}

MemCache.prototype.transactionPersistedToDdb = function (transactionWithSequenceNo) {
  const userId = transactionWithSequenceNo['user-id']
  const sequenceNo = transactionWithSequenceNo['sequence-no']
  delete this.transactionLogByUserId[userId].transactionArray[sequenceNo].persistingToDdb
}

MemCache.prototype.transactionRolledBack = function (transactionWithRollbackCommand) {
  const userId = transactionWithRollbackCommand['user-id']
  const sequenceNo = transactionWithRollbackCommand['sequence-no']
  this.transactionLogByUserId[userId].transactionArray[sequenceNo] = transactionWithRollbackCommand
}

MemCache.prototype.getTransactions = function (userId, startingSeqNo, inclusive = true) {
  const transactionLog = this.transactionLogByUserId[userId].transactionArray

  const result = []
  let encounteredTransactionPersistingToDdb = false
  for (let i = startingSeqNo; i < transactionLog.length; i++) {
    const transaction = transactionLog[i]

    if (transaction && transaction.persistingToDdb) {
      encounteredTransactionPersistingToDdb = true

      const timeSinceAttemptToPersistToDdb = process.hrtime(transaction.persistingToDdb)
      const secondsSinceAttemptToPersistToDdb = timeSinceAttemptToPersistToDdb[0]

      if (secondsSinceAttemptToPersistToDdb > SECONDS_BEFORE_ROLLBACK_TRIGGERED) {
        // attempt to rollback so that next query gets further than this. No
        // need to hold up query waiting for this to finish and do not need
        // to know whether or not this rollback succeeds
        db.rollbackTransaction(transaction)
      } else {
        break
      }

    } else if (transaction && transaction.command !== 'rollback' && !encounteredTransactionPersistingToDdb) {
      if (inclusive || transaction['sequence-no'] > startingSeqNo) {
        result.push(transaction)
      }
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
