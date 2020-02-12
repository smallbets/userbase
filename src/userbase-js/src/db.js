import uuidv4 from 'uuid/v4'
import SortedArray from 'sorted-array'
import crypto from './Crypto'
import ws from './ws'
import errors from './errors'
import statusCodes from './statusCodes'
import { byteSizeOfString, Queue, objectHasOwnProperty } from './utils'

const success = 'Success'

const MAX_DB_NAME_CHAR_LENGTH = 50
const MAX_ITEM_ID_CHAR_LENGTH = 100

const MAX_ITEM_KB = 10
const TEN_KB = MAX_ITEM_KB * 1024
const MAX_ITEM_BYTES = TEN_KB

const _parseGenericErrors = (e) => {
  if (e.response) {
    if (e.response.data === 'UserNotFound') {
      throw new errors.UserNotFound
    } else if (e.response.status === statusCodes['Internal Server Error']) {
      throw new errors.InternalServerError
    } else if (e.response.status === statusCodes['Gateway Timeout']) {
      throw new errors.Timeout
    }
  } else if (e.message && e.message.includes('timeout')) {
    throw new errors.Timeout
  }
}

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

      setTimeout(() => { reject(new Error('timeout')) }, 10000)
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
        this.promiseReject(this.transactions[this.txSeqNo])
      }
    }
  }

  addTransaction(transaction, code) {
    if (this.transactions[transaction.seqNo]) return
    this.transactions[transaction.seqNo] = code
    this.verifyPromise()
  }
}

class Database {
  constructor(changeHandler, receivedMessage) {
    this.onChange = changeHandler

    this.items = {}

    const compareItems = (a, b) => {
      if (a.seqNo < b.seqNo || (a.seqNo === b.seqNo && a.operationIndex < b.operationIndex)) {
        return -1
      }
      if (a.seqNo > b.seqNo || (a.seqNo === b.seqNo && a.operationIndex > b.operationIndex)) {
        return 1
      }
      return 0
    }

    this.itemsIndex = new SortedArray([], compareItems)
    this.unverifiedTransactions = []
    this.lastSeqNo = 0
    this.init = false
    this.dbKey = null
    this.receivedMessage = receivedMessage

    // Queue that ensures 'ApplyTransactions' executes one at a time
    this.applyTransactionsQueue = new Queue()
  }

  async applyTransactions(transactions) {
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i]
      const seqNo = transaction.seqNo

      // client must only apply transcations in sequence
      if (seqNo !== this.lastSeqNo + 1) {
        console.warn(`Client attempted to apply transaction with seq no ${seqNo} when last seq no is ${this.lastSeqNo}`)
        continue
      }

      const transactionCode = await this.applyTransaction(this.dbKey, transaction)
      this.lastSeqNo = seqNo

      for (let j = 0; j < this.unverifiedTransactions.length; j++) {
        if (!this.unverifiedTransactions[j] || seqNo < this.unverifiedTransactions[j].getStartSeqNo()) {
          continue
        }
        this.unverifiedTransactions[j].addTransaction(transactions[i], transactionCode)
      }

