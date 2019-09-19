import uuidv4 from 'uuid/v4'
import crypto from './Crypto'
import SortedArray from 'sorted-array'
import ws from './ws'

const success = 'Success'
const itemAlreadyExists = 'Item already exists'
const itemAlreadyDeleted = 'Item already deleted'
const versionConflict = 'Version conflict'
const wsNotOpen = 'Web Socket not open'
const dbNotOpen = 'Database not open'
const dbAlreadyOpen = 'Database already open'
const keyNotFound = 'Key not found'

class UnverifiedTransaction {
  constructor(startSeqNo) {
    this.startSeqNo = startSeqNo
    this.txSeqNo = null
    this.transactions = {}
    this.promiseResolve = null
    this.promiseReject = null
    this.index = null
  }

  getStartSeqNo() {
    return this.startSeqNo
  }

  getIndex() {
    return this.index
  }

  setIndex(index) {
    this.index = index
  }

  async getResult(seqNo) {
    this.txSeqNo = seqNo

    const promise = new Promise((resolve, reject) => {
      this.promiseResolve = resolve
      this.promiseReject = reject

      setTimeout(() => { reject(new Error('timeout')) }, 5000)
    })

    this.verifyPromise()

    return promise
  }

  verifyPromise() {
    if (!this.txSeqNo && this.txSeqNo != 0) {
      return
    }

    if (!this.promiseResolve || !this.promiseReject) {
      return
    }

    if (this.transactions[this.txSeqNo]) {
      if (this.transactions[this.txSeqNo] == 'Success') {
        this.promiseResolve()
      } else {
        this.promiseReject(new Error(this.transactions[this.txSeqNo]))
      }
    }
  }

  addTransaction(transaction, code) {
    this.transactions[transaction.seqNo] = code
    this.verifyPromise()
  }
}

class Database {
  constructor(changeHandler) {
    this.onChange = changeHandler

    this.items = {}

    const compareItems = (a, b) => {
      if (a.seqNo < b.seqNo || (a.seqNo === b.seqNo && a.indexInBatch < b.indexInBatch)) {
        return -1
      }
      if (a.seqNo > b.seqNo || (a.seqNo === b.seqNo && a.indexInBatch > b.indexInBatch)) {
        return 1
      }
      return 0
    }

    this.itemsIndex = new SortedArray([], compareItems)
    this.unverifiedTransactions = []
    this.lastSeqNo = -1
    this.init = false
    this.dbKey = null
  }

  async applyTransactions(transactions) {
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i]
      const seqNo = transaction.seqNo

      const transactionCode = await this.applyTransaction(this.dbKey, transaction)
      this.lastSeqNo = seqNo

