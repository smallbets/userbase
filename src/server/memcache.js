import connection from './connection'
import setup from './setup'
import db from './db'

const SECONDS_BEFORE_ROLLBACK_TRIGGERED = 10

// source: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/CapacityUnitCalculations.html
const sizeOfDdbItem = (item) => {
  let bytes = 0

  for (let attribute in item) {
    if (!item.hasOwnProperty(attribute)) continue

    bytes += attribute.length

    const value = item[attribute]

    switch (typeof value) {
      case 'string':
        bytes += value.length // The size of a string is(length of attribute name) + (number of UTF - 8 - encoded bytes).
        break
      case 'number':
        bytes += Math.ceil((value.toString().length / 2)) + 1 // Numbers are variable length, with up to 38 significant digits.Leading and trailing zeroes are trimmed.The size of a number is approximately(length of attribute name) + (1 byte per two significant digits) + (1 byte).
        break
      case 'boolean':
        bytes += 1 // The size of a null attribute or a Boolean attribute is(length of attribute name) + (1 byte).
        break
      default:
        if (value.type === 'Buffer') {
          bytes += value.data.length // The size of a binary attribute is (length of attribute name) + (number of raw bytes).
        }
    }
  }

  return bytes
}

function MemCache() {
  this.transactionLogByDatabaseId = {}
}

MemCache.prototype.setTransactionsInTransactionLog = function (transactions) {
  for (const transaction of transactions) {
    const databaseId = transaction['database-id']
    const sequenceNo = transaction['sequence-no']
    if (!this.transactionLogByDatabaseId[databaseId]) this.initDatabase(databaseId)
    this.transactionLogByDatabaseId[databaseId].transactionArray[sequenceNo] = transaction
  }
}

MemCache.prototype.setBundleSeqNosInTransactionLog = function (databases) {
  for (const database of databases) {
    const databaseId = database['database-id']
    const bundleSeqNo = database['bundle-seq-no']
    if (!this.transactionLogByDatabaseId[databaseId]) this.initDatabase(databaseId)
    this.setBundleSeqNo(databaseId, bundleSeqNo)
  }
}

MemCache.prototype.eagerLoadTransactionLog = async function () {
  const params = {
    TableName: setup.transactionsTableName,
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
    TableName: setup.databaseTableName,
  }

  const ddbClient = connection.ddbClient()
  let databasesResponse = await ddbClient.scan(params).promise()
  let databases = databasesResponse.Items

  // Optimization note: this can be sped up by parallel scanning the table
  while (databasesResponse.LastEvaluatedKey) {
    params.ExclusiveStartKey = databasesResponse.LastEvaluatedKey
    const databasesPromise = ddbClient.scan(params).promise()
    this.setBundleSeqNosInTransactionLog(databases)
    databasesResponse = await databasesPromise
    databases = databasesResponse.Items
  }

  this.setBundleSeqNosInTransactionLog(databases)
}

MemCache.prototype.eagerLoad = async function () {
  return Promise.all([
    this.eagerLoadTransactionLog(),
    this.eagerLoadBundleSeqNos()
  ])
}

MemCache.prototype.initDatabase = function (databaseId) {
  this.transactionLogByDatabaseId[databaseId] = {
    transactionArray: [],
    bundleSeqNo: null
  }
}

MemCache.prototype.pushTransaction = function (transaction) {
  const databaseId = transaction['database-id']

  const transactionToPush = {
    ...transaction,
    persistingToDdb: process.hrtime(),
  }
  const sequenceNo = this.transactionLogByDatabaseId[databaseId].transactionArray.push(transactionToPush) - 1

  this.transactionLogByDatabaseId[databaseId].transactionArray[sequenceNo]['sequence-no'] = sequenceNo

  return {
    ...transaction,
    'sequence-no': sequenceNo
  }
}

MemCache.prototype.transactionPersistedToDdb = function (transactionWithSequenceNo) {
  const databaseId = transactionWithSequenceNo['database-id']
  const sequenceNo = transactionWithSequenceNo['sequence-no']
  delete this.transactionLogByDatabaseId[databaseId].transactionArray[sequenceNo].persistingToDdb
}

MemCache.prototype.transactionRolledBack = function (transactionWithRollbackCommand) {
  const databaseId = transactionWithRollbackCommand['database-id']
  const sequenceNo = transactionWithRollbackCommand['sequence-no']
  this.transactionLogByDatabaseId[databaseId].transactionArray[sequenceNo] = transactionWithRollbackCommand
}

MemCache.prototype.getTransactions = function (databaseId, startingSeqNo, inclusive = true) {
  const transactionLog = this.transactionLogByDatabaseId[databaseId].transactionArray

  const log = []
  let encounteredTransactionPersistingToDdb = false
  let size = 0
  for (let i = startingSeqNo; i < transactionLog.length; i++) {
    const transaction = transactionLog[i]
    size += sizeOfDdbItem(transaction)

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
        const outputTransaction = {
          seqNo: transaction['sequence-no'],
          command: transaction['command'],
          key: transaction['key'],
          record: transaction['record'],

          // from batch transaction
          operations: transaction['operations'],
          dbId: transaction['database-id']
        }

        log.push(outputTransaction)
      }
    }
  }

  return { log, size }
}

MemCache.prototype.setBundleSeqNo = function (databaseId, bundleSeqNo) {
  this.transactionLogByDatabaseId[databaseId].bundleSeqNo = Number(bundleSeqNo)
}

MemCache.prototype.getBundleSeqNo = function (databaseId) {
  return this.transactionLogByDatabaseId[databaseId].bundleSeqNo
}

MemCache.prototype.getStartingSeqNo = function (bundleSeqNo) {
  return bundleSeqNo ? bundleSeqNo + 1 : 0
}

export default new MemCache()
