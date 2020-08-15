import uuidv4 from 'uuid/v4'
import SortedArray from 'sorted-array'
import base64 from 'base64-arraybuffer'
import crypto from './Crypto'
import ws from './ws'
import errors from './errors'
import statusCodes from './statusCodes'
import { byteSizeOfString, Queue, objectHasOwnProperty } from './utils'
import { arrayBufferToString, stringToArrayBuffer } from './Crypto/utils'
import api from './api'

const success = 'Success'

const MAX_DB_NAME_CHAR_LENGTH = 50
const MAX_ITEM_ID_CHAR_LENGTH = 100

const MAX_ITEM_KB = 10
const TEN_KB = MAX_ITEM_KB * 1024
const MAX_ITEM_BYTES = TEN_KB

const UUID_CHAR_LENGTH = 36

const FILE_CHUNK_SIZE = 1024 * 512 // 512kb
const FILE_CHUNKS_PER_BATCH = 10

const VERIFIED_USERS_DATABASE_NAME = '__userbase_verified_users'

const _parseGenericErrors = (e) => {
  if (e.response) {
    if (e.response.data === 'UserNotFound') {
      throw new errors.UserNotFound
    } else if (e.response.status === statusCodes['Internal Server Error']) {
      throw new errors.InternalServerError
    } else if (e.response.status === statusCodes['Gateway Timeout']) {
      throw new errors.Timeout
    }
  } else if (e.message && e.message.indexOf('timeout') !== -1) {
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
    this.fileIds = {}

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

  async applyBundle(bundle, bundleSeqNo) {
    // client must only apply bundle when opening state
    if (this.lastSeqNo !== 0) {
      console.warn(`Client attempted to apply bundle when last seq no is ${this.lastSeqNo}`)
      return
    }

    for (let i = 0; i < bundle.itemsIndex.length; i++) {
      const itemIndex = bundle.itemsIndex[i]
      const itemId = bundle.itemsIndex[i].itemId
      const item = bundle.items[itemId]

      if (item.file && item.file.fileEncryptionKeyString) {
        item.file.fileEncryptionKey = await crypto.aesGcm.getKeyFromKeyString(item.file.fileEncryptionKeyString)
        this.fileIds[item.file.fileId] = itemId
      }

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

      case 'UploadFile': {
        const fileEncryptionKeyRaw = await crypto.aesGcm.decrypt(key, base64.decode(transaction.fileEncryptionKey))
        const fileEncryptionKey = await crypto.aesGcm.getKeyFromRawKey(fileEncryptionKeyRaw)
        const fileEncryptionKeyString = await crypto.aesGcm.getKeyStringFromKey(fileEncryptionKey)
        const fileMetadata = await crypto.aesGcm.decryptJson(fileEncryptionKey, transaction.fileMetadata)

        const itemId = fileMetadata.itemId
        const fileVersion = fileMetadata.__v
        const { fileName, fileSize, fileType } = fileMetadata
        const fileId = transaction.fileId

        try {
          this.validateUploadFile(itemId, fileVersion)
        } catch (transactionCode) {
          return transactionCode
        }

        return this.applyUploadFile(itemId, fileVersion, fileEncryptionKey, fileEncryptionKeyString, fileName, fileId, fileSize, fileType)
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

  validateUploadFile(itemId, __v) {
    if (!this.items[itemId]) {
      throw new errors.ItemDoesNotExist
    }

    const currentVersion = this.getFileVersionNumber(itemId)

    if (__v <= currentVersion) {
      throw new errors.FileUploadConflict
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

  applyUploadFile(itemId, __v, fileEncryptionKey, fileEncryptionKeyString, fileName, fileId, fileSize, fileType) {
    this.items[itemId].file = {
      fileName,
      fileId,
      fileSize,
      fileType,
      fileEncryptionKey,
      fileEncryptionKeyString,
      __v,
    }
    this.fileIds[fileId] = itemId
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
      const item = { itemId, item: record }
      if (this.items[itemId].file) {
        const { fileId, fileName, fileSize } = this.items[itemId].file
        item.fileId = fileId
        item.fileName = fileName
        item.fileSize = fileSize
      }

      result.push(item)
    }
    return result
  }

  getItemVersionNumber(itemId) {
    return this.items[itemId].__v
  }

  getFileVersionNumber(itemId) {
    return this.items[itemId].file && this.items[itemId].file.__v
  }
}

const _idempotentOpenDatabase = (database, changeHandler, receivedMessage) => {
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
    return true
  }

  return false
}

const _openDatabaseByDatabaseId = async (databaseId, changeHandler, receivedMessage) => {
  const database = ws.state.databasesByDbId[databaseId]

  if (!database) {
    ws.state.databasesByDbId[databaseId] = new Database(changeHandler, receivedMessage)
  } else {
    if (_idempotentOpenDatabase(database, changeHandler, receivedMessage)) return
  }

  const action = 'OpenDatabaseByDatabaseId'
  const params = { databaseId }
  await ws.request(action, params)
}

const _openDatabaseByNameHash = async (dbNameHash, newDatabaseParams, changeHandler, receivedMessage) => {
  const database = ws.state.databases[dbNameHash]

  if (!database) {
    ws.state.databases[dbNameHash] = new Database(changeHandler, receivedMessage)
  } else {
    if (_idempotentOpenDatabase(database, changeHandler, receivedMessage)) return
  }

  const action = 'OpenDatabase'
  const params = { dbNameHash, newDatabaseParams }
  await ws.request(action, params)
}

const _openDatabase = async (changeHandler, params) => {
  try {
    let receivedMessage
    let timeout
    const firstMessageFromWebSocket = new Promise((resolve, reject) => {
      receivedMessage = resolve
      timeout = setTimeout(() => reject(new Error('timeout')), 20000)
    })

    try {
      const { dbNameHash, newDatabaseParams, databaseId } = params

      if (dbNameHash) await _openDatabaseByNameHash(dbNameHash, newDatabaseParams, changeHandler, receivedMessage)
      else await _openDatabaseByDatabaseId(databaseId, changeHandler, receivedMessage)

      await firstMessageFromWebSocket
    } catch (e) {
      clearTimeout(timeout)

      if (e.response && e.response.data) {
        const data = e.response.data

        if (data === 'Database already creating') {
          throw new errors.DatabaseAlreadyOpening
        } else if (data === 'Database key not found') {
          throw new errors.DatabaseNotFound
        }

        switch (data.name) {
          case 'SubscriptionPlanNotSet':
            throw new errors.SubscriptionPlanNotSet
          case 'SubscriptionNotFound':
            throw new errors.SubscriptionNotFound
          case 'SubscribedToIncorrectPlan':
            throw new errors.SubscribedToIncorrectPlan
          case 'SubscriptionInactive':
            throw new errors.SubscriptionInactive(data.subscriptionStatus)
          case 'TrialExpired':
            throw new errors.TrialExpired
        }

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

const _validateDbName = (dbName) => {
  if (typeof dbName !== 'string') throw new errors.DatabaseNameMustBeString
  if (dbName.length === 0) throw new errors.DatabaseNameCannotBeBlank
  if (dbName.length > MAX_DB_NAME_CHAR_LENGTH) throw new errors.DatabaseNameTooLong(MAX_DB_NAME_CHAR_LENGTH)
}

const _validateDbId = (dbId) => {
  if (typeof dbId !== 'string') throw new errors.DatabaseIdMustBeString
  if (dbId.length === 0) throw new errors.DatabaseIdCannotBeBlank
  if (dbId.length !== UUID_CHAR_LENGTH) throw new errors.DatabaseIdInvalidLength(UUID_CHAR_LENGTH)
}

const _validateDbInput = (params) => {
  if (typeof params !== 'object') throw new errors.ParamsMustBeObject

  if (objectHasOwnProperty(params, 'databaseName')) {

    _validateDbName(params.databaseName)
    if (objectHasOwnProperty(params, 'databaseId')) throw new errors.DatabaseIdNotAllowed

    // try to block usage of verified users database. If user works around this and modifies this database,
    // they could mess up the database for themself.
    if (!params.allowVerifiedUsersDatabase && params.databaseName === VERIFIED_USERS_DATABASE_NAME) {
      throw new errors.DatabaseNameRestricted(VERIFIED_USERS_DATABASE_NAME)
    }

  } else if (objectHasOwnProperty(params, 'databaseId')) {
    _validateDbId(params.databaseId)
  } else {
    throw new errors.DatabaseNameMissing
  }

  if (ws.reconnecting) throw new errors.Reconnecting
  if (!ws.keys.init) throw new errors.UserNotSignedIn
}

const openDatabase = async (params) => {
  try {
    _validateDbInput(params)
    if (!objectHasOwnProperty(params, 'changeHandler')) throw new errors.ChangeHandlerMissing

    const { databaseName, databaseId, changeHandler } = params

    if (typeof changeHandler !== 'function') throw new errors.ChangeHandlerMustBeFunction

    if (databaseName) {
      const dbNameHash = ws.state.dbNameToHash[databaseName] || await crypto.hmac.signString(ws.keys.hmacKey, databaseName)
      ws.state.dbNameToHash[databaseName] = dbNameHash // eslint-disable-line require-atomic-updates

      const newDatabaseParams = await _createDatabase(databaseName)

      const openByDbNameHashParams = { dbNameHash, newDatabaseParams }
      await _openDatabase(changeHandler, openByDbNameHashParams)
    } else {
      const openByDbIdParams = { databaseId }
      await _openDatabase(changeHandler, openByDbIdParams)
    }
  } catch (e) {

    switch (e.name) {
      case 'ParamsMustBeObject':
      case 'DatabaseAlreadyOpening':
      case 'DatabaseNameMustBeString':
      case 'DatabaseNameMissing':
      case 'DatabaseNameCannotBeBlank':
      case 'DatabaseNameTooLong':
      case 'DatabaseNameRestricted':
      case 'DatabaseIdMustBeString':
      case 'DatabaseIdCannotBeBlank':
      case 'DatabaseIdInvalidLength':
      case 'DatabaseIdNotAllowed':
      case 'DatabaseNotFound':
      case 'ChangeHandlerMissing':
      case 'ChangeHandlerMustBeFunction':
      case 'UserNotSignedIn':
      case 'UserNotFound':
      case 'SubscriptionPlanNotSet':
      case 'SubscriptionNotFound':
      case 'SubscribedToIncorrectPlan':
      case 'SubscriptionInactive':
      case 'TrialExpired':
      case 'TooManyRequests':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }
  }
}

const getOpenDb = (dbName, databaseId) => {
  const dbNameHash = ws.state.dbNameToHash[dbName]
  const database = dbName
    ? ws.state.databases[dbNameHash]
    : ws.state.databasesByDbId[databaseId]

  if (!database || !database.init) throw new errors.DatabaseNotOpen
  return database
}

const insertItem = async (params) => {
  try {
    _validateDbInput(params)

    const database = getOpenDb(params.databaseName, params.databaseId)

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
      case 'DatabaseNameRestricted':
      case 'DatabaseIdMustBeString':
      case 'DatabaseIdCannotBeBlank':
      case 'DatabaseIdInvalidLength':
      case 'DatabaseIdNotAllowed':
      case 'DatabaseIsReadOnly':
      case 'ItemIdMustBeString':
      case 'ItemIdCannotBeBlank':
      case 'ItemIdTooLong':
      case 'ItemMissing':
      case 'ItemInvalid':
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
  if (!itemString) throw new errors.ItemInvalid
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

    const database = getOpenDb(params.databaseName, params.databaseId)

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
      case 'DatabaseNameRestricted':
      case 'DatabaseIdMustBeString':
      case 'DatabaseIdCannotBeBlank':
      case 'DatabaseIdInvalidLength':
      case 'DatabaseIdNotAllowed':
      case 'DatabaseIsReadOnly':
      case 'ItemIdMissing':
      case 'ItemIdMustBeString':
      case 'ItemIdCannotBeBlank':
      case 'ItemIdTooLong':
      case 'ItemMissing':
      case 'ItemInvalid':
      case 'ItemTooLarge':
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

const _buildUpdateParams = async (database, params) => {
  if (!objectHasOwnProperty(params, 'item')) throw new errors.ItemMissing
  if (!objectHasOwnProperty(params, 'itemId')) throw new errors.ItemIdMissing

  const { item, itemId } = params

  if (typeof itemId !== 'string') throw new errors.ItemIdMustBeString
  if (itemId.length === 0) throw new errors.ItemIdCannotBeBlank
  if (itemId.length > MAX_ITEM_ID_CHAR_LENGTH) throw new errors.ItemIdTooLong(MAX_ITEM_ID_CHAR_LENGTH)

  if (!database.itemExists(itemId)) throw new errors.ItemDoesNotExist

  const itemString = JSON.stringify(item)
  if (!itemString) throw new errors.ItemInvalid
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

    const database = getOpenDb(params.databaseName, params.databaseId)

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
      case 'DatabaseNameRestricted':
      case 'DatabaseIdMustBeString':
      case 'DatabaseIdCannotBeBlank':
      case 'DatabaseIdInvalidLength':
      case 'DatabaseIdNotAllowed':
      case 'DatabaseIsReadOnly':
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

    const { databaseName, databaseId, operations } = params

    if (!Array.isArray(operations)) throw new errors.OperationsMustBeArray

    const database = getOpenDb(databaseName, databaseId)

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
      case 'DatabaseNameRestricted':
      case 'DatabaseIdMustBeString':
      case 'DatabaseIdCannotBeBlank':
      case 'DatabaseIdInvalidLength':
      case 'DatabaseIdNotAllowed':
      case 'DatabaseIsReadOnly':
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
      case 'ItemInvalid':
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
      dbNameHash: database.dbNameHash
    }

    const response = await ws.request(action, paramsWithDbData)
    const seqNo = response.data.sequenceNo

    await pendingTx.getResult(seqNo)

    database.unregisterUnverifiedTransaction(pendingTx)

    return seqNo
  } catch (e) {
    _parseGenericErrors(e)

    if (e.response && e.response.data.name === 'DatabaseIsReadOnly') {
      throw new errors.DatabaseIsReadOnly
    }

    throw e
  }
}

const _completeFileUpload = async (database, fileId, itemKey, encryptedFileMetadata, encryptedFileEncryptionKey) => {
  const params = {
    dbId: database.dbId,
    fileId,
    itemKey,
    fileMetadata: encryptedFileMetadata,
    fileEncryptionKey: base64.encode(encryptedFileEncryptionKey)
  }

  const action = 'CompleteFileUpload'
  await postTransaction(database, action, params)
}

const _readBlob = async (blob) => {
  const reader = new FileReader()

  return new Promise((resolve, reject) => {
    reader.onload = (e) => {
      if (!e.target.error) {
        resolve(e.target.result)
      } else {
        reject(e.target.error)
      }
    }

    reader.readAsArrayBuffer(blob)
  })
}

const _uploadChunk = async (batch, chunk, dbId, fileId, fileEncryptionKey, chunkNumber) => {
  const plaintextChunk = await _readBlob(chunk)

  // encrypt each chunk with new encryption key to maintain lower usage of file encryption key
  const [chunkEncryptionKey, encryptedChunkEncryptionKey] = await _generateAndEncryptKeyEncryptionKey(fileEncryptionKey)
  const encryptedChunk = await crypto.aesGcm.encrypt(chunkEncryptionKey, plaintextChunk)

  const uploadChunkParams = {
    dbId,
    chunkNumber,
    fileId,

    // arrayBufferToString takes up less space than base64 encoding. Uint8Array format required so that encrypted
    // chunks that are odd number sized get converted to string properly
    chunk: arrayBufferToString(new Uint8Array(encryptedChunk)),
    chunkEncryptionKey: arrayBufferToString(new Uint8Array(encryptedChunkEncryptionKey)),
  }

  // queue UploadFileChunk request into batch of requests
  const action = 'UploadFileChunk'
  batch.push(ws.request(action, uploadChunkParams))

  // wait for batch of UploadFileChunk requests to finish before moving on to upload the next batch of chunks
  if (batch.length === FILE_CHUNKS_PER_BATCH) {
    await Promise.all(batch)
    batch.length = 0
  }
}

const _buildFileMetadata = async (params, database) => {
  if (!objectHasOwnProperty(params, 'itemId')) throw new errors.ItemIdMissing
  if (!objectHasOwnProperty(params, 'file')) throw new errors.FileMissing

  const { itemId, file } = params

  if (typeof itemId !== 'string') throw new errors.ItemIdMustBeString
  if (itemId.length === 0) throw new errors.ItemIdCannotBeBlank
  if (itemId.length > MAX_ITEM_ID_CHAR_LENGTH) throw new errors.ItemIdTooLong(MAX_ITEM_ID_CHAR_LENGTH)

  if (!database.itemExists(itemId)) throw new errors.ItemDoesNotExist

  if (!(file instanceof File)) throw new errors.FileMustBeFile
  if (file.size === 0) throw new errors.FileCannotBeEmpty

  const itemKey = await crypto.hmac.signString(ws.keys.hmacKey, itemId)
  const currentVersion = database.getFileVersionNumber(itemId)
  const fileMetadata = {
    itemId,
    __v: currentVersion === undefined ? 0 : currentVersion + 1,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
  }
  return { itemKey, fileMetadata }
}

const _generateAndEncryptKeyEncryptionKey = async (key) => {
  const keyEncryptionKey = await crypto.aesGcm.generateKey()
  const keyEncryptionKeyRaw = await crypto.aesGcm.getRawKeyFromKey(keyEncryptionKey)
  const encryptedKeyEncryptionKey = await crypto.aesGcm.encrypt(key, keyEncryptionKeyRaw)
  return [keyEncryptionKey, encryptedKeyEncryptionKey]
}

const uploadFile = async (params) => {
  try {
    _validateDbInput(params)

    const database = getOpenDb(params.databaseName, params.databaseId)
    const { dbId } = database

    try {
      const { itemKey, fileMetadata } = await _buildFileMetadata(params, database)

      // generate a new key particular to this file to maintain lower usage of dbKey
      const [fileEncryptionKey, encryptedFileEncryptionKey] = await _generateAndEncryptKeyEncryptionKey(database.dbKey)
      const encryptedFileMetadata = await crypto.aesGcm.encryptJson(fileEncryptionKey, fileMetadata)

      // server generates unique file identifier
      const { data: { fileId } } = await ws.request('GenerateFileId', { dbId: database.dbId })

      // upload file in chunks of size FILE_CHUNK_SIZE
      const file = params.file
      let position = 0
      let chunkNumber = 0
      let batch = [] // will use this to send chunks to server in batches of FILE_CHUNKS_PER_BATCH

      while (position < file.size) {
        // read a chunk at a time to keep memory overhead low
        const chunk = file.slice(position, position + FILE_CHUNK_SIZE)
        await _uploadChunk(batch, chunk, dbId, fileId, fileEncryptionKey, chunkNumber)

        chunkNumber += 1
        position += FILE_CHUNK_SIZE
      }

      await Promise.all(batch)
      await _completeFileUpload(database, fileId, itemKey, encryptedFileMetadata, encryptedFileEncryptionKey)
    } catch (e) {
      _parseGenericErrors(e)

      if (e.response && e.response.data === 'DatabaseIsReadOnly') {
        throw new errors.DatabaseIsReadOnly
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
      case 'DatabaseNameRestricted':
      case 'DatabaseIdMustBeString':
      case 'DatabaseIdCannotBeBlank':
      case 'DatabaseIdInvalidLength':
      case 'DatabaseIdNotAllowed':
      case 'DatabaseIsReadOnly':
      case 'ItemIdMissing':
      case 'ItemIdMustBeString':
      case 'ItemIdCannotBeBlank':
      case 'ItemIdTooLong':
      case 'ItemDoesNotExist':
      case 'FileMustBeFile':
      case 'FileCannotBeEmpty':
      case 'FileMissing':
      case 'FileUploadConflict':
      case 'UserNotSignedIn':
      case 'TooManyRequests':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }

  }
}

const _getChunk = async (dbId, fileId, chunkNumber, fileEncryptionKey) => {
  try {
    const action = 'GetChunk'
    const params = {
      dbId,
      fileId,
      chunkNumber,
    }
    const response = await ws.request(action, params)
    const data = response.data

    const chunkRawBuffer = new Uint8Array(new Uint16Array(stringToArrayBuffer(data.chunk))).buffer
    const chunkEncryptionKeyRawBuffer = new Uint8Array(new Uint16Array(stringToArrayBuffer(data.chunkEncryptionKey))).buffer

    const chunkEncryptionKeyRaw = await crypto.aesGcm.decrypt(fileEncryptionKey, chunkEncryptionKeyRawBuffer)
    const chunkEncryptionKey = await crypto.aesGcm.getKeyFromRawKey(chunkEncryptionKeyRaw)

    const chunk = await crypto.aesGcm.decrypt(chunkEncryptionKey, chunkRawBuffer)
    return chunk
  } catch (e) {
    _parseGenericErrors(e)
    throw e
  }
}

const _getByteRange = async (dbId, fileId, fileEncryptionKey, range) => {
  const { start, end } = range

  const chunks = []
  const startChunkNumber = Math.floor(start / FILE_CHUNK_SIZE)
  const endChunkNumber = Math.floor(end / FILE_CHUNK_SIZE) - (end % FILE_CHUNK_SIZE === 0 ? 1 : 0)

  let chunkNumber = startChunkNumber
  while (chunkNumber <= endChunkNumber) {
    let chunk = await _getChunk(dbId, fileId, chunkNumber, fileEncryptionKey)

    if (chunkNumber === startChunkNumber && chunkNumber === endChunkNumber && end % FILE_CHUNK_SIZE) {
      chunk = chunk.slice(start % FILE_CHUNK_SIZE, end % FILE_CHUNK_SIZE)
    } else if (chunkNumber === startChunkNumber) {
      chunk = chunk.slice(start % FILE_CHUNK_SIZE)
    } else if (chunkNumber === endChunkNumber && end % FILE_CHUNK_SIZE) {
      chunk = chunk.slice(0, end % FILE_CHUNK_SIZE)
    }

    chunks.push(chunk)
    chunkNumber += 1
  }

  return chunks
}

const _getFile = async (dbId, fileId, fileEncryptionKey, fileSize) => {
  const chunks = []
  let chunkNumber = 0

  const finalChunkNumber = fileSize < FILE_CHUNK_SIZE
    ? 0
    : Math.floor(fileSize / FILE_CHUNK_SIZE) - (fileSize % FILE_CHUNK_SIZE === 0 ? 1 : 0)

  while (chunkNumber <= finalChunkNumber) {
    const chunk = await _getChunk(dbId, fileId, chunkNumber, fileEncryptionKey)
    chunks.push(chunk)
    chunkNumber += 1
  }

  return chunks
}

const _validateGetFileParams = (params) => {
  _validateDbInput(params)

  if (!objectHasOwnProperty(params, 'fileId')) throw new errors.FileIdMissing

  const { fileId, range } = params

  if (typeof fileId !== 'string') throw new errors.FileIdMustBeString
  if (fileId.length === 0) throw new errors.FileIdCannotBeBlank
  if (fileId.length > MAX_ITEM_ID_CHAR_LENGTH) throw new errors.FileIdTooLong(MAX_ITEM_ID_CHAR_LENGTH)

  if (objectHasOwnProperty(params, 'range')) {
    if (typeof range !== 'object') throw new errors.RangeMustBeObject

    if (!objectHasOwnProperty(range, 'start')) throw new errors.RangeMissingStart
    if (!objectHasOwnProperty(range, 'end')) throw new errors.RangeMissingEnd

    const { start, end } = range

    if (typeof start !== 'number') throw new errors.RangeStartMustBeNumber
    if (typeof end !== 'number') throw new errors.RangeEndMustBeNumber

    if (start < 0) throw new errors.RangeStartMustBeGreaterThanZero
    if (end <= start) throw new errors.RangeEndMustBeGreaterThanRangeStart
  }
}

const getFile = async (params) => {
  try {
    _validateGetFileParams(params)

    const database = getOpenDb(params.databaseName, params.databaseId)
    const { dbId } = database
    const { fileId, range } = params

    const itemId = database.fileIds[fileId]
    const item = database.items[itemId]

    if (!item || !item.file) throw new errors.FileNotFound

    const { file: { fileName, fileSize, fileType, fileEncryptionKey } } = item

    if (range && range.end > fileSize) throw new errors.RangeEndMustBeLessThanFileSize

    const chunks = range
      ? await _getByteRange(dbId, fileId, fileEncryptionKey, range)
      : await _getFile(dbId, fileId, fileEncryptionKey, fileSize)

    return {
      file: new File(chunks, fileName, { type: fileType })
    }
  } catch (e) {

    switch (e.name) {
      case 'ParamsMustBeObject':
      case 'DatabaseNotOpen':
      case 'DatabaseNameMissing':
      case 'DatabaseNameMustBeString':
      case 'DatabaseNameCannotBeBlank':
      case 'DatabaseNameTooLong':
      case 'DatabaseNameRestricted':
      case 'DatabaseIdMustBeString':
      case 'DatabaseIdCannotBeBlank':
      case 'DatabaseIdInvalidLength':
      case 'DatabaseIdNotAllowed':
      case 'DatabaseIsReadOnly':
      case 'FileIdMissing':
      case 'FileIdMustBeString':
      case 'FileIdCannotBeBlank':
      case 'FileIdTooLong':
      case 'FileNotFound':
      case 'RangeMustBeObject':
      case 'RangeMissingStart':
      case 'RangeMissingEnd':
      case 'RangeStartMustBeNumber':
      case 'RangeEndMustBeNumber':
      case 'RangeStartMustBeGreaterThanZero':
      case 'RangeEndMustBeGreaterThanRangeStart':
      case 'RangeEndMustBeLessThanFileSize':
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

const _verifyUsersParent = async (dbKey, verifiedUsers, databaseUser) => {
  const { username, senderUsername, verificationValues } = databaseUser
  const { sentSignature, receivedSignature, senderEcdsaPublicKey } = verificationValues

  const verifiedFingerprint = verifiedUsers[username] && verifiedUsers[username].record.fingerprint

  const parentRawEcdsaPublicKey = base64.decode(senderEcdsaPublicKey)
  const parentFingerprint = (verifiedUsers[senderUsername] && verifiedUsers[senderUsername].record.fingerprint)
    || await _getFingerprint(parentRawEcdsaPublicKey)
  const parentEcdsaPublicKey = await crypto.ecdsa.getPublicKeyFromRawPublicKey(parentRawEcdsaPublicKey)

  // verify parent's claim that sent the dbKey to user
  const expectedSentSignature = await _signFingerprintWithDbKey(dbKey, verifiedFingerprint)
  const verifiedParentSent = await crypto.ecdsa.verifyString(parentEcdsaPublicKey, sentSignature, expectedSentSignature)

  // verify user's claim that received the dbKey from parent
  const recipientEcdsaPublicKey = await crypto.ecdsa.getPublicKeyFromRawPublicKey(base64.decode(verificationValues.recipientEcdsaPublicKey))
  const expectedReceivedSignature = await _signFingerprintWithDbKey(dbKey, parentFingerprint)
  const verifiedReceivedFromParent = await crypto.ecdsa.verifyString(recipientEcdsaPublicKey, receivedSignature, expectedReceivedSignature)

  return verifiedParentSent && verifiedReceivedFromParent
}

const _verifyReceivedDatabaseFromUser = async (dbKey, verifiedFingerprint, myFingerprint, myEcdsaPublicKey, verificationValues) => {
  const { mySentSignature, myReceivedSignature } = verificationValues

  // verify my claim that I received dbKey from this user
  const expectedReceivedSignature = await _signFingerprintWithDbKey(dbKey, verifiedFingerprint)
  const verifiedReceived = await crypto.ecdsa.verifyString(myEcdsaPublicKey, myReceivedSignature, expectedReceivedSignature)

  if (!verifiedReceived) return verifiedReceived

  // verify user's claim that sent dbKey to me
  const expectedSentSignature = await _signFingerprintWithDbKey(dbKey, myFingerprint)
  const senderEcdsaPublicKey = await crypto.ecdsa.getPublicKeyFromRawPublicKey(base64.decode(verificationValues.mySenderEcdsaPublicKey))
  const verifiedSent = await crypto.ecdsa.verifyString(senderEcdsaPublicKey, mySentSignature, expectedSentSignature)

  return verifiedSent && verifiedReceived
}

const _verifySentDatabaseToUser = async (dbKey, verifiedFingerprint, myFingerprint, myEcdsaPublicKey, verificationValues) => {
  const { sentSignature, receivedSignature } = verificationValues

  // verify my claim that I sent dbKey to this user
  const expectedSentSignature = await _signFingerprintWithDbKey(dbKey, verifiedFingerprint)
  const verifiedSent = await crypto.ecdsa.verifyString(myEcdsaPublicKey, sentSignature, expectedSentSignature)

  if (!verifiedSent) return verifiedSent

  // verify user's claim that received dbKey from me
  const expectedReceivedSignature = await _signFingerprintWithDbKey(dbKey, myFingerprint)
  const recipientEcdsaPublicKey = await crypto.ecdsa.getPublicKeyFromRawPublicKey(base64.decode(verificationValues.recipientEcdsaPublicKey))
  const verifiedReceived = await crypto.ecdsa.verifyString(recipientEcdsaPublicKey, receivedSignature, expectedReceivedSignature)

  return verifiedSent && verifiedReceived
}

const _buildDatabaseUserResult = async (dbKey, databaseUsers, verifiedUsers, myUsername, mySenderUsername) => {
  const myEcdsaPublicKey = await crypto.ecdsa.getPublicKeyFromPrivateKey(ws.keys.ecdsaPrivateKey)
  const myFingerprint = await _getMyFingerprint()

  // iterate over all database users to verify each user individually
  for (let i = 0; i < databaseUsers.length; i++) {
    const databaseUser = databaseUsers[i]
    const { username, isOwner, senderUsername, verificationValues } = databaseUser

    try {
      const verifiedFingerprint = verifiedUsers[username] && verifiedUsers[username].record.fingerprint

      const sentDatabaseToUser = verificationValues.isChild
      const receivedDatabaseFromUser = mySenderUsername === username

      if (verifiedFingerprint) {
        if (sentDatabaseToUser) {
          databaseUsers[i].verified = await _verifySentDatabaseToUser(dbKey, verifiedFingerprint, myFingerprint, myEcdsaPublicKey, verificationValues)
        } else if (receivedDatabaseFromUser) {
          const verifiedReceivedDatabaseFromUser = await _verifyReceivedDatabaseFromUser(dbKey, verifiedFingerprint, myFingerprint, myEcdsaPublicKey, verificationValues)

          // verify user's relationship to parent if has a parent
          if (verifiedReceivedDatabaseFromUser && senderUsername) {
            const verifiedGrandparent = await _verifyUsersParent(dbKey, verifiedUsers, databaseUser)
            databaseUsers[i].verified = verifiedGrandparent
          } else {
            databaseUsers[i].verified = verifiedReceivedDatabaseFromUser
          }

        } else if (!isOwner) {
          // verify unrelated user's parent sent dbKey to user and user received dbKey from their parent
          const verifiedUsersParent = await _verifyUsersParent(dbKey, verifiedUsers, databaseUser)
          databaseUsers[i].verified = verifiedUsersParent
        } else {
          // must be an owner that is not my child or parent, and owner is automatically verified
          databaseUsers[i].verified = isOwner
        }
      }
    } catch {
      // continue without setting verified boolean
    }

    // "receivedFromUsername" is easier to understand to end developer
    delete databaseUsers[i].senderUsername
    if (!isOwner) {
      if (verificationValues && verificationValues.isChild) databaseUsers[i].receivedFromUsername = myUsername
      else if (senderUsername) databaseUsers[i].receivedFromUsername = senderUsername
    }

    // these values are not useful to user
    delete databaseUsers[i].verificationValues
  }

  return databaseUsers
}

const _databaseHasOwner = (databaseUsers) => {
  for (let i = 0; i < databaseUsers.length; i++) {
    const user = databaseUsers[i]
    if (user.isOwner) return true
  }

  return false
}

const _getDatabaseUsers = async (databaseId, databaseNameHash, dbKey, verifiedUsers, username, senderUsername) => {
  const users = []
  const action = 'GetDatabaseUsers'
  const params = { databaseId, databaseNameHash }
  let databaseUsersResponse = await ws.request(action, params)

  users.push(...await _buildDatabaseUserResult(dbKey, databaseUsersResponse.data.users, verifiedUsers, username, senderUsername))

  while (databaseUsersResponse.data.nextPageTokenLessThanUserId || databaseUsersResponse.data.nextPageTokenMoreThanUserId) {
    params.nextPageTokenLessThanUserId = databaseUsersResponse.data.nextPageTokenLessThanUserId
    params.nextPageTokenMoreThanUserId = databaseUsersResponse.data.nextPageTokenMoreThanUserId
    databaseUsersResponse = await ws.request(action, params)
    users.push(...await _buildDatabaseUserResult(dbKey, databaseUsersResponse.data.users, verifiedUsers, username, senderUsername))
  }

  return users
}

const _buildDatabaseResult = async (db, encryptionKey, ecdhPrivateKey, verifiedUsers, username) => {
  const { databaseId, databaseNameHash, isOwner, readOnly, resharingAllowed, senderUsername } = db

  let dbKey, databaseName
  if (db.encryptedDbKey) {
    // user must already have access to database
    const dbKeyString = await crypto.aesGcm.decryptString(encryptionKey, db.encryptedDbKey)
    dbKey = await crypto.aesGcm.getKeyFromKeyString(dbKeyString)
    databaseName = await crypto.aesGcm.decryptString(dbKey, db.databaseName)

    // don't expose the user's own verified users database to user -- it's used internally
    if (isOwner && databaseName === VERIFIED_USERS_DATABASE_NAME) return null
  } else if (db.wrappedDbKey) {
    // user using userbase-js v2.0.0 shared with user using userbase-js >= v2.0.1. Updated client
    // cannot receive access to databases shared via userbase-js v2.0.0
    return null
  } else {
    // user is seeing the database for the first time
    let senderRawEcdsaPublicKey
    try {
      const { ephemeralPublicKey, signedEphemeralPublicKey, sharedEncryptedDbKey } = db

      // verify sender signed the ephemeral public key
      senderRawEcdsaPublicKey = base64.decode(db.senderEcdsaPublicKey)
      const senderEcdsaPublicKey = await crypto.ecdsa.getPublicKeyFromRawPublicKey(senderRawEcdsaPublicKey)
      const senderSignedEphemeralPublicKey = await crypto.ecdsa.verify(senderEcdsaPublicKey, base64.decode(signedEphemeralPublicKey), base64.decode(ephemeralPublicKey))
      if (!senderSignedEphemeralPublicKey) throw new errors.ServiceUnavailable

      // compute shared key encryption key with other user and decrypt database encryption key
      const senderEphemeralEcdhPublicKey = await crypto.ecdh.getPublicKeyFromRawPublicKey(base64.decode(ephemeralPublicKey))
      const sharedKeyEncryptionKey = await crypto.ecdh.computeSharedKeyEncryptionKey(senderEphemeralEcdhPublicKey, ecdhPrivateKey)
      const dbKeyString = await crypto.aesGcm.decryptString(sharedKeyEncryptionKey, sharedEncryptedDbKey)
      dbKey = await crypto.aesGcm.getKeyFromKeyString(dbKeyString)

      // make sure dbKey the sender sent works
      databaseName = await crypto.aesGcm.decryptString(dbKey, db.databaseName)
    } catch (e) {
      // if for whatever reason the above process fails (e.g. malicious sender or version upgrade breaks the above implementation),
      // simply return a null spot for database
      return null
    }

    // compute receivedSignature to maintain record of who received dbKey from
    const senderFingerprint = await _getFingerprint(senderRawEcdsaPublicKey)
    const receivedSignature = await _signDbKeyAndFingerprint(dbKey, senderFingerprint)

    // tell server to store encrypted db key & delete ephemeral key data
    const dbKeyString = await crypto.aesGcm.getKeyStringFromKey(dbKey)
    const encryptedDbKey = await crypto.aesGcm.encryptString(encryptionKey, dbKeyString)

    const action = 'SaveDatabase'
    const params = { databaseNameHash, encryptedDbKey, receivedSignature }
    ws.request(action, params)
  }

  const result = {
    databaseName,
    databaseId,
    isOwner,
    readOnly,
    resharingAllowed,
  }

  const users = await _getDatabaseUsers(databaseId, databaseNameHash, dbKey, verifiedUsers, username, senderUsername)

  // if database has no owner, owner must have been deleted and database should not be accessible to user
  if (isOwner || _databaseHasOwner(users)) result.users = users
  else return null

  // if user owns the database, developer has no use for the databaseId. Not allowing developers to use
  // databaseId's to interact with databases owned by the user keeps the current concurrency model safe.
  if (isOwner) delete result.databaseId
  else if (senderUsername) result.receivedFromUsername = senderUsername

  return result
}

const getDatabases = async () => {
  try {
    if (!ws.keys.init) throw new errors.UserNotSignedIn

    const { encryptionKey, ecdhPrivateKey } = ws.keys
    const username = ws.session.username

    try {
      const databases = []
      const action = 'GetDatabases'
      let [databasesResponse, verifiedUsers] = await Promise.all([ws.request(action), _openVerifiedUsersDatabase()])
      let databaseResults = await Promise.all(databasesResponse.data.databases.map(db => _buildDatabaseResult(db, encryptionKey, ecdhPrivateKey, verifiedUsers, username)))
      databases.push(...databaseResults)

      while (databasesResponse.data.nextPageToken) {
        const params = { nextPageToken: databasesResponse.data.nextPageToken }
        databasesResponse = await ws.request(action, params)
        databaseResults = await Promise.all(databasesResponse.data.databases.map(db => _buildDatabaseResult(db, encryptionKey, ecdhPrivateKey, verifiedUsers, username)))
        databases.push(...databaseResults)
      }

      return { databases: databases.filter(database => database !== null) }
    } catch (e) {
      _parseGenericErrors(e)
      throw e
    }

  } catch (e) {

    switch (e.name) {
      case 'UserNotSignedIn':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }
  }
}

const _getDatabase = async (databaseName, databaseId) => {
  let database
  try {
    // check if database is already open in memory
    database = getOpenDb(databaseName, databaseId)
  } catch {
    // if not already open in memory, it's ok. Just get the values we need from backend
    const databaseResponse = await (databaseName
      ? ws.request('GetUserDatabaseByDatabaseNameHash', { dbNameHash: await crypto.hmac.signString(ws.keys.hmacKey, databaseName) })
      : ws.request('GetUserDatabaseByDatabaseId', { databaseId })
    )
    database = databaseResponse.data
  }
  return database
}

const _signFingerprintWithDbKey = async (dbKey, fingerprint) => {
  // convert dbKey into hmacKey
  const rawDbKey = await crypto.aesGcm.getRawKeyFromKey(dbKey)
  const dbKeyHash = await crypto.sha256.hash(rawDbKey)
  const hmacKey = await crypto.hmac.importKeyFromRawBits(dbKeyHash)

  // sign fingerprint with hmacKey
  const signedFingerprint = await crypto.hmac.signString(hmacKey, fingerprint)
  return signedFingerprint
}

const _signDbKeyAndFingerprint = async (dbKey, fingerprint) => {
  const signedFingerprint = await _signFingerprintWithDbKey(dbKey, fingerprint)

  // digitally sign the signedFingerprint to enable a user to verify that
  // this user has sent/received dbKey to/from intended recipient/sender
  const signedDbKeyAndFingerprint = await crypto.ecdsa.signString(ws.keys.ecdsaPrivateKey, signedFingerprint)
  return signedDbKeyAndFingerprint
}

const _verifyDatabaseRecipientFingerprint = async (username, recipientFingerprint, verifiedUsers) => {
  // find recipient's fingerprint in verified users database
  let verifiedRecipientFingerprint, foundOldFingerprint
  const verifiedUsersArray = Object.keys(verifiedUsers)
  for (let i = 0; i < verifiedUsersArray.length; i++) {
    const verifiedUsername = verifiedUsersArray[i]
    const verifiedFingerprint = verifiedUsers[verifiedUsername].record.fingerprint
    if (username === verifiedUsername && recipientFingerprint === verifiedFingerprint) {
      verifiedRecipientFingerprint = verifiedFingerprint
      break
    } else if (verifiedFingerprint === recipientFingerprint) {
      foundOldFingerprint = true
    }
  }

  // must have an outdated username stored in verified users database and therefore must reverify recipient
  if (!verifiedRecipientFingerprint && foundOldFingerprint) throw new errors.UserMustBeReverified
  if (!verifiedRecipientFingerprint) throw new errors.UserNotVerified
}

const _validateUsername = (username) => {
  if (typeof username !== 'string') throw new errors.UsernameMustBeString
  if (username.length === 0) throw new errors.UsernameCannotBeBlank
}

const _validateDbSharingInput = (params) => {
  if (!objectHasOwnProperty(params, 'username')) throw new errors.UsernameMissing
  _validateUsername(params.username)

  if (objectHasOwnProperty(params, 'readOnly') && typeof params.readOnly !== 'boolean') {
    throw new errors.ReadOnlyMustBeBoolean
  }

  if (objectHasOwnProperty(params, 'resharingAllowed') && typeof params.resharingAllowed !== 'boolean') {
    throw new errors.ResharingAllowedMustBeBoolean
  }

  if (objectHasOwnProperty(params, 'requireVerified') && typeof params.requireVerified !== 'boolean') {
    throw new errors.RequireVerifiedMustBeBoolean
  }
}

const shareDatabase = async (params) => {
  try {
    _validateDbInput(params)
    _validateDbSharingInput(params)

    const { databaseName, databaseId } = params
    const username = params.username.toLowerCase()
    const readOnly = objectHasOwnProperty(params, 'readOnly') ? params.readOnly : true
    const resharingAllowed = objectHasOwnProperty(params, 'resharingAllowed') ? params.resharingAllowed : false
    const requireVerified = objectHasOwnProperty(params, 'requireVerified') ? params.requireVerified : true

    try {
      // get recipient's public key to use to generate a shared key, and retrieve verified users list if requireVerified set to true
      const [recipientPublicKey, verifiedUsers] = await Promise.all([
        api.auth.getPublicKey(username),
        requireVerified && _openVerifiedUsersDatabase()
      ])

      // recipient must have required keys so client can share database key
      if (!recipientPublicKey.ecdhPublicKey || !recipientPublicKey.ecdsaPublicKey) throw new errors.UserUnableToReceiveDatabase

      // compute recipient's fingerprint of ECDSA public key stored on server
      const recipientRawEcdsaPublicKey = base64.decode(recipientPublicKey.ecdsaPublicKey)
      const recipientFingerprint = await _getFingerprint(recipientRawEcdsaPublicKey)

      // verify that the recipient is in the user's list of verified users
      if (requireVerified) await _verifyDatabaseRecipientFingerprint(username, recipientFingerprint, verifiedUsers)

      // verify recipient signed the ECDH public key that sender will be using to share database
      const recipientEcdsaPublicKey = await crypto.ecdsa.getPublicKeyFromRawPublicKey(recipientRawEcdsaPublicKey)
      const { signedEcdhPublicKey, ecdhPublicKey } = recipientPublicKey
      const isVerified = await crypto.ecdsa.verify(recipientEcdsaPublicKey, base64.decode(signedEcdhPublicKey), base64.decode(ecdhPublicKey))

      // this should never happen. If this happens, the server is serving conflicting keys and client should not sign anything
      if (!isVerified) throw new errors.ServiceUnavailable

      const recipientEcdhPublicKey = await crypto.ecdh.getPublicKeyFromRawPublicKey(base64.decode(recipientPublicKey.ecdhPublicKey))

      // generate ephemeral ECDH key pair to ensure forward secrecy for future shares between users if shared key is leaked
      const ephemeralEcdhKeyPair = await crypto.ecdh.generateKeyPair()
      const rawEphemeralEcdhPublicKey = await crypto.ecdh.getRawPublicKeyFromPublicKey(ephemeralEcdhKeyPair.publicKey)
      const signedEphemeralEcdhPublicKey = await crypto.ecdsa.sign(ws.keys.ecdsaPrivateKey, rawEphemeralEcdhPublicKey)

      // compute shared key encryption key with recipient so can use it to encrypt database encryption key
      const sharedKeyEncryptionKey = await crypto.ecdh.computeSharedKeyEncryptionKey(recipientEcdhPublicKey, ephemeralEcdhKeyPair.privateKey)

      // get the database encryption key
      const database = await _getDatabase(databaseName, databaseId)
      let dbKeyString
      if (!database.dbKey) {
        dbKeyString = await crypto.aesGcm.decryptString(ws.keys.encryptionKey, database.encryptedDbKey)
        database.dbKey = await crypto.aesGcm.getKeyFromKeyString(dbKeyString)
      } else {
        dbKeyString = await crypto.aesGcm.getKeyStringFromKey(database.dbKey)
      }

      // encrypt the database encryption key using shared ephemeral ECDH key
      const sharedEncryptedDbKeyString = await crypto.aesGcm.encryptString(sharedKeyEncryptionKey, dbKeyString)

      const action = 'ShareDatabase'
      const requestParams = {
        databaseId: database.dbId,
        databaseNameHash: database.dbNameHash,
        username,
        readOnly,
        resharingAllowed,
        sharedEncryptedDbKey: sharedEncryptedDbKeyString,
        ephemeralPublicKey: base64.encode(rawEphemeralEcdhPublicKey),
        signedEphemeralPublicKey: base64.encode(signedEphemeralEcdhPublicKey),
        sentSignature: await _signDbKeyAndFingerprint(database.dbKey, recipientFingerprint),
        recipientEcdsaPublicKey: recipientPublicKey.ecdsaPublicKey
      }
      await ws.request(action, requestParams)
    } catch (e) {
      _parseGenericErrors(e)

      if (e.response && e.response.data) {
        switch (e.response.data.message) {
          case 'SharingWithSelfNotAllowed':
            throw new errors.SharingWithSelfNotAllowed
          case 'DatabaseNotFound':
            throw new errors.DatabaseNotFound
          case 'ResharingNotAllowed':
            throw new errors.ResharingNotAllowed
          case 'ResharingWithWriteAccessNotAllowed':
            throw new errors.ResharingWithWriteAccessNotAllowed
          case 'UserNotFound':
            throw new errors.UserNotFound
          case 'DatabaseAlreadyShared':
            // safe to return
            return
        }
      }

      throw e
    }

  } catch (e) {

    switch (e.name) {
      case 'ParamsMustBeObject':
      case 'DatabaseNameMissing':
      case 'DatabaseNameMustBeString':
      case 'DatabaseNameCannotBeBlank':
      case 'DatabaseNameTooLong':
      case 'DatabaseNameRestricted':
      case 'DatabaseIdMustBeString':
      case 'DatabaseIdCannotBeBlank':
      case 'DatabaseIdInvalidLength':
      case 'DatabaseIdNotAllowed':
      case 'DatabaseNotFound':
      case 'UsernameMissing':
      case 'UsernameCannotBeBlank':
      case 'UsernameMustBeString':
      case 'ReadOnlyMustBeBoolean':
      case 'ResharingAllowedMustBeBoolean':
      case 'ResharingNotAllowed':
      case 'ResharingWithWriteAccessNotAllowed':
      case 'RequireVerifiedMustBeBoolean':
      case 'SharingWithSelfNotAllowed':
      case 'UserNotSignedIn':
      case 'UserUnableToReceiveDatabase':
      case 'UserNotFound':
      case 'UserNotVerified':
      case 'UserMustBeReverified':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }
  }
}

const modifyDatabasePermissions = async (params) => {
  try {
    _validateDbInput(params)
    _validateDbSharingInput(params)

    if (objectHasOwnProperty(params, 'revoke')) {
      if (typeof params.revoke !== 'boolean') throw new errors.RevokeMustBeBoolean

      // readOnly and resharingAllowed booleans have no use if revoking database from user
      if (params.revoke) {
        if (objectHasOwnProperty(params, 'readOnly')) throw new errors.ReadOnlyParamNotAllowed
        if (objectHasOwnProperty(params, 'resharingAllowed')) throw new errors.ResharingAllowedParamNotAllowed
      }
    } else if (!objectHasOwnProperty(params, 'readOnly') && !objectHasOwnProperty(params, 'resharingAllowed')) {
      throw new errors.ParamsMissing
    }

    const { databaseName, databaseId, readOnly, resharingAllowed, revoke } = params
    const username = params.username.toLowerCase()

    try {
      const database = await _getDatabase(databaseName, databaseId)

      const action = 'ModifyDatabasePermissions'
      const requestParams = {
        databaseId: database.dbId,
        databaseNameHash: database.dbNameHash,
        username,
        readOnly,
        resharingAllowed,
        revoke,
      }
      await ws.request(action, requestParams)
    } catch (e) {
      _parseGenericErrors(e)

      if (e.response && e.response.data) {
        switch (e.response.data.message) {
          case 'SharingWithSelfNotAllowed':
            throw new errors.ModifyingOwnPermissionsNotAllowed
          case 'ModifyingOwnerPermissionsNotAllowed':
            throw new errors.ModifyingOwnerPermissionsNotAllowed
          case 'ResharingNotAllowed':
            throw new errors.ModifyingPermissionsNotAllowed
          case 'ResharingWithWriteAccessNotAllowed':
            throw new errors.GrantingWriteAccessNotAllowed
          case 'DatabaseNotFound':
            throw new errors.DatabaseNotFound
          case 'UserNotFound':
            throw new errors.UserNotFound
        }
      }

      throw e
    }

  } catch (e) {

    switch (e.name) {
      case 'ParamsMustBeObject':
      case 'ParamsMissing':
      case 'DatabaseNameMissing':
      case 'DatabaseNameMustBeString':
      case 'DatabaseNameCannotBeBlank':
      case 'DatabaseNameTooLong':
      case 'DatabaseNameRestricted':
      case 'DatabaseIdMustBeString':
      case 'DatabaseIdCannotBeBlank':
      case 'DatabaseIdInvalidLength':
      case 'DatabaseIdNotAllowed':
      case 'DatabaseNotFound':
      case 'UsernameMissing':
      case 'UsernameCannotBeBlank':
      case 'UsernameMustBeString':
      case 'ReadOnlyMustBeBoolean':
      case 'ReadOnlyParamNotAllowed':
      case 'ResharingAllowedMustBeBoolean':
      case 'ResharingAllowedParamNotAllowed':
      case 'RevokeMustBeBoolean':
      case 'ModifyingOwnPermissionsNotAllowed':
      case 'ModifyingOwnerPermissionsNotAllowed':
      case 'ModifyingPermissionsNotAllowed':
      case 'GrantingWriteAccessNotAllowed':
      case 'UserNotSignedIn':
      case 'UserNotFound':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }
  }
}

const _packVerificationMessage = (username, fingerprint) => {
  return btoa(JSON.stringify({ username, fingerprint }))
}

const _unpackVerificationMessage = (verificationMessage) => {
  try {
    const { username, fingerprint } = JSON.parse(atob(verificationMessage))

    _validateUsername(username)
    if (!fingerprint) throw new errors.VerificationMessageInvalid

    return { username, fingerprint }
  } catch {
    throw new errors.VerificationMessageInvalid
  }
}

const _getFingerprint = async (ecdsaRawPublicKey) => {
  const ecdsaPublicKeyHash = await crypto.sha256.hash(ecdsaRawPublicKey)
  const fingerprint = base64.encode(ecdsaPublicKeyHash)
  return fingerprint
}

const _getMyFingerprint = async () => {
  const ecdsaPublicKey = await crypto.ecdsa.getPublicKeyFromPrivateKey(ws.keys.ecdsaPrivateKey)
  const ecdsaRawPublicKey = await crypto.ecdsa.getRawPublicKeyFromPublicKey(ecdsaPublicKey)
  const fingerprint = await _getFingerprint(ecdsaRawPublicKey)
  return fingerprint
}

const getVerificationMessage = async () => {
  try {
    if (ws.reconnecting) throw new errors.Reconnecting
    if (!ws.keys.init) throw new errors.UserNotSignedIn

    const username = ws.session.username
    const fingerprint = await _getMyFingerprint()

    const verificationMessage = _packVerificationMessage(username, fingerprint)
    return { verificationMessage }
  } catch (e) {

    switch (e.name) {
      case 'UserNotSignedIn':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }
  }
}

const _openVerifiedUsersDatabase = async () => {
  const databaseName = VERIFIED_USERS_DATABASE_NAME
  const changeHandler = () => { } // not used
  const allowVerifiedUsersDatabase = true
  await openDatabase({ databaseName, changeHandler, allowVerifiedUsersDatabase })
  const dbNameHash = ws.state.dbNameToHash[databaseName]
  const verifiedUsers = ws.state.databases[dbNameHash].items
  return verifiedUsers
}

const verifyUser = async (params) => {
  try {
    if (typeof params !== 'object') throw new errors.ParamsMustBeObject

    if (ws.reconnecting) throw new errors.Reconnecting
    if (!ws.keys.init) throw new errors.UserNotSignedIn

    if (!objectHasOwnProperty(params, 'verificationMessage')) throw new errors.VerificationMessageMissing
    const { verificationMessage } = params
    if (typeof verificationMessage !== 'string') throw new errors.VerificationMessageMustBeString
    if (verificationMessage.length === 0) throw new errors.VerificationMessageCannotBeBlank

    const { username, fingerprint } = _unpackVerificationMessage(verificationMessage)

    if (username === ws.session.username || fingerprint === await _getMyFingerprint()) throw new errors.VerifyingSelfNotAllowed

    // upsert the verification message into the user's encrypted database that stores verified users
    await _openVerifiedUsersDatabase()

    const databaseName = VERIFIED_USERS_DATABASE_NAME
    const allowVerifiedUsersDatabase = true
    const itemId = username
    const item = { fingerprint }
    try {
      await insertItem({ databaseName, itemId, item, allowVerifiedUsersDatabase })
    } catch (e) {
      if (e.name === 'ItemAlreadyExists') await updateItem({ databaseName, itemId, item, allowVerifiedUsersDatabase })
      else throw e
    }
  } catch (e) {

    switch (e.name) {
      case 'ParamsMustBeObject':
      case 'VerificationMessageMissing':
      case 'VerificationMessageMustBeString':
      case 'VerificationMessageCannotBeBlank':
      case 'VerificationMessageInvalid':
      case 'VerifyingSelfNotAllowed':
      case 'UserNotSignedIn':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }
  }
}

export default {
  openDatabase,
  getDatabases,

  insertItem,
  updateItem,
  deleteItem,
  putTransaction,

  uploadFile,
  getFile,

  shareDatabase,
  modifyDatabasePermissions,

  getVerificationMessage,
  verifyUser,
}