      for (let j = 0; j < this.unverifiedTransactions.length; j++) {
        if (!this.unverifiedTransactions[j] || seqNo < this.unverifiedTransactions[j].getStartSeqNo()) {
          continue
        }
        this.unverifiedTransactions[j].addTransaction(transactions[i], transactionCode)
      }
    }
  }

  applyBundle(bundle, bundleSeqNo) {
    for (let i = 0; i < bundle.itemsIndex.length; i++) {
      const itemIndex = bundle.itemsIndex[i]
      const itemId = bundle.itemsIndex[i].itemId
      const item = bundle.items[itemId]

      this.items[itemId] = item
      this.itemsIndex.insert(itemIndex)
    }

    this.lastSeqNo = bundleSeqNo
  }

  async applyTransaction(key, transaction) {
    const seqNo = transaction.seqNo
    const command = transaction.command

    switch (command) {
      case 'Insert': {
        const record = await crypto.aesGcm.decryptJson(key, transaction.record)
        const itemId = record.id
        const item = record.item

        try {
          this.validateInsert(itemId)
        } catch (transactionCode) {
          return transactionCode
        }

        return this.applyInsert(itemId, seqNo, item)
      }

      case 'Update': {
        const record = await crypto.aesGcm.decryptJson(key, transaction.record)
        const itemId = record.id
        const item = record.item
        const __v = record.__v

        try {
          this.validateUpdateOrDelete(itemId, __v)
        } catch (transactionCode) {
          return transactionCode
        }

        return this.applyUpdate(itemId, item, __v)
      }

      case 'Delete': {
        const record = await crypto.aesGcm.decryptJson(key, transaction.record)
        const itemId = record.id
        const __v = record.__v

        try {
          this.validateUpdateOrDelete(itemId, __v)
        } catch (transactionCode) {
          return transactionCode
        }

        return this.applyDelete(itemId)
      }

      case 'Batch': {
        const batch = transaction.operations
        const recordPromises = []

        for (const operation of batch) {
          recordPromises.push(operation.record && crypto.aesGcm.decryptJson(key, operation.record))
        }
        const records = await Promise.all(recordPromises)

        try {
          this.validateBatch(batch, records)
        } catch (transactionCode) {
          return transactionCode
        }

        return this.applyBatch(seqNo, batch, records)
      }
    }
  }

  validateInsert(itemId) {
    if (this.items[itemId]) {
      throw itemAlreadyExists
    }
  }

  validateUpdateOrDelete(itemId, __v) {
    if (!this.items[itemId]) {
      throw itemAlreadyDeleted
    }

    const currentVersion = this.getItemVersionNumber(itemId)
    if (__v <= currentVersion) {
      throw versionConflict
    }
  }

  applyInsert(itemId, seqNo, record, indexInBatch) {
    const item = { seqNo }
    if (typeof indexInBatch === 'number') item.indexInBatch = indexInBatch

    this.items[itemId] = {
      ...item,
      record,
      __v: 0
    }
    this.itemsIndex.insert({ ...item, itemId })
    return success
  }

  applyUpdate(itemId, record, __v) {
    this.items[itemId].record = record
    this.items[itemId].__v = __v
    return success
  }

  applyDelete(itemId) {
    this.itemsIndex.remove(this.items[itemId])
    delete this.items[itemId]
    return success
  }

  validateBatch(batch, records) {
    const uniqueItemIds = {}

    for (let i = 0; i < batch.length; i++) {
      const operation = batch[i]

      const itemId = records[i].id
      const __v = records[i].__v

      if (uniqueItemIds[itemId]) throw new Error('Only allowed one operation per item')
      uniqueItemIds[itemId] = true

      switch (operation.command) {
        case 'Insert':
          this.validateInsert(itemId)
          break

        case 'Update':
        case 'Delete':
          this.validateUpdateOrDelete(itemId, __v)
          break
      }
    }
  }

  applyBatch(seqNo, batch, records) {
    for (let i = 0; i < batch.length; i++) {
      const operation = batch[i]

      const itemId = records[i].id
      const item = records[i].item
      const __v = records[i].__v

      switch (operation.command) {
        case 'Insert':
          this.applyInsert(itemId, seqNo, item, i)
          break

        case 'Update':
          this.applyUpdate(itemId, item, __v)
          break

        case 'Delete':
          this.applyDelete(itemId, __v)
          break
      }
    }

    return success
  }

  registerUnverifiedTransaction() {
    const unverifiedTransaction = new UnverifiedTransaction(this.lastSeqNo)
    const i = this.unverifiedTransactions.push(unverifiedTransaction)
    unverifiedTransaction.setIndex(i)
    return unverifiedTransaction
  }

  unregisterUnverifiedTransaction(pendingTransaction) {
    delete this.unverifiedTransactions[pendingTransaction.getIndex()]
  }

  getItems() {
    const result = []
    for (let i = 0; i < this.itemsIndex.array.length; i++) {
      const itemId = this.itemsIndex.array[i].itemId
      const record = this.items[itemId].record
      result.push({ itemId, record })
    }
    return result
  }

  getItemVersionNumber(itemId) {
    return this.items[itemId].__v
  }
}

const createDatabase = async (dbName, metadata) => {
  if (!ws.connected) throw new Error(wsNotOpen)
  if (!ws.keys.init) throw new Error(keyNotFound)

  const dbId = uuidv4()

  const dbKey = await crypto.aesGcm.generateKey()
  const dbKeyString = await crypto.aesGcm.getKeyStringFromKey(dbKey)

  const [dbNameHash, encryptedDbKey, encryptedDbName, encryptedMetadata] = await Promise.all([
    crypto.hmac.signString(ws.keys.hmacKey, dbName),
    crypto.aesGcm.encryptString(ws.keys.masterKey, dbKeyString),
    crypto.aesGcm.encryptString(dbKey, dbName),
    metadata && crypto.aesGcm.encryptJson(dbKey, metadata)
  ])

  const action = 'CreateDatabase'
  const params = {
    dbNameHash,
    dbId,
    encryptedDbKey,
    encryptedDbName,
    encryptedMetadata,
  }
  await ws.request(action, params)
}

const openDatabase = async (dbName, changeHandler) => {
  if (!ws.connected) throw new Error(wsNotOpen)
  if (!ws.keys.init) throw new Error(keyNotFound)

  const dbNameHash = ws.state.dbNameToHash[dbName] || await crypto.hmac.signString(ws.keys.hmacKey, dbName)
  ws.state.dbNameToHash[dbName] = dbNameHash

  if (ws.state.databases[dbNameHash] && ws.state.databases[dbNameHash].init) {
    throw new Error(dbAlreadyOpen)
  }

  ws.state.databases[dbNameHash] = new Database(changeHandler)

  const action = 'OpenDatabase'
  const params = { dbNameHash }
  await ws.request(action, params)
}

