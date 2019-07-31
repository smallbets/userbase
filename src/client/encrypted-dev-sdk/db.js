import uuidv4 from 'uuid/v4'
import server from './server'
import Worker from './worker.js'
import auth from './auth'
import crypto from './Crypto'
import SortedArray from 'sorted-array'
import { appendBuffers } from './Crypto/utils'

const TransactionCodes = Object.freeze({
  'success': 1,
  'item-already-exists': 2,
  'item-already-deleted': 3,
  'update-conflict': 4
})

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
      if (this.transactions[this.txSeqNo] == TransactionCodes['success']) {
        this.promiseResolve()
      } else {
        this.promiseReject(this.transactions[this.txSeqNo])
      }
    }
  }

  addTransaction(transaction, code) {
    this.transactions[transaction['sequence-no']] = code
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
      const itemId = transactions[i]['item-id']
      const seqNo = transactions[i]['sequence-no']
      const command = transactions[i]['command']
      const record = transactions[i]['record'] ? await crypto.aesGcm.decrypt(key, new Uint8Array(transactions[i]['record'].data)) : undefined

      this.lastSeqNo = seqNo

      let transactionCode = null

      switch (command) {
        case 'Insert':
          if (this.items[itemId]) {
            transactionCode = TransactionCodes['item-already-exists']
            break
          }
          this.items[itemId] = { seqNo, record }
          this.itemsIndex.insert({ seqNo, itemId })
          transactionCode = TransactionCodes['success']
          break

        case 'Update':
          if (!this.items[itemId]) {
            transactionCode = TransactionCodes['item-already-deleted']
            break
          }
          this.items[itemId].record = record
          transactionCode = TransactionCodes['success']
          break


        case 'Delete':
          if (!this.items[itemId]) {
            transactionCode = TransactionCodes['item-already-deleted']
            break
          }
          this.itemsIndex.remove(this.items[itemId])
          delete this.items[itemId]
          transactionCode = TransactionCodes['success']
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

const init = async (onDbChangeHandler, onFirstResponse) => {
  state.database = new Database()
  state.key = await auth.getKeyFromLocalStorage()

  const url = ((window.location.protocol === 'https:') ?
    'wss://' : 'ws://') + window.location.host + '/api'

  let isFirstMessage = true

  const connectWebSocket = () => {
    const ws = new WebSocket(url)

    ws.onmessage = async (e) => {
      const newTransactions = JSON.parse(e.data)
      await state.database.applyTransactions(newTransactions)
      onDbChangeHandler(state.database.getItems())

      if (isFirstMessage) {
        onFirstResponse()
        isFirstMessage = false
      }
    }

    ws.onclose = () => setTimeout(() => { connectWebSocket() }, 1000)
    ws.onerror = () => ws.close()
  }

  connectWebSocket()
}

const insert = async (item) => {
  const encryptedItem = await crypto.aesGcm.encrypt(state.key, item)
  const itemId = uuidv4()

  await postTransaction(server.db.insert(itemId, encryptedItem))

  return itemId
}

const update = async (oldItem, newItem) => {
  const encryptedItem = await crypto.aesGcm.encrypt(state.key, newItem)

  await postTransaction(server.db.update(oldItem.itemId, encryptedItem))
}

const delete_ = async (item) => {
  await postTransaction(server.db.delete(item.itemId))
}

const batchInsert = async (items) => {
  const encryptionPromises = items.map(item => crypto.aesGcm.encrypt(state.key, item))
  const encryptedItems = await Promise.all(encryptionPromises)

  const { buffer, byteLengths } = appendBuffers(encryptedItems)

  const itemsMetadata = items.map((item, i) => ({
    itemId: uuidv4(),
    byteLength: byteLengths[i]
  }))

  await postTransaction(server.db.batchInsert(itemsMetadata, buffer))
}

const batchUpdate = async (oldItems, newItems) => {
  const encryptionPromises = newItems.map(item => crypto.aesGcm.encrypt(state.key, item))
  const encryptedItems = await Promise.all(encryptionPromises)

  const { buffer, byteLengths } = appendBuffers(encryptedItems)

  const updatedItemsMetadata = oldItems.map((item, index) => ({
    itemId: item.itemId,
    byteLength: byteLengths[index]
  }))

  await postTransaction(server.db.batchUpdate(updatedItemsMetadata, buffer))
}

const batchDelete = async (items) => {
  const itemIds = items.map(item => item.itemId)

  await postTransaction(server.db.batchDelete(itemIds))
}

const postTransaction = async (promise) => {
  try {
    const pendingTx = state.database.registerUnverifiedTransaction()
    const seqNo = await promise

    await pendingTx.getResult(seqNo)

    state.database.unregisterUnverifiedTransaction(pendingTx)

    initializeBundlingProcess(state.key)

    return seqNo
  } catch (e) {
    const unauthorized = e.response && e.response.status === 401
    if (unauthorized) auth.clearAuthenticatedDataFromBrowser()
    throw e
  }
}

const initializeBundlingProcess = async (key) => {
  const worker = new Worker()
  if (!key) key = await auth.getKeyFromLocalStorage() // can't read local storage from worker
  worker.postMessage(key)
}

export default {
  init,
  insert,
  update,
  'delete': delete_,
  batchInsert,
  batchUpdate,
  batchDelete
}
