import base64 from 'base64-arraybuffer'
import uuidv4 from 'uuid/v4'
import LZString from 'lz-string'
import localData from './localData'
import crypto from './Crypto'
import { getWsUrl } from './utils'
import statusCodes from './statusCodes'
import config from './config'
import errors from './errors'

const wsAlreadyConnected = 'Web Socket already connected'

const BACKOFF_RETRY_DELAY = 1000
const MAX_RETRY_DELAY = 1000 * 30

const clientId = uuidv4() // only 1 client ID per browser tab (assumes code does not reload)

class RequestFailed extends Error {
  constructor(action, e, ...params) {
    super(...params)

    this.name = `RequestFailed: ${action}`
    this.message = e.message
    this.status = e.status || (e.message === 'timeout' && statusCodes['Gateway Timeout'])
    this.response = e.status && e
  }
}

class WebSocketError extends Error {
  constructor(message, username, ...params) {
    super(...params)

    this.name = 'WebSocket error'
    this.message = message
    this.username = username
  }
}

class Connection {
  constructor() {
    this.init()
  }

  init(resolveConnection, rejectConnection, session, seedString, rememberMe, state) {
    if (this.pingTimeout) clearTimeout(this.pingTimeout)

    for (const property of Object.keys(this)) {
      delete this[property]
    }

    this.ws = null
    this.connected = false

    this.resolveConnection = resolveConnection
    this.rejectConnection = rejectConnection
    this.connectionResolved = false

    this.session = {
      username: session && session.username,
      sessionId: session && session.sessionId,
      creationDate: session && session.creationDate
    }

    this.seedString = seedString
    this.keys = {
      init: false,
      salts: {}
    }

    this.rememberMe = rememberMe

    this.requests = {}

    this.state = state || {
      databases: {},
      dbIdToHash: {},
      dbNameToHash: {}
    }
  }