      if (this.init && transactionCode === 'Success') {
        this.onChange(this.getItems())
      }
    }

    if (!this.init) {
      this.onChange(this.getItems())
    }
  }

  applyBundle(bundle, bundleSeqNo) {
    // client must only apply bundle when opening state
    if (this.lastSeqNo !== 0) {
      console.warn(`Client attempted to apply bundle when last seq no is ${this.lastSeqNo}`)
      return
    }

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

      case 'BatchTransaction': {
        const batch = transaction.operations
        const recordPromises = []

        for (const operation of batch) {
          recordPromises.push(operation.record && crypto.aesGcm.decryptJson(key, operation.record))
        }
        const records = await Promise.all(recordPromises)

        try {
          this.validateBatchTransaction(batch, records)
        } catch (transactionCode) {
          return transactionCode
        }

        return this.applyBatchTransaction(seqNo, batch, records)
      }

      case 'Rollback': {
        // no-op
        return
      }

      default: {
        console.warn(`Unknown command: ${command}`)
        return
      }
    }
  }

  validateInsert(itemId) {
    if (this.items[itemId]) {
      throw new errors.ItemAlreadyExists
    }
  }

  validateUpdateOrDelete(itemId, __v) {
    if (!this.items[itemId]) {
      throw new errors.ItemDoesNotExist
    }

    const currentVersion = this.getItemVersionNumber(itemId)
    if (__v <= currentVersion) {
      throw new errors.ItemUpdateConflict
    }
  }

  itemExists(itemId) {
    return objectHasOwnProperty(this.items, itemId)
  }

  applyInsert(itemId, seqNo, record, operationIndex) {
    const item = { seqNo }
    if (typeof operationIndex === 'number') item.operationIndex = operationIndex

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

  validateBatchTransaction(batch, records) {
    const uniqueItemIds = {}

    for (let i = 0; i < batch.length; i++) {
      const operation = batch[i]

      const itemId = records[i].id
      const __v = records[i].__v

      if (uniqueItemIds[itemId]) throw new errors.OperationsConflict
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

  applyBatchTransaction(seqNo, batch, records) {
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
    unverifiedTransaction.setIndex(i - 1)
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
      result.push({ itemId, item: record })
    }
    return result
  }

  getItemVersionNumber(itemId) {
    return this.items[itemId].__v
  }
}

const _openDatabase = async (dbNameHash, changeHandler, newDatabaseParams) => {
  try {
    const database = ws.state.databases[dbNameHash]

    let receivedMessage

    const firstMessageFromWebSocket = new Promise((resolve, reject) => {
      receivedMessage = resolve
      setTimeout(() => reject(new Error('timeout')), 20000)
    })

    if (!database) {
      ws.state.databases[dbNameHash] = new Database(changeHandler, receivedMessage)
    } else {

      // safe to replace -- enables idempotent calls to openDatabase
      database.onChange = changeHandler

      // if 1 call succeeds, all idempotent calls succeed
      const currentReceivedMessage = database.receivedMessage
      database.receivedMessage = () => {
        currentReceivedMessage()
        receivedMessage()
      }

      // database is already open, can return successfully
      if (database.init) {
        changeHandler(database.getItems())
        database.receivedMessage()
        return
      }
    }

    const action = 'OpenDatabase'
    const params = { dbNameHash, newDatabaseParams }

    try {
      await ws.request(action, params)
      await firstMessageFromWebSocket
    } catch (e) {
      if (e.response && e.response.data === 'Database already creating') {
        throw new errors.DatabaseAlreadyOpening
      }

      throw e
    }

  } catch (e) {
    _parseGenericErrors(e)
    throw e
  }
}

const _createDatabase = async (dbName) => {
  const dbId = uuidv4()

  const dbKey = await crypto.aesGcm.generateKey()
  const dbKeyString = await crypto.aesGcm.getKeyStringFromKey(dbKey)

  const [encryptedDbKey, encryptedDbName] = await Promise.all([
    crypto.aesGcm.encryptString(ws.keys.encryptionKey, dbKeyString),
    crypto.aesGcm.encryptString(dbKey, dbName)
  ])

  const newDatabaseParams = {
    dbId,
    encryptedDbKey,
    encryptedDbName
  }
  return newDatabaseParams
}

const _validateDbInput = (params) => {
  if (typeof params !== 'object') throw new errors.ParamsMustBeObject

  if (!objectHasOwnProperty(params, 'databaseName')) throw new errors.DatabaseNameMissing

  const dbName = params.databaseName

  if (typeof dbName !== 'string') throw new errors.DatabaseNameMustBeString
  if (dbName.length === 0) throw new errors.DatabaseNameCannotBeBlank
  if (dbName.length > MAX_DB_NAME_CHAR_LENGTH) throw new errors.DatabaseNameTooLong(MAX_DB_NAME_CHAR_LENGTH)

  if (ws.reconnecting) throw new errors.Reconnecting
  if (!ws.keys.init) throw new errors.UserNotSignedIn
}

const openDatabase = async (params) => {
  try {
    _validateDbInput(params)
    if (!objectHasOwnProperty(params, 'changeHandler')) throw new errors.ChangeHandlerMissing

    const { databaseName, changeHandler } = params

    if (typeof changeHandler !== 'function') throw new errors.ChangeHandlerMustBeFunction

    const dbNameHash = ws.state.dbNameToHash[databaseName] || await crypto.hmac.signString(ws.keys.hmacKey, databaseName)
    ws.state.dbNameToHash[databaseName] = dbNameHash // eslint-disable-line require-atomic-updates

    const newDatabaseParams = await _createDatabase(databaseName)
    await _openDatabase(dbNameHash, changeHandler, newDatabaseParams)
  } catch (e) {

    switch (e.name) {
      case 'ParamsMustBeObject':
      case 'DatabaseAlreadyOpening':
      case 'DatabaseNameMustBeString':
      case 'DatabaseNameMissing':
      case 'DatabaseNameCannotBeBlank':
      case 'DatabaseNameTooLong':
      case 'ChangeHandlerMissing':
      case 'ChangeHandlerMustBeFunction':
      case 'UserNotSignedIn':
      case 'UserNotFound':
      case 'TooManyRequests':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }
  }
}

const getOpenDb = (dbName) => {
  const dbNameHash = ws.state.dbNameToHash[dbName]
  const database = ws.state.databases[dbNameHash]
  if (!dbNameHash || !database || !database.init) throw new errors.DatabaseNotOpen
  return database
}

const insertItem = async (params) => {
  try {
    _validateDbInput(params)

    const database = getOpenDb(params.databaseName)

    const action = 'Insert'
    const insertParams = await _buildInsertParams(database, params)

    await postTransaction(database, action, insertParams)

  } catch (e) {

    switch (e.name) {
      case 'ParamsMustBeObject':
      case 'DatabaseNotOpen':
      case 'DatabaseNameMissing':
      case 'DatabaseNameMustBeString':
      case 'DatabaseNameCannotBeBlank':
      case 'DatabaseNameTooLong':
      case 'ItemIdMustBeString':
      case 'ItemIdCannotBeBlank':
      case 'ItemIdTooLong':
      case 'ItemMissing':
      case 'ItemTooLarge':
      case 'ItemAlreadyExists':
      case 'UserNotSignedIn':
      case 'UserNotFound':
      case 'TooManyRequests':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }

  }
}

const _buildInsertParams = async (database, params) => {
  if (!objectHasOwnProperty(params, 'item')) throw new errors.ItemMissing

  const { item, itemId } = params

  if (objectHasOwnProperty(params, 'itemId')) {
    if (typeof itemId !== 'string') throw new errors.ItemIdMustBeString
    if (itemId.length === 0) throw new errors.ItemIdCannotBeBlank
    if (itemId.length > MAX_ITEM_ID_CHAR_LENGTH) throw new errors.ItemIdTooLong(MAX_ITEM_ID_CHAR_LENGTH)
  }

  const itemString = JSON.stringify(item)
  if (byteSizeOfString(itemString) > MAX_ITEM_BYTES) throw new errors.ItemTooLarge(MAX_ITEM_KB)

  const id = itemId || uuidv4()

  const itemKey = await crypto.hmac.signString(ws.keys.hmacKey, id)
  const itemRecord = { id, item }
  const encryptedItem = await crypto.aesGcm.encryptJson(database.dbKey, itemRecord)

  return { itemKey, encryptedItem }
}

const updateItem = async (params) => {
  try {
    _validateDbInput(params)

    const database = getOpenDb(params.databaseName)

    const action = 'Update'
    const updateParams = await _buildUpdateParams(database, params)

    await postTransaction(database, action, updateParams)
  } catch (e) {

    switch (e.name) {
      case 'ParamsMustBeObject':
      case 'DatabaseNotOpen':
      case 'DatabaseNameMissing':
      case 'DatabaseNameMustBeString':
      case 'DatabaseNameCannotBeBlank':
      case 'DatabaseNameTooLong':
      case 'ItemIdMissing':
      case 'ItemIdMustBeString':
      case 'ItemIdCannotBeBlank':
      case 'ItemIdTooLong':
      case 'ItemMissing':
      case 'ItemTooLarge':
      case 'ItemDoesNotExist':
      case 'ItemUpdateConflict':
      case 'UserNotSignedIn':
      case 'UserNotFound':
      case 'TooManyRequests':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable
    }

  }
}

const _buildUpdateParams = async (database, params) => {
  if (!objectHasOwnProperty(params, 'item')) throw new errors.ItemMissing
  if (!objectHasOwnProperty(params, 'itemId')) throw new errors.ItemIdMissing

  const { item, itemId } = params

  if (typeof itemId !== 'string') throw new errors.ItemIdMustBeString
  if (itemId.length === 0) throw new errors.ItemIdCannotBeBlank
  if (itemId.length > MAX_ITEM_ID_CHAR_LENGTH) throw new errors.ItemIdTooLong(MAX_ITEM_ID_CHAR_LENGTH)

  if (!database.itemExists(itemId)) throw new errors.ItemDoesNotExist

  const itemString = JSON.stringify(item)
  if (byteSizeOfString(itemString) > MAX_ITEM_BYTES) throw new errors.ItemTooLarge(MAX_ITEM_KB)

  const itemKey = await crypto.hmac.signString(ws.keys.hmacKey, itemId)
  const currentVersion = database.getItemVersionNumber(itemId)
  const itemRecord = { id: itemId, item, __v: currentVersion + 1 }
  const encryptedItem = await crypto.aesGcm.encryptJson(database.dbKey, itemRecord)

  return { itemKey, encryptedItem }
}

const deleteItem = async (params) => {
  try {
    _validateDbInput(params)

    const database = getOpenDb(params.databaseName)

    const action = 'Delete'
    const deleteParams = await _buildDeleteParams(database, params)

    await postTransaction(database, action, deleteParams)
  } catch (e) {

    switch (e.name) {
      case 'ParamsMustBeObject':
      case 'DatabaseNotOpen':
      case 'DatabaseNameMissing':
      case 'DatabaseNameMustBeString':
      case 'DatabaseNameCannotBeBlank':
      case 'DatabaseNameTooLong':
      case 'ItemIdMissing':
      case 'ItemIdMustBeString':
      case 'ItemIdCannotBeBlank':
      case 'ItemIdTooLong':
      case 'ItemDoesNotExist':
      case 'ItemUpdateConflict':
      case 'UserNotSignedIn':
      case 'UserNotFound':
      case 'TooManyRequests':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }

  }
}

const _buildDeleteParams = async (database, params) => {
  if (!objectHasOwnProperty(params, 'itemId')) throw new errors.ItemIdMissing

  const { itemId } = params

  if (typeof itemId !== 'string') throw new errors.ItemIdMustBeString
  if (itemId.length === 0) throw new errors.ItemIdCannotBeBlank
  if (itemId.length > MAX_ITEM_ID_CHAR_LENGTH) throw new errors.ItemIdTooLong(MAX_ITEM_ID_CHAR_LENGTH)

  if (!database.itemExists(itemId)) throw new errors.ItemDoesNotExist

  const itemKey = await crypto.hmac.signString(ws.keys.hmacKey, itemId)
  const currentVersion = database.getItemVersionNumber(itemId)
  const itemRecord = { id: itemId, __v: currentVersion + 1 }
  const encryptedItem = await crypto.aesGcm.encryptJson(database.dbKey, itemRecord)

  return { itemKey, encryptedItem }
}

const putTransaction = async (params) => {
  try {
    _validateDbInput(params)
    if (!objectHasOwnProperty(params, 'operations')) throw new errors.OperationsMissing

    const { databaseName, operations } = params

    if (!Array.isArray(operations)) throw new errors.OperationsMustBeArray

    const database = getOpenDb(databaseName)

    const action = 'BatchTransaction'

    const operationParamsPromises = await Promise.all(operations.map(operation => {
      const command = operation.command

      switch (command) {
        case 'Insert': {
          return _buildInsertParams(database, operation)
        }

        case 'Update': {
          return _buildUpdateParams(database, operation)
        }

        case 'Delete': {
          return _buildDeleteParams(database, operation)
        }

        default: throw new errors.CommandNotRecognized(command)
      }
    }))
    const operationParamsPromiseResults = await Promise.all(operationParamsPromises)

    const operationParams = {
      operations: operations.map((operation, i) => ({
        command: operation.command,
        ...operationParamsPromiseResults[i]
      }))
    }

    try {
      await postTransaction(database, action, operationParams)
    } catch (e) {
      if (e.response && e.response.data.error === 'OperationsExceedLimit') {
        throw new errors.OperationsExceedLimit(e.response.data.limit)
      }
      throw e
    }

  } catch (e) {

    switch (e.name) {
      case 'ParamsMustBeObject':
      case 'DatabaseNotOpen':
      case 'DatabaseNameMissing':
      case 'DatabaseNameMustBeString':
      case 'DatabaseNameCannotBeBlank':
      case 'DatabaseNameTooLong':
      case 'OperationsMissing':
      case 'OperationsMustBeArray':
      case 'OperationsConflict':
      case 'OperationsExceedLimit':
      case 'CommandNotRecognized':
      case 'ItemIdMissing':
      case 'ItemIdMustBeString':
      case 'ItemIdCannotBeBlank':
      case 'ItemIdTooLong':
      case 'ItemMissing':
      case 'ItemTooLarge':
      case 'ItemAlreadyExists':
      case 'ItemDoesNotExist':
      case 'ItemUpdateConflict':
      case 'UserNotSignedIn':
      case 'UserNotFound':
      case 'TooManyRequests':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }
  }
}

const postTransaction = async (database, action, params) => {
  try {
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
  } catch (e) {
    _parseGenericErrors(e)
    throw e
  }
}

export default {
  openDatabase,

  insertItem,
  updateItem,
  deleteItem,
  putTransaction,
}
