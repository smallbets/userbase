import uuidv4 from 'uuid/v4'
import base64 from 'base64-arraybuffer'
import auth from './auth'
import crypto from './Crypto'
import SortedArray from 'sorted-array'
import LZString from 'lz-string'
import shajs from 'sha.js'
import { stringToArrayBuffer, arrayBufferToString } from './Crypto/utils'

const success = 'Success'
const itemAlreadyExists = 'Item already exists'
const itemAlreadyDeleted = 'Item already deleted'
const versionConflict = 'Version conflict'
const dbNotOpen = 'Database not open'

const state = {}
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
  constructor() {
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

      const transactionCode = await this.applyTransaction(state.key, transaction)
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
        const record = await crypto.aesGcm.decryptJson(key, base64.decode(transaction.record))
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
        const record = await crypto.aesGcm.decryptJson(key, base64.decode(transaction.record))
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
        const record = await crypto.aesGcm.decryptJson(key, base64.decode(transaction.record))
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
          recordPromises.push(operation.record && crypto.aesGcm.decryptJson(key, base64.decode(operation.record)))
        }

        const records = await Promise.all([Promise.all(recordPromises)])

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
    for (let i = 0; i < batch.length; i++) {
      const operation = batch[i]

      const itemId = records[i].id
      const __v = records[i].__v

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

const init = async (onDbChangeHandler, onFirstResponse) => {
  state.database = new Database()

  try {
    state.key = await auth.getKeyFromLocalStorage()
    state.keyString = await auth.getKeyStringFromLocalStorage()
  } catch {
    auth.clearAuthenticatedDataFromBrowser()
    throw new Error('Unable to get the key')
  }

  const url = ((window.location.protocol === 'https:') ?
    'wss://' : 'ws://') + window.location.host + '/api'

  const promise = new Promise((resolve, reject) => {
    state.promiseResolve = resolve
    state.promiseReject = reject

    setTimeout(() => { reject(new Error('timeout')) }, 5000)
  })

  const connectWebSocket = () => {
    ws = new WebSocket(url)

    ws.onmessage = async (e) => {
      await handleMessage(JSON.parse(e.data), onDbChangeHandler, onFirstResponse)
    }

    ws.onerror = () => {
      state.promiseReject()
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
  }

  connectWebSocket()

  await promise
}

const close = () => {
  state.init = false
  ws.close()
}

const handleMessage = async (message, onDbChangeHandler, onFirstResponse) => {
  const route = message.route
  switch (route) {
    case 'ApplyTransactions': {
      if (message.bundle) {
        const bundleSeqNo = message.bundleSeqNo
        const base64Bundle = message.bundle
        const encryptedBundle = base64.decode(base64Bundle)
        const plaintextArrayBuffer = await crypto.aesGcm.decrypt(state.key, encryptedBundle)
        const compressedString = arrayBufferToString(plaintextArrayBuffer)
        const plaintextString = LZString.decompress(compressedString)
        const bundle = JSON.parse(plaintextString)

        state.database.applyBundle(bundle, bundleSeqNo)
      }

      const newTransactions = message.transactionLog

      await state.database.applyTransactions(newTransactions)

      onDbChangeHandler(state.database.getItems())

      if (!state.init) {
        onFirstResponse()
        state.init = true
        state.promiseResolve()
      }

      break
    }

    case 'BuildBundle': {
      const bundle = {
        items: state.database.items,
        itemsIndex: state.database.itemsIndex.array
      }

      const itemKeys = []

      for (let i = 0; i < bundle.itemsIndex.length; i++) {
        const itemId = bundle.itemsIndex[i].itemId
        const itemKey = shaItemId(itemId)
        itemKeys.push(itemKey)
      }

      const plaintextString = JSON.stringify(bundle)
      const compressedString = LZString.compress(plaintextString)
      const plaintextArrayBuffer = stringToArrayBuffer(compressedString)
      const encryptedBundle = await crypto.aesGcm.encrypt(state.key, plaintextArrayBuffer)
      const base64Bundle = base64.encode(encryptedBundle)

      const action = 'Bundle'
      const params = { seqNo: state.database.lastSeqNo, bundle: base64Bundle, keys: itemKeys }
      const request = new Request(ws, action, params)

      request.send()

      break
    }

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
      console.log('Received message from backend:' + message)
      break
    }
  }
}

const insert = async (item, id) => {
  if (!state.init) throw new Error(dbNotOpen)

  const action = 'Insert'
  const params = await _buildInsertParams(item, id)
  const request = new Request(ws, action, params)

  await postTransaction(request)
}

const _buildInsertParams = async (item, id) => {
  if (!item) throw new Error('Insert missing item')

  const itemId = id || uuidv4()

  const itemKey = shaItemId(itemId)
  const itemRecord = { id: itemId, item }
  const encryptedItem = base64.encode(await crypto.aesGcm.encryptJson(state.key, itemRecord))

  return { itemKey, encryptedItem }
}

const update = async (id, item) => {
  if (!state.init) throw new Error(dbNotOpen)

  const action = 'Update'
  const params = await _buildUpdateParams(id, item)
  const request = new Request(ws, action, params)

  await postTransaction(request)
}

const _buildUpdateParams = async (id, item) => {
  if (!id) throw new Error('Update missing id')
  if (!item) throw new Error('Update missing item')

  const itemKey = shaItemId(id)
  const currentVersion = state.database.getItemVersionNumber(id)
  const itemRecord = { id, item, __v: currentVersion + 1 }
  const encryptedItem = base64.encode(await crypto.aesGcm.encryptJson(state.key, itemRecord))

  return { itemKey, encryptedItem }
}

const delete_ = async (id) => {
  if (!state.init) throw new Error(dbNotOpen)

  const action = 'Delete'
  const params = await _buildDeleteParams(id)
  const request = new Request(ws, action, params)

  await postTransaction(request)
}

const _buildDeleteParams = async (id) => {
  if (!id) throw new Error('Delete missing id')

  const itemKey = shaItemId(id)
  const currentVersion = state.database.getItemVersionNumber(id)
  const itemRecord = { id, __v: currentVersion + 1 }
  const encryptedItem = base64.encode(await crypto.aesGcm.encryptJson(state.key, itemRecord))

  return { itemKey, encryptedItem }
}

const batch = async (operations) => {
  if (!state.init) throw new Error(dbNotOpen)

  const action = 'Batch'

  const operationParamsPromises = operations.map(operation => {

    const command = operation.command

    switch (command) {
      case 'Insert': {
        const id = operation.id
        const item = operation.item

        return _buildInsertParams(item, id)
      }

      case 'Update': {
        const id = operation.id
        const item = operation.item

        return _buildUpdateParams(id, item)
      }

      case 'Delete': {
        const id = operation.id

        return _buildDeleteParams(id)
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

  await postTransaction(request)
}

const postTransaction = async (request) => {
  const pendingTx = state.database.registerUnverifiedTransaction()
  const response = await request.send()
  const seqNo = response.data.sequenceNo

  await pendingTx.getResult(seqNo)

  state.database.unregisterUnverifiedTransaction(pendingTx)

  return seqNo
}

const shaItemId = (itemId) => {
  const stringToHash = state.keyString + itemId
  return shajs('sha256').update(stringToHash).digest('hex')
}

export default {
  init,
  close,
  insert,
  update,
  'delete': delete_,
  batch
}