  connect(session, seedString = null, rememberMe, reconnectDelay, state) {
    if (this.connected) throw new WebSocketError(wsAlreadyConnected, this.session.username)

    return new Promise((resolve, reject) => {
      let timeout = false

      const timeoutToOpenWebSocket = setTimeout(
        () => {
          if (!this.connected && !this.reconnecting) {
            timeout = true
            reject(new WebSocketError('timeout'))
          }
        },
        10000
      )

      const url = `${getWsUrl(config.getEndpoint())}/api?appId=${config.getAppId()}&sessionId=${session.sessionId}&clientId=${clientId}`

      const ws = new WebSocket(url)

      ws.onopen = async () => {
        if (timeout) return
        clearTimeout(timeoutToOpenWebSocket)
      }

      ws.onmessage = async (e) => {
        if (timeout) return

        try {
          const message = JSON.parse(e.data)
          const route = message.route

          switch (route) {
            case 'Ping': {
              this.heartbeat()

              const action = 'Pong'
              this.ws.send(JSON.stringify({ action }))
              break
            }

            case 'Connection': {
              this.init(resolve, reject, session, seedString, rememberMe, state)
              this.ws = ws
              this.heartbeat()
              this.connected = true

              const {
                keySalts,
                encryptedValidationMessage
              } = message

              this.keys.salts = keySalts
              this.encryptedValidationMessage = new Uint8Array(encryptedValidationMessage.data)

              await this.setKeys(this.seedString)

              break
            }

            case 'ApplyTransactions': {
              const dbId = message.dbId
              const dbNameHash = message.dbNameHash || this.state.dbIdToHash[dbId]
              const database = this.state.databases[dbNameHash]

              if (!database) throw new Error('Missing database')

              // queue guarantees transactions will be applied in the order they are received from the server
              if (database.applyTransactionsQueue.isEmpty()) {

                // take a spot in the queue and proceed applying so the next caller knows queue is not empty
                database.applyTransactionsQueue.enqueue(null)
              } else {

                // wait until prior batch in queue finishes applying successfully
                await new Promise(resolve => {
                  const startApplyingThisBatchOfTransactions = resolve
                  database.applyTransactionsQueue.enqueue(startApplyingThisBatchOfTransactions)
                })
              }

              const openingDatabase = message.dbNameHash && message.dbKey
              if (openingDatabase) {
                const dbKeyString = await crypto.aesGcm.decryptString(this.keys.encryptionKey, message.dbKey)
                database.dbKeyString = dbKeyString
                database.dbKey = await crypto.aesGcm.getKeyFromKeyString(dbKeyString)
              }

              if (!database.dbKey) throw new Error('Missing db key')

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

              if (!database.init) {
                this.state.dbIdToHash[dbId] = dbNameHash
                database.dbId = dbId
                database.init = true
                database.receivedMessage()
              }

              if (message.buildBundle) {
                this.buildBundle(database)
              }

              // start applying next batch in queue when this one is finished applying successfully
              database.applyTransactionsQueue.dequeue()
              if (!database.applyTransactionsQueue.isEmpty()) {
                const startApplyingNextBatchInQueue = database.applyTransactionsQueue.peek()
                startApplyingNextBatchInQueue()
              }

              break
            }

            case 'SignOut':
            case 'UpdateUser':
            case 'DeleteUser':
            case 'CreateDatabase':
            case 'GetDatabase':
            case 'OpenDatabase':
            case 'Insert':
            case 'Update':
            case 'Delete':
            case 'BatchTransaction':
            case 'Bundle':
            case 'ValidateKey':
            case 'GetPasswordSalts': {
              const requestId = message.requestId

              if (!requestId) return console.warn('Missing request id')

              const request = this.requests[requestId]
              if (!request) return console.warn(`Request ${requestId} no longer exists!`)
              else if (!request.promiseResolve || !request.promiseReject) return

              const response = message.response

              const successfulResponse = response && response.status === statusCodes['Success']

              if (!successfulResponse) return request.promiseReject(response)
              else return request.promiseResolve(response)
            }

            default: {
              console.log('Received unknown message from backend:' + JSON.stringify(message))
              break
            }
          }
        } catch (e) {
          if (!this.connectionResolved) {
            this.close()
            reject(new WebSocketError(e.message, session.username))
          } else {
            console.warn('Error handling message: ', e)
          }
        }
      }

      ws.onclose = async (e) => {
        if (timeout) return

        const serviceRestart = e.code === statusCodes['Service Restart']
        const clientDisconnected = e.code === statusCodes['No Pong Received']
        const attemptToReconnect = serviceRestart || clientDisconnected || !e.wasClean // closed without explicit call to ws.close()

        if (attemptToReconnect) {
          const delay = (serviceRestart && !reconnectDelay)
            ? 0
            : (reconnectDelay ? reconnectDelay + BACKOFF_RETRY_DELAY : 1000)

          this.reconnecting = true
          await this.reconnect(resolve, reject, session, seedString, rememberMe, delay, !this.reconnected && state)
        } else if (e.code === statusCodes['Client Already Connected']) {
          reject(new WebSocketError(wsAlreadyConnected, session.username))
        } else {
          this.init()
        }
      }
    })
  }

  async reconnect(resolveConnection, rejectConnection, session, seedString, rememberMe, reconnectDelay, currentState) {
    try {
      const retryDelay = Math.min(reconnectDelay, MAX_RETRY_DELAY)
      console.log(`Connection to server lost. Attempting to reconnect in ${retryDelay / 1000} second${retryDelay !== 1000 ? 's' : ''}...`)

      const dbsToReopen = []

      // as soon as one reconnect succeeds, resolves all the way up the stack and all reconnects succeed
      resolveConnection(await new Promise((resolve, reject) => setTimeout(
        async () => {
          try {
            const state = currentState || {
              databases: { ...this.state.databases },
              dbIdToHash: { ...this.state.dbIdToHash },
              dbNameToHash: { ...this.state.dbNameToHash }
            }

            for (const dbNameHash in state.databases) {
              state.databases[dbNameHash].init = false
              dbsToReopen.push(dbNameHash)
            }

            this.init()
            this.reconnecting = true

            const result = await this.connect(session, seedString, rememberMe, reconnectDelay, state)

            this.reconnected = true

            // only reopen databases on the first call to reconnect()
            if (!currentState) await this.reopenDatabases(dbsToReopen, 1000)

            resolve(result)
          } catch (e) {
            reject(e)
          }
        },
        retryDelay
      )))
    } catch (e) {
      rejectConnection(e)
    }
  }

