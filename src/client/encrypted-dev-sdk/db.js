import uuidv4 from 'uuid/v4'
import base64 from 'base64-arraybuffer'
import localData from './localData'
import crypto from './Crypto'
import SortedArray from 'sorted-array'
import LZString from 'lz-string'
import { stringToArrayBuffer, arrayBufferToString } from './Crypto/utils'

const success = 'Success'
const itemAlreadyExists = 'Item already exists'
const itemAlreadyDeleted = 'Item already deleted'
const versionConflict = 'Version conflict'
const wsNotOpen = 'Web Socket not open'
const dbNotOpen = 'Database not open'

const state = {
  databases: {},
  dbNameHashToDbId: {},
  dbNameToDbHash: {}
}
const requests = {}
let ws

class RequestFailed extends Error {
  constructor(response, message, ...params) {
    super(...params)

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RequestFailed)
    }

    this.name = 'RequestFailed'
    this.message = message || 'Error'
    this.response = response
  }
}

class Request {
  constructor(ws, action, params) {
    this.ws = ws
    this.action = action
    this.params = params
  }

  async send() {
    // generate a new requestId
    const requestId = uuidv4()

    // get a promise that is resolved when the WebSocket
    // receives a response for this requestId — the promise
    // would time out of x seconds
    const responseWatcher = this.ws.watch(requestId)

    // send the request on the WebSocket
    this.ws.send(JSON.stringify({
      requestId,
      action: this.action,
      params: this.params
    }))

    // wait for the response to arrive
    try {
      const response = await responseWatcher
      return response
    } catch (e) {
      // process any errors and re-throw them
      throw new RequestFailed(e)
    }
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
  constructor(dbKey, dbId, changeHandler, promiseResolve) {
    this.dbKey = dbKey
    this.dbId = dbId
    this.onChange = changeHandler
    this.promiseResolve = promiseResolve

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
  }

  async applyTransactions(transactions) {
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i]
      const seqNo = transaction.seqNo

      const transactionCode = await this.applyTransaction(this.dbKey, transaction)

      for (let j = 0; j < this.unverifiedTransactions.length; j++) {
        if (!this.unverifiedTransactions[j] || seqNo < this.unverifiedTransactions[j].getStartSeqNo()) {
          continue
        }
        this.unverifiedTransactions[j].addTransaction(transactions[i], transactionCode)
      }
    }
  }

  applyBundle(bundle, bundleSeqNo) {
    for (let i = 0; i < bundle.itemsIndex.array.length; i++) {
      const itemIndex = bundle.itemsIndex.array[i]
      const itemId = bundle.itemsIndex.array[i].itemId
      const item = bundle.items[itemId]
      this.items[itemId] = item
      this.itemsIndex.insert(itemIndex)
    }

    this.lastSeqNo = bundleSeqNo
  }

  async applyTransaction(key, transaction) {
    const seqNo = transaction.seqNo
    const command = transaction.command

    this.lastSeqNo = seqNo

    switch (command) {
      case 'Insert': {
        const [itemId, record] = await Promise.all([
          crypto.aesGcm.decryptJson(key, transaction.itemId),
          crypto.aesGcm.decryptJson(key, transaction.record)
        ])

        try {
          this.validateInsert(itemId)
        } catch (transactionCode) {
          return transactionCode
        }

        return this.applyInsert(itemId, seqNo, record)
      }

      case 'Update': {
        const [itemId, record, __v] = await Promise.all([
          crypto.aesGcm.decryptJson(key, transaction.itemId),
          crypto.aesGcm.decryptJson(key, transaction.record),
          crypto.aesGcm.decryptJson(key, transaction.__v),
        ])

        try {
          this.validateUpdateOrDelete(itemId, __v)
        } catch (transactionCode) {
          return transactionCode
        }

        return this.applyUpdate(itemId, record, __v)
      }

      case 'Delete': {
        const [itemId, __v] = await Promise.all([
          crypto.aesGcm.decryptJson(key, transaction.itemId),
          crypto.aesGcm.decryptJson(key, transaction.__v)
        ])

        try {
          this.validateUpdateOrDelete(itemId, __v)
        } catch (transactionCode) {
          return transactionCode
        }

        return this.applyDelete(itemId)
      }

      case 'Batch': {
        const batch = transaction.operations
        const { itemIds, records, __vs } = await this.decryptBatch(key, batch)

        try {
          this.validateBatch(batch, itemIds, __vs)
        } catch (transactionCode) {
          return transactionCode
        }

        return this.applyBatch(seqNo, batch, itemIds, records, __vs)
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

  async decryptBatch(key, batch) {
    const itemIdPromises = []
    const recordPromises = []
    const __vPromises = []

    for (const operation of batch) {
      itemIdPromises.push(crypto.aesGcm.decryptJson(key, operation['item-id']))
      recordPromises.push(operation.record && crypto.aesGcm.decryptJson(key, operation.record))
      __vPromises.push(operation.__v && crypto.aesGcm.decryptJson(key, operation.__v))
    }

    const [itemIds, records, __vs] = await Promise.all([
      Promise.all(itemIdPromises),
      Promise.all(recordPromises),
      Promise.all(__vPromises)
    ])

    return { itemIds, records, __vs }
  }

  validateBatch(batch, itemIds, __vs) {
    for (let i = 0; i < batch.length; i++) {
      const operation = batch[i]

      const itemId = itemIds[i]
      const __v = __vs[i]

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

  applyBatch(seqNo, batch, itemIds, records, __vs) {
    for (let i = 0; i < batch.length; i++) {
      const operation = batch[i]

      const itemId = itemIds[i]
      const record = records[i]
      const __v = __vs[i]

      switch (operation.command) {
        case 'Insert':
          this.applyInsert(itemId, seqNo, record, i)
          break

        case 'Update':
          this.applyUpdate(itemId, record, __v)
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

const connectWebSocket = () => new Promise((resolve, reject) => {
  setTimeout(() => { reject(new Error('timeout')) }, 5000)

  const url = ((window.location.protocol === 'https:') ?
    'wss://' : 'ws://') + window.location.host + '/api'

  ws = new WebSocket(url)

  ws.onopen = async (e) => {
    state.init = true
    resolve(e)
  }

  ws.onmessage = async (e) => {
    const message = JSON.parse(e.data)

    const route = message.route
    switch (route) {
      case 'ApplyTransactions': {
        const dbId = message.dbId
        const database = state.databases[dbId]

        const newTransactions = message.transactionLog

        if (!database) return

        await database.applyTransactions(newTransactions)
        database.onChange(database.getItems())

        if (!database.init) {
          database.init = true
          database.promiseResolve()
        }

        break
      }

      case 'ApplyBundle': {
        const dbId = message.dbId
        const database = state.databases[dbId]

        const bundleSeqNo = message.seqNo
        const base64Bundle = message.bundle
        const encryptedBundle = base64.decode(base64Bundle)
        const plaintextArrayBuffer = await crypto.aesGcm.decrypt(database.dbKey, encryptedBundle)
        const compressedString = arrayBufferToString(plaintextArrayBuffer)
        const plaintextString = LZString.decompress(compressedString)
        const bundle = JSON.parse(plaintextString)

        database.applyBundle(bundle, bundleSeqNo)

        break
      }

      case 'BuildBundle': {
        const dbId = message.dbId
        const database = state.databases[dbId]

        const bundle = {
          items: database.items,
          itemsIndex: database.itemsIndex
        }

        const plaintextString = JSON.stringify(bundle)
        const compressedString = LZString.compress(plaintextString)
        const plaintextArrayBuffer = stringToArrayBuffer(compressedString)
        const encryptedBundle = await crypto.aesGcm.encrypt(database.dbKey, plaintextArrayBuffer)
        const base64Bundle = base64.encode(encryptedBundle)

        const action = 'Bundle'
        const params = { seqNo: database.lastSeqNo, bundle: base64Bundle }
        const request = new Request(ws, action, params)

        request.send()

        break
      }

      case 'CreateDatabase':
      case 'OpenDatabase':
      case 'InitializeState':
      case 'Insert':
      case 'Update':
      case 'Delete':
      case 'Batch':
      case 'Bundle': {
        const requestId = message.requestId

        if (!requestId) return console.warn('Missing request id')

        const request = requests[requestId]
        if (!request) return console.warn(`Request ${requestId} no longer exists!`)
        else if (!request.promiseResolve || !request.promiseReject) return

        const response = message.response

        const successfulResponse = response && response.status === 200

        if (!successfulResponse) return request.promiseReject(response)
        else return request.promiseResolve(response)
      }

      default: {
        console.log('Received unknown message from backend:' + message)
        break
      }
    }
  }

  ws.onclose = () => {
    if (state.init) {
      setTimeout(() => { connectWebSocket() }, 1000)
    }
  }

  ws.onerror = () => {
    localData.clearAuthenticatedDataFromBrowser()
    if (!state.init) reject()
    ws.close()
  }

  ws.watch = async (requestId) => {
    requests[requestId] = {}

    const response = await new Promise((resolve, reject) => {
      requests[requestId].promiseResolve = resolve
      requests[requestId].promiseReject = reject

      setTimeout(() => { reject(new Error('timeout')) }, 10000)
    })

    delete requests[requestId]

    return response
  }
})

const createDatabase = async (dbName, metadata) => {
  if (!state.init) throw new Error(wsNotOpen)

  const dbId = uuidv4()

  const [dbKey, masterKey] = await Promise.all([
    crypto.aesGcm.generateKey(),
    localData.getKeyFromLocalStorage()
  ])

  const [dbKeyString, masterKeyString] = await Promise.all([
    crypto.aesGcm.getKeyStringFromKey(dbKey),
    crypto.aesGcm.getKeyStringFromKey(masterKey)
  ])
  const dbNameHash = await crypto.sha256.hashStringsWithSalt(dbName, masterKeyString)

  const [encryptedDbKey, encryptedDbName, encryptedMetadata] = await Promise.all([
    crypto.aesGcm.encryptJson(masterKey, dbKeyString),
    crypto.aesGcm.encryptJson(dbKey, dbName),
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
  const request = new Request(ws, action, params)

  await request.send()
}

const openDatabase = async (dbName, changeHandler) => {
  if (!state.init) throw new Error(wsNotOpen)

  const masterKeyString = localData.getKeyStringFromLocalStorage()
  const dbNameHash = await crypto.sha256.hashStringsWithSalt(dbName, masterKeyString)

  const request = new Request(ws, 'OpenDatabase', { dbNameHash })
  const [response, masterKey] = await Promise.all([
    request.send(),
    crypto.aesGcm.getKeyFromKeyString(masterKeyString)
  ])

  const dbKeyString = await crypto.aesGcm.decryptJson(masterKey, response.data.dbKey)
  const dbKey = await crypto.aesGcm.getKeyFromKeyString(dbKeyString)

  const dbId = response.data.dbId

  const initStatePromise = new Promise(resolve => {
    state.databases[dbId] = new Database(dbKey, dbId, changeHandler, resolve)
    state.dbNameHashToDbId[dbNameHash] = dbId
    state.dbNameToDbHash[dbName] = dbNameHash
  })

  const initializeState = new Request(ws, 'InitializeState', { dbId })
  initializeState.send()

  await initStatePromise
}

const getOpenDb = (dbName) => {
  const dbNameHash = state.dbNameToDbHash[dbName]
  const dbId = state.dbNameHashToDbId[dbNameHash]
  const database = state.databases[dbId]
  if (!dbNameHash || !dbId || !database || !database.init) throw new Error(dbNotOpen)
  return database
}

const insert = async (dbName, item, id) => {
  const database = getOpenDb(dbName)

  const action = 'Insert'
  const params = await _buildInsertParams(database, item, id)
  const request = new Request(ws, action, params)

  await postTransaction(database, request)
}

const _buildInsertParams = async (database, item, id) => {
  const dbId = database.dbId

  if (!dbId) throw new Error('Insert missing db id')
  if (!item) throw new Error('Insert missing item')

  const [itemId, encryptedItem] = await Promise.all([
    crypto.aesGcm.encryptJson(database.dbKey, id || uuidv4()),
    crypto.aesGcm.encryptJson(database.dbKey, item)
  ])

  return { dbId, itemId, encryptedItem }
}

const update = async (dbName, id, item) => {
  const database = getOpenDb(dbName)

  const action = 'Update'
  const params = await _buildUpdateParams(database, id, item)
  const request = new Request(ws, action, params)

  await postTransaction(database, request)
}

const _buildUpdateParams = async (database, id, item) => {
  const dbId = database.dbId

  if (!dbId) throw new Error('Update missing db id')
  if (!id) throw new Error('Update missing id')
  if (!item) throw new Error('Update missing item')

  const currentVersion = database.getItemVersionNumber(id)

  const [itemId, encryptedItem, __v] = await Promise.all([
    crypto.aesGcm.encryptJson(database.dbKey, id),
    crypto.aesGcm.encryptJson(database.dbKey, item),
    crypto.aesGcm.encryptJson(database.dbKey, currentVersion + 1)
  ])

  return { dbId, itemId, encryptedItem, __v }
}

const delete_ = async (dbName, id) => {
  const database = getOpenDb(dbName)

  const action = 'Delete'
  const params = await _buildDeleteParams(database, id)
  const request = new Request(ws, action, params)

  await postTransaction(database, request)
}

const _buildDeleteParams = async (database, id) => {
  const dbId = database.dbId

  if (!dbId) throw new Error('Delete missing db id')
  if (!id) throw new Error('Delete missing id')

  const currentVersion = database.getItemVersionNumber(id)

  const [itemId, __v] = await Promise.all([
    crypto.aesGcm.encryptJson(database.dbKey, id),
    crypto.aesGcm.encryptJson(database.dbKey, currentVersion + 1)
  ])

  return { dbId, itemId, __v }
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

  const request = new Request(ws, action, params)

  await postTransaction(database, request)
}

const postTransaction = async (database, request) => {
  const pendingTx = database.registerUnverifiedTransaction()
  const response = await request.send()
  const seqNo = response.data.sequenceNo

  await pendingTx.getResult(seqNo)

  database.unregisterUnverifiedTransaction(pendingTx)

  return seqNo
}

export default {
  connectWebSocket,
  openDatabase,
  createDatabase,
  insert,
  update,
  'delete': delete_,
  batch
}
