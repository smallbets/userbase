import base64 from 'base64-arraybuffer'
import uuidv4 from 'uuid/v4'
import LZString from 'lz-string'
import localData from './localData'
import crypto from './Crypto'

class RequestFailed extends Error {
  constructor(action, response, message, ...params) {
    super(...params)

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RequestFailed)
    }

    this.name = `RequestFailed: ${action} (${response && response.status})`
    this.message = message || (response && response.data) || 'Error'
    this.response = response
  }
}

class Connection {
  constructor() {
    this.init()
  }

  init(session, onSessionChange) {
    for (const property of Object.keys(this)) {
      delete this[property]
    }

    this.ws = null
    this.connected = false

    this.session = session
    this.onSessionChange = onSessionChange

    this.requests = {}

    this.keys = {
      init: false,
      masterKey: {},
      masterKeyString: '',
      hmacKey: {}
    }

    this.processingKeyRequest = {}
    this.sentMasterKeyTo = {}

    this.state = {
      databases: {},
      dbIdToHash: {},
      dbNameToHash: {}
    }
  }

  connect(session, onSessionChange) {
    if (!session) throw new Error('Missing session')
    if (!session.username) throw new Error('Session missing username')
    if (!session.signedIn) throw new Error('Not signed in to session')

    return new Promise(async (resolve, reject) => {
      let connected = false
      let timeout = false
      setTimeout(
        () => {
          if (!connected) {
            timeout = true
            this.close()
            reject(new Error('timeout'))
          }
        },
        5000
      )

      const url = ((window.location.protocol === 'https:') ?
        'wss://' : 'ws://') + window.location.host + '/api'

      const ws = new WebSocket(url)

      ws.onopen = async () => {
        if (timeout) {
          this.close()
          return
        } else {
          connected = true
          this.init(session, onSessionChange)
          this.ws = ws
          this.connected = connected

          try {
            await this.setKeys(session.key)
          } catch {

            // re-request key if already requested
            const alreadySavedRequest = localData.getTempRequestForMasterKey(session.username)
            if (alreadySavedRequest) {
              const { requesterPublicKey, tempKeyToRequestMasterKey } = alreadySavedRequest

              const masterKey = await this.requestMasterKey(requesterPublicKey, tempKeyToRequestMasterKey)
              if (masterKey) return resolve() // already updated session inside receiveMasterKey()
            }
          }

          resolve(onSessionChange(this.session))
        }
      }

      ws.onmessage = async (e) => {
        await this.handleMessage(JSON.parse(e.data))
      }

      ws.onerror = () => {
        if (!connected) {
          this.signOut()
          reject()
        } else {
          this.close()
        }
      }

      ws.watch = async (requestId) => {
        this.requests[requestId] = {}

        const response = await new Promise((resolve, reject) => {
          this.requests[requestId].promiseResolve = resolve
          this.requests[requestId].promiseReject = reject

          setTimeout(() => { reject(new Error('timeout')) }, 10000)
        })

        delete this.requests[requestId]

        return response
      }

      ws.onclose = () => {
        this.init(this.session, onSessionChange)
        onSessionChange(this.session)
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

      case 'ReceiveRequestForMasterKey': {
        if (!this.keys.init) return

        const requesterPublicKey = message.requesterPublicKey
        this.sendMasterKey(requesterPublicKey)

        break
      }

      case 'ReceiveMasterKey': {
        const { encryptedMasterKey, senderPublicKey } = message
        const { tempKeyToRequestMasterKey, requesterPublicKey } = localData.getTempRequestForMasterKey(this.session.username)

        await this.receiveMasterKey(encryptedMasterKey, senderPublicKey, requesterPublicKey, tempKeyToRequestMasterKey)

        break
      }

      case 'CreateDatabase':
      case 'GetDatabase':
      case 'OpenDatabase':
      case 'Insert':
      case 'Update':
      case 'Delete':
      case 'Batch':
      case 'Bundle':
      case 'ClientHasKey':
      case 'RequestMasterKey':
      case 'GetRequestsForMasterKey':
      case 'SendMasterKey': {
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
    this.ws
      ? this.ws.close()
      : this.init(this.session, this.onSessionChange)
  }

  signOut() {
    if (!this.session || !this.session.username) return
    localData.signOutSession(this.session.username)

    this.session.signedIn = false

    this.close()
    this.onSessionChange(this.session)
  }

  async setKeys(masterKeyString, requesterPublicKey) {
    if (!masterKeyString) throw new Error('Missing master key')
    if (!this.session.key) this.session.key = masterKeyString

    this.keys.rawMasterKey = base64.decode(masterKeyString)
    this.keys.masterKey = await crypto.aesGcm.getKeyFromRawKey(this.keys.rawMasterKey)
    this.keys.masterKeyString = masterKeyString
    this.keys.hmacKey = await crypto.hmac.importKey(this.keys.rawMasterKey)

    const action = 'ClientHasKey'
    const params = { requesterPublicKey } // only provided if first time validating since receving master key
    await this.request(action, params)

    this.keys.init = true
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
      throw new RequestFailed(action, e)
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

  async requestMasterKey(requesterPublicKey, tempKeyToRequestMasterKey) {
    const action = 'RequestMasterKey'
    const params = { requesterPublicKey }
    const requestMasterKeyResponse = await this.request(action, params)

    const { encryptedMasterKey, senderPublicKey } = requestMasterKeyResponse.data
    if (encryptedMasterKey && senderPublicKey) {
      const masterKey = await this.receiveMasterKey(encryptedMasterKey, senderPublicKey, requesterPublicKey, tempKeyToRequestMasterKey)
      return masterKey
    }
    return null
  }

  async sendMasterKey(requesterPublicKey) {
    if (this.sentMasterKeyTo[requesterPublicKey] || this.processingKeyRequest[requesterPublicKey]) return
    this.processingKeyRequest[requesterPublicKey] = true

    if (window.confirm(`Send the master key to device: \n\n${requesterPublicKey}\n`)) {
      try {
        const sharedSecret = crypto.diffieHellman.getSharedSecret(
          this.keys.rawMasterKey,
          new Uint8Array(base64.decode(requesterPublicKey))
        )

        const sharedRawKey = await crypto.sha256.hash(sharedSecret)
        const sharedKey = await crypto.aesGcm.getKeyFromRawKey(sharedRawKey)

        const encryptedMasterKey = await crypto.aesGcm.encryptString(sharedKey, this.keys.masterKeyString)

        const action = 'SendMasterKey'
        const params = { requesterPublicKey, encryptedMasterKey }

        await this.request(action, params)
        this.sentMasterKeyTo[requesterPublicKey] = true
      } catch (e) {
        console.warn(e)
      }
    }
    delete this.processingKeyRequest[requesterPublicKey]
  }

  async receiveMasterKey(encryptedMasterKey, senderPublicKey, requesterPublicKey, tempKeyToRequestMasterKey) {
    const sharedSecret = crypto.diffieHellman.getSharedSecret(
      tempKeyToRequestMasterKey,
      new Uint8Array(base64.decode(senderPublicKey))
    )

    const sharedRawKey = await crypto.sha256.hash(sharedSecret)
    const sharedKey = await crypto.aesGcm.getKeyFromRawKey(sharedRawKey)

    const masterKeyString = await crypto.aesGcm.decryptString(sharedKey, encryptedMasterKey)

    await localData.saveKeyStringToLocalStorage(this.session.username, masterKeyString)

    await this.setKeys(masterKeyString, requesterPublicKey)

    localData.removeRequestForMasterKey(this.session.username)

    this.onSessionChange(this.session)
    return masterKeyString
  }
}

export default new Connection()
