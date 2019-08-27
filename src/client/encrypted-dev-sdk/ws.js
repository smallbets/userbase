import uuidv4 from 'uuid/v4'
import LZString from 'lz-string'
import localData from './localData'
import crypto from './Crypto'

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

class Connection {
  constructor() {
    this.ws = {}

    this.state = {
      databases: {},
      dbIdToHash: {},
      dbNameToHash: {}
    }

    this.keys = {
      masterKey: {},
      masterKeyString: '',
      hmacKey: {}
    }

    this.requests = {}

    this.init = false
  }

  connect(username) {
    return new Promise(async (resolve, reject) => {
      setTimeout(() => { reject(new Error('timeout')) }, 5000)

      try {
        const rawKey = await localData.getRawKeyByUsername(username)

        this.keys.masterKey = await crypto.aesGcm.getKeyFromRawKey(rawKey)
        this.keys.masterKeyString = await crypto.aesGcm.getKeyStringFromKey(this.keys.masterKey)
        this.keys.hmacKey = await crypto.hmac.importKey(rawKey)
      } catch {
        localData.clearAuthenticatedDataFromBrowser()
        throw new Error('Unable to get the key')
      }

      const url = ((window.location.protocol === 'https:') ?
        'wss://' : 'ws://') + window.location.host + '/api'

      this.ws = new WebSocket(url)

      this.ws.onopen = (e) => {
        this.init = true
        resolve(e)
      }

      this.ws.onmessage = async (e) => {
        await this.handleMessage(JSON.parse(e.data))
      }

      this.ws.onerror = () => {
        localData.clearAuthenticatedDataFromBrowser()
        if (!this.init) reject()
        ws.close()
      }

      this.ws.watch = async (requestId) => {
        this.requests[requestId] = {}

        const response = await new Promise((resolve, reject) => {
          this.requests[requestId].promiseResolve = resolve
          this.requests[requestId].promiseReject = reject

          setTimeout(() => { reject(new Error('timeout')) }, 10000)
        })

        delete this.requests[requestId]

        return response
      }

      this.ws.onclose = () => {
        ws = new Connection()
        localData.clearAuthenticatedDataFromBrowser()
      }
    })
  }

  async handleMessage(message) {
    const route = message.route
    switch (route) {
      case 'ApplyTransactions': {
        const dbId = message.dbId
        const dbNameHash = message.dbNameHash || this.state.dbIdToHash[dbId]
        const database = this.state.databases[dbNameHash]

        if (!database) return

        const openingDatabase = message.dbNameHash && message.dbKey
        if (openingDatabase) {
          const dbKeyString = await crypto.aesGcm.decryptString(this.keys.masterKey, message.dbKey)
          database.dbKey = await crypto.aesGcm.getKeyFromKeyString(dbKeyString)
        }

        if (!database.dbKey) return

        if (message.bundle) {
          const bundleSeqNo = message.bundleSeqNo
          const base64Bundle = message.bundle
          const compressedString = await crypto.aesGcm.decryptString(database.dbKey, base64Bundle)
          const plaintextString = LZString.decompress(compressedString)
          const bundle = JSON.parse(plaintextString)

          database.applyBundle(bundle, bundleSeqNo)
        }

        const newTransactions = message.transactionLog
        await database.applyTransactions(newTransactions)
        database.onChange(database.getItems())

        if (!database.init) {
          this.state.dbIdToHash[dbId] = dbNameHash
          database.dbId = dbId
          database.init = true
        }

        break
      }

      case 'BuildBundle': {
        const dbId = message.dbId
        const dbNameHash = this.state.dbIdToHash[dbId]
        const database = this.state.databases[dbNameHash]

        if (!database) return

        const bundle = {
          items: database.items,
          itemsIndex: database.itemsIndex.array
        }

        const itemKeys = []

        for (let i = 0; i < bundle.itemsIndex.length; i++) {
          const itemId = bundle.itemsIndex[i].itemId
          const itemKey = await crypto.hmac.signString(this.keys.hmacKey, itemId)
          itemKeys.push(itemKey)
        }

        const plaintextString = JSON.stringify(bundle)
        const compressedString = LZString.compress(plaintextString)
        const base64Bundle = await crypto.aesGcm.encryptString(database.dbKey, compressedString)

        const action = 'Bundle'
        const params = { dbId, seqNo: database.lastSeqNo, bundle: base64Bundle, keys: itemKeys }
        this.request(action, params)

        break
      }

      case 'CreateDatabase':
      case 'GetDatabase':
      case 'OpenDatabase':
      case 'Insert':
      case 'Update':
      case 'Delete':
      case 'Batch':
      case 'Bundle': {
        const requestId = message.requestId

        if (!requestId) return console.warn('Missing request id')

        const request = this.requests[requestId]
        if (!request) return console.warn(`Request ${requestId} no longer exists!`)
        else if (!request.promiseResolve || !request.promiseReject) return

        const response = message.response

        const successfulResponse = response && response.status === 200

        if (!successfulResponse) return request.promiseReject(response)
        else return request.promiseResolve(response)
      }

      default: {
        console.log('Received unknown message from backend:' + JSON.stringify(message))
        break
      }
    }
  }

  close() {
    this.ws.close()
  }

  async request(action, params) {
    // generate a new requestId
    const requestId = uuidv4()
    this.requests[requestId] = {}

    // get a promise that is resolved when the WebSocket
    // receives a response for this requestId — the promise
    // would time out of x seconds
    const responseWatcher = this.watch(requestId)

    // send the request on the WebSocket
    this.ws.send(JSON.stringify({
      requestId,
      action,
      params
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

  async watch(requestId) {
    const response = await new Promise((resolve, reject) => {
      this.requests[requestId].promiseResolve = resolve
      this.requests[requestId].promiseReject = reject

      setTimeout(() => { reject(new Error('timeout')) }, 10000)
    })

    delete this.requests[requestId]
    return response
  }
}

let ws = new Connection()
export default ws
