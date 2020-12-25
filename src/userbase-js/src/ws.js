import base64 from 'base64-arraybuffer'
import uuidv4 from 'uuid/v4'
import LZString from 'lz-string'
import localData from './localData'
import crypto from './Crypto'
import { getWsUrl } from './utils'
import statusCodes from './statusCodes'
import config from './config'
import errors from './errors'
import { appendBuffers, arrayBufferToString, stringToArrayBuffer } from './Crypto/utils'

const wsAlreadyConnected = 'Web Socket already connected'

const BACKOFF_RETRY_DELAY = 1000
const MAX_RETRY_DELAY = 1000 * 30

const BUNDLE_CHUNK_SIZE = 1024 * 512 // 512kb
const BUNDLE_CHUNKS_PER_BATCH = 10

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

  init(resolveConnection, rejectConnection, session, seedString, rememberMe, changePassword, state, encryptionMode) {
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
      creationDate: session && session.creationDate,
      expirationDate: session && session.expirationDate,
      userId: session && session.userId,
      authToken: session && session.authToken,
    }

    this.seedString = seedString
    this.changePassword = changePassword
    this.keys = {
      init: false,
      salts: {}
    }

    this.userData = {
      stripeData: {}
    }

    this.rememberMe = rememberMe

    this.requests = {}

    this.state = state || {
      dbNameToHash: {},
      databases: {}, // used when openDatabase is called with databaseName
      databasesByDbId: {}, // used when openDatabase is called with databaseId
      shareTokenIdToDbId: {}, // used when openDatabase is called with shareToken
    }

    this.encryptionMode = encryptionMode
  }

  connect(session, seedString = null, rememberMe, changePassword, reconnectDelay, state) {
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

      const url = `${getWsUrl(config.getEndpoint())}/api?appId=${config.getAppId()}&sessionId=${session.sessionId}&clientId=${clientId}&userbaseJsVersion=${config.USERBASE_JS_VERSION}`

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
              const { encryptionMode } = message
              this.init(resolve, reject, session, seedString, rememberMe, changePassword, state, encryptionMode)
              this.ws = ws
              this.heartbeat()
              this.connected = true

              // seedString not present on initial connection when still need to change password
              if (seedString) {
                const {
                  keySalts,
                  validationMessage,
                  ecKeyData,
                  encryptedValidationMessage,
                } = message

                this.keys.salts = keySalts

                this.validationMessage = validationMessage
                this.ecKeyData = ecKeyData

                // provided by userbase-server for users who have not yet generated their ECDSA key and
                // still only have a DH key
                if (encryptedValidationMessage) this.encryptedValidationMessage = new Uint8Array(encryptedValidationMessage.data)

                try {
                  await this.setKeys(this.seedString)
                  const userData = await this.validateKey()
                  this.userData = userData
                } catch (e) {
                  if ((e && e.name === 'OperationError') || e instanceof DOMException) throw new Error('Invalid seed')
                  else throw e
                }

                this.keys.init = true
              }

              this.resolveConnection()
              this.connectionResolved = true
              break
            }

            case 'ApplyTransactions': {
              const dbId = message.dbId
              const dbNameHash = message.dbNameHash

              // if owner, must have opened the database via databaseName
              const database = message.isOwner
                ? this.state.databases[dbNameHash]
                : this.state.databasesByDbId[dbId]

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

              const openingDatabase = (message.dbNameHash && (message.dbKey || message.plaintextDbKey)) || message.shareTokenEncryptedDbKey
              if (openingDatabase && (!database.dbKeyString || !database.dbKey)) {
                const dbKeyString = message.plaintextDbKey || (message.dbKey
                  ? await crypto.aesGcm.decryptString(this.keys.encryptionKey, message.dbKey)
                  : await database.decryptShareTokenEncryptedDbKey(message.shareTokenEncryptedDbKey, message.shareTokenEncryptionKeySalt)
                )
                database.dbKeyString = dbKeyString
                database.dbKey = await crypto.aesGcm.getKeyFromKeyString(dbKeyString)
              }

              if (!database.dbKey) throw new Error('Missing db key')

              if (message.writers) {
                database.attributionEnabled = true
                for (const { userId, username } of message.writers) {
                  database.usernamesByUserId.set(userId, username)
                }
              }

              // server is sending bundle in chunks, wait until it sends the entire bundle and client applies it
              if (message.waitForFullBundle) {
                if (!database.finishedWaitingForBundle) {
                  await new Promise(resolve => database.finishedWaitingForBundle = resolve)
                }

                // rebuild bundle from the chunks
                const bundle = await this.rebuildBundle(database, message.bundleSeqNo)
                await database.applyBundle(bundle, message.bundleSeqNo)

              } else if (message.bundle) {
                // legacy clients receiving the large bundle from server
                const bundleSeqNo = message.bundleSeqNo
                const base64Bundle = message.bundle
                const compressedString = await crypto.aesGcm.decryptString(database.dbKey, base64Bundle)
                const plaintextString = LZString.decompress(compressedString)
                const bundle = JSON.parse(plaintextString)

                await database.applyBundle(bundle, bundleSeqNo)
              }

              const newTransactions = message.transactionLog
              await database.applyTransactions(newTransactions, message.ownerId)

              if (!database.init) {
                database.dbId = dbId
                database.dbNameHash = dbNameHash
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

            case 'DownloadBundleChunk': {
              const { dbId, dbNameHash, isOwner, bundleSeqNo, isFirstChunk, isFinalChunk, chunk } = message

              // if owner, must have opened the database via databaseName
              const database = isOwner
                ? this.state.databases[dbNameHash]
                : this.state.databasesByDbId[dbId]

              if (!database) throw new Error('Missing database')

              if (isFirstChunk) database.bundleChunks[bundleSeqNo] = []

              database.bundleChunks[bundleSeqNo].push(chunk)

              if (isFinalChunk) {
                if (database.finishedWaitingForBundle) database.finishedWaitingForBundle()
                else database.finishedWaitingForBundle = true
              }

              break
            }

            case 'UpdatedUser': {
              this.handleUpdateUser(message.updatedUser)
              break
            }

            case 'SignOut':
            case 'UpdateUser':
            case 'DeleteUser':
            case 'CreateDatabase':
            case 'OpenDatabase':
            case 'OpenDatabaseByDatabaseId':
            case 'GetDatabases':
            case 'GetDatabaseUsers':
            case 'Insert':
            case 'Update':
            case 'Delete':
            case 'BatchTransaction':
            case 'UploadBundleChunk':
            case 'CompleteBundleUpload':
            case 'GenerateFileId':
            case 'UploadFileChunk':
            case 'CompleteFileUpload':
            case 'GetChunk':
            case 'ValidateKey':
            case 'GetPasswordSalts':
            case 'PurchaseSubscription':
            case 'CancelSubscription':
            case 'ResumeSubscription':
            case 'UpdatePaymentMethod':
            case 'ShareDatabase':
            case 'ShareDatabaseToken':
            case 'AuthenticateShareToken':
            case 'SaveDatabase':
            case 'ModifyDatabasePermissions':
            case 'VerifyUser':
              {
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
          await this.reconnect(resolve, reject, session, this.seedString || seedString, rememberMe, changePassword, delay, !this.reconnected && state)
        } else if (e.code === statusCodes['Client Already Connected']) {
          reject(new WebSocketError(wsAlreadyConnected, session.username))
        } else {
          this.init()
        }
      }
    })
  }

  async reconnect(resolveConnection, rejectConnection, session, seedString, rememberMe, changePassword, reconnectDelay, currentState) {
    try {
      const retryDelay = Math.min(reconnectDelay, MAX_RETRY_DELAY)
      console.log(`Connection to server lost. Attempting to reconnect in ${retryDelay / 1000} second${retryDelay !== 1000 ? 's' : ''}...`)

      const dbsToReopen = []
      const dbsToReopenById = []

      // as soon as one reconnect succeeds, resolves all the way up the stack and all reconnects succeed
      resolveConnection(await new Promise((resolve, reject) => setTimeout(
        async () => {
          try {
            // get copy of currently opened databases' memory references to reopen WebSocket with same databases
            const state = currentState || {
              dbNameToHash: { ...this.state.dbNameToHash },
              databases: { ...this.state.databases },
              databasesByDbId: { ...this.state.databasesByDbId },
              shareTokenIdToDbId: { ...this.state.shareTokenIdToDbId },
            }

            // mark databases as uninitialized to prevent client from using them until they are reopened
            for (const dbNameHash in state.databases) {
              state.databases[dbNameHash].init = false
              state.databases[dbNameHash].finishedWaitingForBundle = false
              dbsToReopen.push(dbNameHash)
            }

            for (const dbId in state.databasesByDbId) {
              state.databasesByDbId[dbId].init = false
              state.databasesByDbId[dbId].finishedWaitingForBundle = false
              dbsToReopenById.push(dbId)
            }

            this.init()
            this.reconnecting = true

            const result = await this.connect(session, seedString, rememberMe, changePassword, reconnectDelay, state)

            this.reconnected = true

            // only reopen databases on the first call to reconnect()
            if (!currentState) await this.reopenDatabases(dbsToReopen, dbsToReopenById, 1000)

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

  async reopenDatabases(dbsToReopen, dbsToReopenById, retryDelay) {
    try {
      const openDatabasePromises = []

      // open databases by database name hash
      for (const dbNameHash of dbsToReopen) {
        const database = this.state.databases[dbNameHash]

        if (!database.init) {
          const action = 'OpenDatabase'
          const params = { dbNameHash, reopenAtSeqNo: database.lastSeqNo }
          openDatabasePromises.push(this.request(action, params))
        }
      }

      // open databases by database ID
      for (const databaseId of dbsToReopenById) {
        const database = this.state.databasesByDbId[databaseId]

        if (!database.init) {
          const shareTokenHkdfKey = database.shareTokenHkdfKey

          // if opened with shareToken, need to reauthenticate it
          const shareTokenAuthData = shareTokenHkdfKey
            ? await this.authenticateShareToken(database.shareTokenId, shareTokenHkdfKey)
            : {}

          const action = 'OpenDatabaseByDatabaseId'
          const params = { databaseId, reopenAtSeqNo: database.lastSeqNo, ...shareTokenAuthData }
          openDatabasePromises.push(this.request(action, params))
        }
      }

      await Promise.all(openDatabasePromises)
    } catch (e) {

      // keep attempting to reopen on failure
      await new Promise(resolve => setTimeout(
        async () => {
          await this.reopenDatabases(dbsToReopen, dbsToReopenById, retryDelay + BACKOFF_RETRY_DELAY)
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
    this.keys.hmacKey = await crypto.hmac.importKeyFromMaster(masterKey, base64.decode(salts.hmacKeySalt))

    if (salts.ecdsaKeyEncryptionKeySalt) {
      const ecdsaKeyEncryptionKey = await crypto.ecdsa.importEcdsaKeyEncryptionKeyFromMaster(masterKey, base64.decode(salts.ecdsaKeyEncryptionKeySalt))
      const encryptedEcdsaPrivateKey = base64.decode(this.ecKeyData.encryptedEcdsaPrivateKey)
      const rawEcdsaPrivateKey = await crypto.aesGcm.decrypt(ecdsaKeyEncryptionKey, encryptedEcdsaPrivateKey)
      this.keys.ecdsaPrivateKey = await crypto.ecdsa.getPrivateKeyFromRawPrivateKey(rawEcdsaPrivateKey)

      const ecdhKeyEncryptionKey = await crypto.ecdh.importEcdhKeyEncryptionKeyFromMaster(masterKey, base64.decode(salts.ecdhKeyEncryptionKeySalt))
      const encryptedEcdhPrivateKey = base64.decode(this.ecKeyData.encryptedEcdhPrivateKey)
      const rawEcdhPrivateKey = await crypto.aesGcm.decrypt(ecdhKeyEncryptionKey, encryptedEcdhPrivateKey)
      this.keys.ecdhPrivateKey = await crypto.ecdh.getPrivateKeyFromRawPrivateKey(rawEcdhPrivateKey)
    } else if (salts.dhKeySalt) {

      // must be an old user created with userbase-js < v2.0.0. Need to prove access to DH key to server
      this.keys.dhPrivateKey = await crypto.diffieHellman.importKeyFromMaster(masterKey, base64.decode(salts.dhKeySalt))
    }

    if (salts.dhKeySalt || salts.ecdsaKeyWrapperSalt) {

      // must be an old user created with userbase-js <= v2.0.0. Update EC key data for future logins
      const ecdsaKeyData = await crypto.ecdsa.generateEcdsaKeyData(masterKey)
      const ecdhKeyData = await crypto.ecdh.generateEcdhKeyData(masterKey, ecdsaKeyData.ecdsaPrivateKey)

      this.keys.ecdsaPrivateKey = ecdsaKeyData.ecdsaPrivateKey
      this.keys.ecdhPrivateKey = ecdhKeyData.ecdhPrivateKey

      delete ecdsaKeyData.ecdsaPrivateKey
      delete ecdhKeyData.ecdhPrivateKey

      this.newEcKeyData = {
        ecdsaKeyData,
        ecdhKeyData,
      }
    }
  }

  async validateKey() {
    let validationMessage
    if (this.keys.ecdsaPrivateKey && !this.keys.dhPrivateKey) {

      // need to sign the validation message with ECDSA private key
      validationMessage = await crypto.ecdsa.sign(this.keys.ecdsaPrivateKey, base64.decode(this.validationMessage))

    } else if (this.keys.dhPrivateKey) {

      // need to decrypt the encrypted validation emssage with DH shared key
      const sharedKey = await crypto.diffieHellman.getSharedKeyWithServer(this.keys.dhPrivateKey)
      validationMessage = await crypto.aesGcm.decrypt(sharedKey, this.encryptedValidationMessage)

      delete this.keys.dhPrivateKey
    }

    const action = 'ValidateKey'
    const params = {
      validationMessage: base64.encode(validationMessage),
      ecKeyData: this.newEcKeyData
    }

    const response = await this.request(action, params)
    const userData = response.data
    return userData
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

      setTimeout(() => { reject(new Error('timeout')) }, 20000)
    })

    delete this.requests[requestId]
    return response
  }

  async rebuildBundle(database, bundleSeqNo) {
    const bundleChunks = []
    for (let i = 0; i < database.bundleChunks[bundleSeqNo].length; i++) {
      const chunk = database.bundleChunks[bundleSeqNo][i]
      const chunkArrayBuffer = stringToArrayBuffer(chunk)
      bundleChunks.push(chunkArrayBuffer)
    }

    const bundleArrayBuffer = appendBuffers(bundleChunks).buffer
    const compressedArrayBuffer = await crypto.aesGcm.decrypt(database.dbKey, bundleArrayBuffer)
    const compressedString = arrayBufferToString(compressedArrayBuffer)
    const bundle = LZString.decompress(compressedString)

    delete bundleChunks[bundleSeqNo]

    return JSON.parse(bundle)
  }

  async uploadBundle(dbId, seqNo, bundleArrayBuffer) {
    let position = 0
    let chunkNumber = 0
    let batch = [] // will use this to send chunks to server in batches of BUNDLE_CHUNKS_PER_BATCH

    while (position < bundleArrayBuffer.byteLength) {
      // read a chunk at a time to keep memory overhead low
      const chunkArrayBuffer = bundleArrayBuffer.slice(position, position + BUNDLE_CHUNK_SIZE)
      const chunk = arrayBufferToString(chunkArrayBuffer)

      const action = 'UploadBundleChunk'
      const params = { dbId, seqNo, chunkNumber, chunk }
      batch.push(this.request(action, params))

      if (batch.length === BUNDLE_CHUNKS_PER_BATCH) {
        await Promise.all(batch)
        batch = []
      }

      chunkNumber += 1
      position += BUNDLE_CHUNK_SIZE
    }

    await Promise.all(batch)

    return chunkNumber
  }

  async buildBundle(database) {
    const dbId = database.dbId
    const lastSeqNo = database.lastSeqNo
    const dbKey = database.dbKey

    // Client will only attempt to bundle at a particular seqNo a single time. This prevents server from spamming
    // client with buildBundle to maliciously get the client to re-use an IV in AES-GCM and reveal the dbKey
    if (database.bundledAtSeqNo && database.bundledAtSeqNo >= lastSeqNo) return
    else database.bundledAtSeqNo = lastSeqNo

    const bundle = {
      items: database.items,
      itemsIndex: database.itemsIndex.array
    }
    const writers = database.attributionEnabled
      ? [...database.usernamesByUserId.keys()].join(',')
      : undefined

    const plaintextString = JSON.stringify(bundle)

    const itemKeyPromises = []
    for (let i = 0; i < bundle.itemsIndex.length; i++) {
      const itemId = bundle.itemsIndex[i].itemId
      itemKeyPromises.push(crypto.hmac.signString(this.keys.hmacKey, itemId))
    }
    const itemKeys = await Promise.all(itemKeyPromises)

    const compressedString = LZString.compress(plaintextString)
    const compressedArrayBuffer = stringToArrayBuffer(compressedString)
    const bundleArrayBuffer = await crypto.aesGcm.encrypt(dbKey, compressedArrayBuffer)

    const numChunks = await this.uploadBundle(dbId, lastSeqNo, bundleArrayBuffer)

    const action = 'CompleteBundleUpload'
    const params = { dbId, seqNo: lastSeqNo, keys: itemKeys, writers, numChunks }
    await this.request(action, params)
  }

  buildUserResult({ username, userId, authToken, email, profile, protectedProfile, usedTempPassword, changePassword, passwordChanged, userData }) {
    const result = { username, userId, authToken }

    if (email) result.email = email
    if (profile) result.profile = profile
    if (protectedProfile) result.protectedProfile = protectedProfile
    if (usedTempPassword) result.usedTempPassword = usedTempPassword
    if (changePassword) result.changePassword = changePassword
    if (passwordChanged) result.passwordChanged = passwordChanged

    if (userData) {
      const { creationDate, stripeData } = userData
      if (creationDate) result.creationDate = creationDate

      if (stripeData) {
        const { paymentsMode, subscriptionStatus, cancelSubscriptionAt, trialExpirationDate } = stripeData

        if (paymentsMode) result.paymentsMode = paymentsMode
        if (subscriptionStatus) result.subscriptionStatus = subscriptionStatus
        if (cancelSubscriptionAt) result.cancelSubscriptionAt = cancelSubscriptionAt
        if (trialExpirationDate) result.trialExpirationDate = trialExpirationDate
      }
    }

    return result
  }

  handleUpdateUser(updatedUser) {
    // make sure WebSocket session matches provided user
    if (this.session && this.session.userId === updatedUser['userId']) {
      this.session.username = updatedUser['username']
      this.userData = updatedUser.userData

      const updateUserHandler = config.getUpdateUserHandler()
      if (updateUserHandler) {
        updateUserHandler({ user: this.buildUserResult({ authToken: this.session.authToken, ...updatedUser }) })
      }
    }
  }

  async rotateKeys(newSeedString, newKeyData) {
    // re-arrange object to fit expected structure for setKeys() function
    const { keySalts, ecKeyData } = newKeyData
    const { ecdsaKeyData, ecdhKeyData } = ecKeyData
    keySalts.ecdsaKeyEncryptionKeySalt = ecdsaKeyData.ecdsaKeyEncryptionKeySalt
    keySalts.ecdhKeyEncryptionKeySalt = ecdhKeyData.ecdhKeyEncryptionKeySalt

    this.keys.salts = keySalts
    this.ecKeyData = { ...ecdsaKeyData, ...ecdhKeyData }

    await this.setKeys(newSeedString)

    this.keys.init = true
  }

  async authenticateShareToken(shareTokenId, shareTokenHkdfKey) {
    // retrieve shareToken auth key data in order to prove access to shareToken to server
    const action = 'AuthenticateShareToken'
    const params = { shareTokenId }

    let response
    try {
      response = await this.request(action, params)
    } catch (e) {
      if (e.response && e.response.data === 'ShareTokenNotFound') throw new errors.ShareTokenNotFound
      throw e
    }
    const { databaseId, shareTokenAuthKeyData, validationMessage } = response.data

    // decrypt ECDSA private key. if it fails, not using the correct shareToken
    let shareTokenEcdsaPrivateKey
    try {
      const shareTokenEcdsaKeyEncryptionKeySalt = base64.decode(shareTokenAuthKeyData.shareTokenEcdsaKeyEncryptionKeySalt)
      const shareTokenEcdsaKeyEncryptionKey = await crypto.ecdsa.importEcdsaKeyEncryptionKeyFromMaster(shareTokenHkdfKey, shareTokenEcdsaKeyEncryptionKeySalt)
      const shareTokenEncryptedEcdsaPrivateKey = base64.decode(shareTokenAuthKeyData.shareTokenEncryptedEcdsaPrivateKey)
      const shareTokenEcdsaPrivateKeyRaw = await crypto.aesGcm.decrypt(shareTokenEcdsaKeyEncryptionKey, shareTokenEncryptedEcdsaPrivateKey)
      shareTokenEcdsaPrivateKey = await crypto.ecdsa.getPrivateKeyFromRawPrivateKey(shareTokenEcdsaPrivateKeyRaw)
    } catch {
      throw new errors.ShareTokenInvalid
    }

    // sign validation message sent by the server
    const signedValidationMessage = await crypto.ecdsa.sign(shareTokenEcdsaPrivateKey, base64.decode(validationMessage))
    return { databaseId, validationMessage, signedValidationMessage: base64.encode(signedValidationMessage) }
  }
}

export default new Connection()
