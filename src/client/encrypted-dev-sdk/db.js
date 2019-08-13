import uuidv4 from 'uuid/v4'
import base64 from 'base64-arraybuffer'
import Worker from './worker.js'
import auth from './auth'
import crypto from './Crypto'
import SortedArray from 'sorted-array'

const success = 'Success'
const itemAlreadyExists = 'Item already exists'
const itemAlreadyDeleted = 'Item already deleted'
const dbNotOpen = 'Database not open'

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

      setTimeout(() => { reject('timeout') }, 5000)
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
    this.itemsIndex = SortedArray.comparing('seqNo', [])
    this.unverifiedTransactions = []
    this.lastSeqNo = -1
  }

  async applyTransactions(transactions) {
    const key = await auth.getKeyFromLocalStorage()

    for (let i = 0; i < transactions.length; i++) {
      const itemId = transactions[i].itemId
      const seqNo = transactions[i].seqNo
      const command = transactions[i].op
      const record = transactions[i].record ?
        await crypto.aesGcm.decryptJson(key, Uint8Array.from(atob(transactions[i].record), c => c.charCodeAt(0))) :
        undefined

      this.lastSeqNo = seqNo

      let transactionCode = null

      switch (command) {
        case 'Insert':
          if (this.items[itemId]) {
            transactionCode = itemAlreadyExists
            break
          }
          this.items[itemId] = { seqNo, record }
          this.itemsIndex.insert({ seqNo, itemId })
          transactionCode = success
          break

        case 'Update':
          if (!this.items[itemId]) {
            transactionCode = itemAlreadyDeleted
            break
          }
          this.items[itemId].record = record
          transactionCode = success
          break


        case 'Delete':
          if (!this.items[itemId]) {
            transactionCode = itemAlreadyDeleted
            break
          }
          this.itemsIndex.remove(this.items[itemId])
          delete this.items[itemId]
          transactionCode = success
          break
      }

      for (let j = 0; j < this.unverifiedTransactions.length; j++) {
        if (!this.unverifiedTransactions[j] || seqNo < this.unverifiedTransactions[j].getStartSeqNo()) {
          continue
        }
        this.unverifiedTransactions[j].addTransaction(transactions[i], transactionCode)
      }
    }
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
}

const state = {}
const requests = {}
let ws

const init = async (onDbChangeHandler, onFirstResponse) => {
  state.database = new Database()
  state.key = await auth.getKeyFromLocalStorage()
  state.init = true

  const url = ((window.location.protocol === 'https:') ?
    'wss://' : 'ws://') + window.location.host + '/api'

  let isFirstMessage = true

  const connectWebSocket = () => {
    ws = new WebSocket(url)

    ws.onmessage = async (e) => {
      const message = JSON.parse(e.data)

      const route = message.route
      switch (route) {
        case 'transactionLog': {
          const newTransactions = message.transactionLog

          await state.database.applyTransactions(newTransactions)
          onDbChangeHandler(state.database.getItems())

          if (isFirstMessage) {
            onFirstResponse()
            isFirstMessage = false
          }

          break
        }
        case 'Insert':
        case 'Update':
        case 'Delete': {
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

    ws.onclose = () => setTimeout(() => { connectWebSocket() }, 1000)
    ws.onerror = () => ws.close()

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
}

const insert = async (item) => {
  if (!state.init) throw new Error(dbNotOpen)

  const encryptedItem = base64.encode(await crypto.aesGcm.encryptJson(state.key, item))
  const itemId = uuidv4()

  const action = 'Insert'
  const params = { itemId, encryptedItem }
  const request = new Request(ws, action, params)

  await postTransaction(request)
}

const update = async (oldItem, newItem) => {
  if (!state.init) throw new Error(dbNotOpen)

  const encryptedItem = base64.encode(await crypto.aesGcm.encryptJson(state.key, newItem))

  const action = 'Update'
  const params = { itemId: oldItem.itemId, encryptedItem }
  const request = new Request(ws, action, params)

  await postTransaction(request)
}

const delete_ = async (item) => {
  if (!state.init) throw new Error(dbNotOpen)

  const action = 'Delete'
  const params = { itemId: item.itemId }
  const request = new Request(ws, action, params)

  await postTransaction(request)
}

const postTransaction = async (request) => {
  const pendingTx = state.database.registerUnverifiedTransaction()
  const response = await request.send()
  const seqNo = response.data.sequenceNo

  await pendingTx.getResult(seqNo)

  state.database.unregisterUnverifiedTransaction(pendingTx)

  initializeBundlingProcess(state.key)

  return seqNo
}

const initializeBundlingProcess = async (key) => {
  const worker = new Worker()
  worker.postMessage(key)
}

export default {
  init,
  insert,
  update,
  'delete': delete_
}