const getOpenDb = (dbName) => {
  const dbNameHash = ws.state.dbNameToHash[dbName]
  const database = ws.state.databases[dbNameHash]
  if (!dbNameHash || !database || !database.init) throw new Error(dbNotOpen)
  return database
}

const insert = async (dbName, item, id) => {
  const database = getOpenDb(dbName)

  const action = 'Insert'
  const params = await _buildInsertParams(database, item, id)

  await postTransaction(database, action, params)
}

const _buildInsertParams = async (database, item, id) => {
  if (!item) throw new Error('Insert missing item')

  const itemId = id || uuidv4()

  const itemKey = await crypto.hmac.signString(ws.keys.hmacKey, itemId)
  const itemRecord = { id: itemId, item }
  const encryptedItem = await crypto.aesGcm.encryptJson(database.dbKey, itemRecord)

  return { itemKey, encryptedItem }
}

const update = async (dbName, id, item) => {
  const database = getOpenDb(dbName)

  const action = 'Update'
  const params = await _buildUpdateParams(database, id, item)

  await postTransaction(database, action, params)
}

const _buildUpdateParams = async (database, itemId, item) => {
  if (!itemId) throw new Error('Update missing item id')
  if (!item) throw new Error('Update missing item')

  const itemKey = await crypto.hmac.signString(ws.keys.hmacKey, itemId)
  const currentVersion = database.getItemVersionNumber(itemId)
  const itemRecord = { id: itemId, item, __v: currentVersion + 1 }
  const encryptedItem = await crypto.aesGcm.encryptJson(database.dbKey, itemRecord)

  return { itemKey, encryptedItem }
}

const delete_ = async (dbName, id) => {
  const database = getOpenDb(dbName)

  const action = 'Delete'
  const params = await _buildDeleteParams(database, id)

  await postTransaction(database, action, params)
}

const _buildDeleteParams = async (database, itemId) => {
  if (!itemId) throw new Error('Delete missing item id')

  const itemKey = await crypto.hmac.signString(ws.keys.hmacKey, itemId)
  const currentVersion = database.getItemVersionNumber(itemId)
  const itemRecord = { id: itemId, __v: currentVersion + 1 }
  const encryptedItem = await crypto.aesGcm.encryptJson(database.dbKey, itemRecord)

  return { itemKey, encryptedItem }
}

const batch = async (dbName, operations) => {
  const database = getOpenDb(dbName)

  const action = 'Batch'

  const operationParamsPromises = operations.map(operation => {

    const command = operation.command

    switch (command) {
      case 'Insert': {
        const id = operation.id
        const item = operation.item

        return _buildInsertParams(database, item, id)
      }

      case 'Update': {
        const id = operation.id
        const item = operation.item

        return _buildUpdateParams(database, id, item)
      }

      case 'Delete': {
        const id = operation.id

        return _buildDeleteParams(database, id)
      }

      default: throw new Error('Unknown command')
    }
  })

  const operationParams = await Promise.all(operationParamsPromises)

  const params = {
    operations: operations.map((operation, i) => ({
      command: operation.command,
      ...operationParams[i]
    }))
  }

  await postTransaction(database, action, params)
}

const postTransaction = async (database, action, params) => {
  const pendingTx = database.registerUnverifiedTransaction()

  const paramsWithDbData = {
    ...params,
    dbId: database.dbId,
    dbNameHash: ws.state.dbIdToHash[database.dbId]
  }

  const response = await ws.request(action, paramsWithDbData)
  const seqNo = response.data.sequenceNo

  await pendingTx.getResult(seqNo)

  database.unregisterUnverifiedTransaction(pendingTx)

  return seqNo
}

const findDatabases = async () => {
  if (!ws.connected) throw new Error(wsNotOpen)
  if (!ws.keys.init) throw new Error(keyNotFound)

  const action = 'FindDatabases'
  const databasesResponse = await ws.request(action)

  const result = []
  for (const db of databasesResponse.data) {
    const dbKeyString = await crypto.aesGcm.decryptString(ws.keys.masterKey, db.encryptedDbKey)
    const dbKey = await crypto.aesGcm.getKeyFromKeyString(dbKeyString)

    const dbName = await crypto.aesGcm.decryptString(dbKey, db.dbName)
    const metadata = db.metadata && await crypto.aesGcm.decryptJson(dbKey, db.metadata)

    result.push({
      dbName,
      metadata,
      owner: db.owner,
      access: db.access
    })
  }
  return result
}

export default {
  openDatabase,
  createDatabase,
  findDatabases,
  close,
  insert,
  update,
  'delete': delete_,
  batch,

  // used internally
  getOpenDb
}