  async reopenDatabases(dbsToReopen, retryDelay) {
    try {
      const openDatabasePromises = []

      for (const dbNameHash of dbsToReopen) {
        const database = this.state.databases[dbNameHash]

        if (!database.init) {
          const action = 'OpenDatabase'
          const params = { dbNameHash, reopenAtSeqNo: database.lastSeqNo }
          openDatabasePromises.push(this.request(action, params))
        }
      }

      await Promise.all(openDatabasePromises)
    } catch (e) {

      // keep attempting to reopen on failure
      await new Promise(resolve => setTimeout(
        async () => {
          await this.reopenDatabases(dbsToReopen, retryDelay + BACKOFF_RETRY_DELAY)
          resolve()
        },
        Math.min(retryDelay, MAX_RETRY_DELAY)
      ))
    }
  }

  heartbeat() {
    clearTimeout(this.pingTimeout)

    const LATENCY_BUFFER = 3000

    this.pingTimeout = setTimeout(() => {
      if (this.ws) this.ws.close(statusCodes['No Pong Received'])
    }, 30000 + LATENCY_BUFFER)
  }

  close(code) {
    this.ws
      ? this.ws.close(code)
      : this.init()
  }

  async signOut() {
    const username = this.session.username
    const connectionResolved = this.connectionResolved
    const rejectConnection = this.rejectConnection

    try {
      localData.signOutSession(this.rememberMe, username)

      const sessionId = this.session.sessionId

      if (this.reconnecting) throw new errors.Reconnecting

      const action = 'SignOut'
      const params = { sessionId }
      await this.request(action, params)

      this.close()

      if (!connectionResolved && rejectConnection) {
        rejectConnection(new WebSocketError('Canceled', username))
      }

    } catch (e) {
      if (!connectionResolved && rejectConnection) {
        rejectConnection(new WebSocketError('Canceled', username))
      }

      throw e
    }
  }

  async setKeys(seedString) {
    if (this.keys.init) return
    if (!seedString) throw new WebSocketError('Missing seed', this.session.username)
    if (!this.keys.salts) throw new WebSocketError('Missing salts', this.session.username)
    if (!this.seedString) this.seedString = seedString

    const seed = base64.decode(seedString)
    const masterKey = await crypto.hkdf.importHkdfKey(seed)

    const salts = this.keys.salts
    this.keys.encryptionKey = await crypto.aesGcm.importKeyFromMaster(masterKey, base64.decode(salts.encryptionKeySalt))
    this.keys.dhPrivateKey = await crypto.diffieHellman.importKeyFromMaster(masterKey, base64.decode(salts.dhKeySalt))
    this.keys.hmacKey = await crypto.hmac.importKeyFromMaster(masterKey, base64.decode(salts.hmacKeySalt))

    await this.validateKey()

    this.keys.init = true

    this.resolveConnection()
    this.connectionResolved = true
  }

  async validateKey() {
    const sharedKey = await crypto.diffieHellman.getSharedKeyWithServer(this.keys.dhPrivateKey)

    const validationMessage = base64.encode(await crypto.aesGcm.decrypt(sharedKey, this.encryptedValidationMessage))

    const action = 'ValidateKey'
    const params = { validationMessage }

    await this.request(action, params)
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
      if (e.status === statusCodes['Too Many Requests']) throw new errors.TooManyRequests(e.data.retryDelay)
      else throw new RequestFailed(action, e)
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

  async buildBundle(database) {
    const bundle = {
      items: database.items,
      itemsIndex: database.itemsIndex.array
    }
    const plaintextString = JSON.stringify(bundle)

    const dbId = database.dbId
    const lastSeqNo = database.lastSeqNo
    const dbKey = database.dbKey

    const itemKeyPromises = []
    for (let i = 0; i < bundle.itemsIndex.length; i++) {
      const itemId = bundle.itemsIndex[i].itemId
      itemKeyPromises.push(crypto.hmac.signString(this.keys.hmacKey, itemId))
    }
    const itemKeys = await Promise.all(itemKeyPromises)

    const compressedString = LZString.compress(plaintextString)
    const base64Bundle = await crypto.aesGcm.encryptString(dbKey, compressedString)

    const action = 'Bundle'
    const params = { dbId, seqNo: lastSeqNo, bundle: base64Bundle, keys: itemKeys }
    this.request(action, params)
  }
}

export default new Connection()
