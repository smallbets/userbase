import base64 from 'base64-arraybuffer'
import uuidv4 from 'uuid/v4'
import LZString from 'lz-string'
import localData from './localData'
import crypto from './Crypto'
import { removeProtocolFromEndpoint, getProtocolFromEndpoint } from './utils'
import statusCodes from './statusCodes'
import config from './config'
import errors from './errors'

const wsAlreadyConnected = 'Web Socket already connected'

class RequestFailed extends Error {
  constructor(action, response, ...params) {
    super(...params)

    this.name = `RequestFailed: ${action}`
    this.message = response.message || response.data || 'Error'
    this.status = response.status || (response.message === 'timeout' && statusCodes['Gateway Timeout'])
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

  init(resolveConnection, rejectConnection, username, sessionId, seedString, rememberMe) {
    for (const property of Object.keys(this)) {
      delete this[property]
    }

    this.ws = null
    this.connected = false

    this.resolveConnection = resolveConnection
    this.rejectConnection = rejectConnection
    this.connectionResolved = false

    this.username = username
    this.sessionId = sessionId

    this.seedString = seedString
    this.keys = {
      init: false,
      salts: {}
    }

    this.rememberMe = rememberMe

    this.requests = {}

    this.seedRequest = null

    this.processingSeedRequest = {}
    this.sentSeedTo = {}

    this.state = {
      databases: {},
      dbIdToHash: {},
      dbNameToHash: {}
    }
  }

  connect(appId, sessionId, username, seedString = null, rememberMe = false) {
    if (this.connected) throw new WebSocketError(wsAlreadyConnected, this.username)

    return new Promise((resolve, reject) => {
      let timeout = false

      setTimeout(
        () => {
          if (!this.connected) {
            timeout = true
            this.close()
            reject(new WebSocketError('timeout'))
          }
        },
        10000
      )

      const host = removeProtocolFromEndpoint(config.getEndpoint())
      const protocol = getProtocolFromEndpoint(config.getEndpoint())
      const url = ((protocol === 'https') ?
        'wss://' : 'ws://') + `${host}/api?appId=${appId}&sessionId=${sessionId}`

      const ws = new WebSocket(url)

      ws.onopen = async () => {
        if (timeout) return

        if (this.connected) {
          this.close()
          reject(new WebSocketError(wsAlreadyConnected, username))
          return
        }

        this.init(resolve, reject, username, sessionId, seedString, rememberMe)
        this.ws = ws

        if (!seedString) {
          await this.requestSeed(username)
        }
      }

      ws.onmessage = async (e) => {
        if (timeout) return

        try {
          await this.handleMessage(JSON.parse(e.data))
        } catch (e) {
          if (!this.connectionResolved) {
            this.close()
            reject(new WebSocketError(e.message, username))
          } else {
            console.warn('Error handling message: ', e)
          }
        }
      }

      ws.onerror = () => {
        if (!this.connected) {
          reject(new WebSocketError('WebSocket error'))
        }
        this.close()
      }

      ws.onclose = () => {
        this.init()
      }
    })
  }

  async handleMessage(message) {
    const route = message.route
    switch (route) {
      case 'Connection': {
        this.connected = true

        const {
          salts,
          encryptedValidationMessage
        } = message

        this.keys.salts = salts
        this.encryptedValidationMessage = new Uint8Array(encryptedValidationMessage.data)

        if (this.seedString) {
          await this.setKeys(this.seedString)
        }

        break
      }

      case 'ApplyTransactions': {
        const dbId = message.dbId
        const dbNameHash = message.dbNameHash || this.state.dbIdToHash[dbId]
        const database = this.state.databases[dbNameHash]

        if (!database) return

        const openingDatabase = message.dbNameHash && message.dbKey
        if (openingDatabase) {
          const dbKeyString = await crypto.aesGcm.decryptString(this.keys.encryptionKey, message.dbKey)
          database.dbKeyString = dbKeyString
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

      case 'ReceiveRequestForSeed': {
        if (!this.keys.init) return

        const requesterPublicKey = message.requesterPublicKey
        this.sendSeed(requesterPublicKey)

        break
      }

      case 'ReceiveSeed': {
        const { encryptedSeed, senderPublicKey } = message
        const { seedRequestPrivateKey } = this.seedRequest

        await this.receiveSeed(
          encryptedSeed,
          senderPublicKey,
          seedRequestPrivateKey
        )

        break
      }

      case 'SignOut':
      case 'UpdateUser':
      case 'CreateDatabase':
      case 'GetDatabase':
      case 'OpenDatabase':
      case 'FindDatabases':
      case 'Insert':
      case 'Update':
      case 'Delete':
      case 'BatchTransaction':
      case 'Bundle':
      case 'ValidateKey':
      case 'RequestSeed':
      case 'GetRequestsForSeed':
      case 'SendSeed':
      case 'GetPublicKey':
      case 'GrantDatabaseAccess':
      case 'GetDatabaseAccessGrants':
      case 'AcceptDatabaseAccess': {
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
  }

  close() {
    this.ws
      ? this.ws.close()
      : this.init()
  }

  async signOut() {
    const username = this.username
    const connectionResolved = this.connectionResolved
    const rejectConnection = this.rejectConnection

    try {
      if (this.rememberMe) localData.signOutSession(username)

      const sessionId = this.sessionId

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
    if (!seedString) throw new WebSocketError('Missing seed', this.username)
    if (!this.keys.salts) throw new WebSocketError('Missing salts', this.username)
    if (!this.seedString) this.seedString = seedString

    const seed = base64.decode(seedString)
    const masterKey = await crypto.hkdf.importMasterKey(seed)

    const salts = this.keys.salts
    this.keys.encryptionKey = await crypto.aesGcm.importKeyFromMaster(masterKey, base64.decode(salts.encryptionKeySalt))
    this.keys.dhPrivateKey = await crypto.diffieHellman.importKeyFromMaster(masterKey, base64.decode(salts.dhKeySalt))
    this.keys.hmacKey = await crypto.hmac.importKeyFromMaster(masterKey, base64.decode(salts.hmacKeySalt))

    await this.validateKey()

    this.keys.init = true

    this.resolveConnection(seedString)
    this.connectionResolved = true
    if (this.hideSeedRequestModal) this.hideSeedRequestModal()
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
    } catch (response) {
      // process any errors and re-throw them
      throw new RequestFailed(action, response)
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

  async requestSeed(username) {
    const seedRequest = localData.getSeedRequest(username) || await this.buildSeedRequest(username)
    this.seedRequest = seedRequest

    const {
      seedRequestPrivateKey,
      seedRequestPublicKey
    } = seedRequest

    const action = 'RequestSeed'
    const params = { requesterPublicKey: seedRequestPublicKey }
    const requestSeedResponse = await this.request(action, params)

    const { encryptedSeed, senderPublicKey } = requestSeedResponse.data
    if (encryptedSeed && senderPublicKey) {
      await this.receiveSeed(encryptedSeed, senderPublicKey, seedRequestPrivateKey)
    } else {
      await this.inputSeedManually(username, seedRequestPublicKey)
    }
  }

  async buildSeedRequest(username) {
    // this could be random bytes -- it's not used to encrypt/decrypt anything, only to generate DH
    const seedRequestPrivateKey = await crypto.aesGcm.getKeyStringFromKey(await crypto.aesGcm.generateKey())
    const publicKey = crypto.diffieHellman.getPublicKey(seedRequestPrivateKey)
    const seedRequestPublicKey = base64.encode(publicKey)

    if (this.rememberMe) localData.setSeedRequest(username, seedRequestPrivateKey, seedRequestPublicKey)

    return { seedRequestPrivateKey, seedRequestPublicKey }
  }

  async inputSeedManually(username, seedRequestPublicKey) {
    const deviceId = await crypto.sha256.hashBase64String(seedRequestPublicKey)

    const keyNotFoundHandler = config.getKeyNotFoundHandler()
    if (keyNotFoundHandler) {
      keyNotFoundHandler(username, deviceId)
    } else {
      this.displaySeedRequestModal(username, deviceId)
    }
  }

  displaySeedRequestModal(username, deviceId) {
    const seedRequestModal = document.createElement('div')
    seedRequestModal.className = 'userbase-modal'

    seedRequestModal.innerHTML = `
      <div class='userbase-container'>

        <div>
          <div
            id='userbase-request-key-modal-close-button'
            class='fas userbase-fa-times-circle'
          />
        </div>

        <form id='userbase-request-key-form'>

          <p id='userbase-request-key-form-first-line'>
            Whoops! We need your secret key to sign in.
          </p>

          <div class='userbase-text-line'>
            Sign in from a device you used before to send the secret key to this device.
          </div>

          <div class='userbase-text-line'>
            Before sending, please verify the Device ID matches:
          </div>

          <div class='userbase-display-key'>
            ${deviceId}
          </div>

          <div>
            <div class='userbase-loader-wrapper'>
              <div class='userbase-loader' />
            </div>
          </div>

          <div class='userbase-text-line'>
            You can also manually enter the secret key below. You received your secret key when you created your account.
          </div>

          <div id='userbase-manual-input-key-form'>

            <div id='userbase-manual-input-key-outer-wrapper'>
              <div class='userbase-manual-input-key-inner-wrapper'>
                <input
                  id='userbase-secret-key-input'
                  type='text'
                  autoComplete='off'
                  placeholder='Paste your secret key here'
                />
              </div>
            </div>
          </div>

          <div id='userbase-submit-wrapper'>
            <div id='userbase-submit-inner-wrapper'>
              <input
                class='userbase-button'
                type='submit'
                value='Save'
              />
              <div id='userbase-request-key-form-error' class='userbase-error'>
              </div>
            </div>
          </div>

        </form>
      </div>
    `

    document.body.appendChild(seedRequestModal)

    const closeButton = document.getElementById('userbase-request-key-modal-close-button')
    const keyInput = document.getElementById('userbase-secret-key-input')
    const keyInputForm = document.getElementById('userbase-request-key-form')
    const keyFormError = document.getElementById('userbase-request-key-form-error')

    async function inputSeed(e) {
      e.preventDefault()

      const seedString = keyInput.value
      if (!seedString) return

      try {
        await this.saveSeed(seedString)
        hideSeedRequestModal()
      } catch (e) {
        keyFormError.innerText = e.message
      }
    }

    async function closeModal() {
      try {
        await this.signOut()
        hideSeedRequestModal()
      } catch (e) {
        keyFormError.innerText = e.message
      }
    }

    function hideSeedRequestModal() {
      document.body.removeChild(seedRequestModal)
    }

    keyInputForm.onsubmit = inputSeed.bind(this)
    closeButton.onclick = closeModal.bind(this)
    this.hideSeedRequestModal = hideSeedRequestModal
  }

  async getRequestsForSeed() {
    if (!this.keys.init) return

    const response = await this.request('GetRequestsForSeed')

    const seedRequests = response.data.seedRequests

    for (const seedRequest of seedRequests) {
      const requesterPublicKey = seedRequest['requester-public-key']

      this.sendSeed(requesterPublicKey)
    }
  }

  async grantDatabaseAccess(database, username, granteePublicKey, readOnly) {
    const granteePublicKeyArrayBuffer = new Uint8Array(base64.decode(granteePublicKey))
    const granteePublicKeyHash = base64.encode(await crypto.sha256.hash(granteePublicKeyArrayBuffer))

    if (window.confirm(`Grant access to user '${username}' with public key:\n\n${granteePublicKeyHash}\n`)) {
      const sharedKey = await crypto.diffieHellman.getSharedKey(
        this.keys.dhPrivateKey,
        granteePublicKeyArrayBuffer
      )

      const encryptedAccessKey = await crypto.aesGcm.encryptString(sharedKey, database.dbKeyString)

      const action = 'GrantDatabaseAccess'
      const params = { username, dbId: database.dbId, encryptedAccessKey, readOnly }
      await this.request(action, params)
    }
  }

  async getDatabaseAccessGrants() {
    if (!this.keys.init) return

    const response = await this.request('GetDatabaseAccessGrants')
    const databaseAccessGrants = response.data

    for (const grant of databaseAccessGrants) {
      const { dbId, ownerPublicKey, encryptedAccessKey, encryptedDbName, owner } = grant

      try {
        const ownerPublicKeyArrayBuffer = new Uint8Array(base64.decode(ownerPublicKey))

        const sharedKey = await crypto.diffieHellman.getSharedKey(
          this.keys.dhPrivateKey,
          ownerPublicKeyArrayBuffer
        )

        const dbKeyString = await crypto.aesGcm.decryptString(sharedKey, encryptedAccessKey)
        const dbKey = await crypto.aesGcm.getKeyFromKeyString(dbKeyString)

        const dbName = await crypto.aesGcm.decryptString(dbKey, encryptedDbName)

        const ownerPublicKeyHash = base64.encode(await crypto.sha256.hash(ownerPublicKeyArrayBuffer))
        if (window.confirm(`Accept access to database '${dbName}' from '${owner}' with public key: \n\n${ownerPublicKeyHash}\n`)) {
          await this.acceptDatabaseAccessGrant(dbId, dbKeyString, dbName, encryptedDbName)
        }

      } catch (e) {
        // continue
        console.log(`Error processing database access grants`, e)
      }
    }
  }

  async acceptDatabaseAccessGrant(dbId, dbKeyString, dbName, encryptedDbName) {
    if (!this.keys.init) return

    const dbNameHash = await crypto.hmac.signString(this.keys.hmacKey, dbName)
    const encryptedDbKey = await crypto.aesGcm.encryptString(this.keys.encryptionKey, dbKeyString)

    const action = 'AcceptDatabaseAccess'
    const params = { dbId, encryptedDbKey, dbNameHash, encryptedDbName }

    await this.request(action, params)
  }

  async sendSeed(requesterPublicKey) {
    const requesterPublicKeyArrayBuffer = new Uint8Array(base64.decode(requesterPublicKey))
    const requesterDeviceId = base64.encode(await crypto.sha256.hash(requesterPublicKeyArrayBuffer))

    if (this.sentSeedTo[requesterDeviceId] || this.processingSeedRequest[requesterDeviceId]) return

    this.processingSeedRequest[requesterDeviceId] = true

    if (window.confirm(`Send the secret key to device with Device ID: \n\n${requesterDeviceId}\n`)) {
      try {
        const sharedKey = await crypto.diffieHellman.getSharedKey(
          this.keys.dhPrivateKey,
          requesterPublicKeyArrayBuffer
        )

        const encryptedSeed = await crypto.aesGcm.encryptString(sharedKey, this.seedString)

        const action = 'SendSeed'
        const params = { requesterPublicKey, encryptedSeed }

        await this.request(action, params)
        this.sentSeedTo[requesterDeviceId] = true
      } catch (e) {
        console.warn(e)
      }
    }
    delete this.processingSeedRequest[requesterDeviceId]
  }

  async receiveSeed(encryptedSeed, senderPublicKey, seedRequestPrivateKey) {
    const sharedKey = await crypto.diffieHellman.getSharedKey(
      seedRequestPrivateKey,
      new Uint8Array(base64.decode(senderPublicKey))
    )

    const seedString = await crypto.aesGcm.decryptString(sharedKey, encryptedSeed)

    await this.saveSeed(seedString)
  }

  async saveSeed(seedString) {
    const username = this.username

    if (this.rememberMe) localData.saveSeedString(username, seedString)

    try {
      await this.setKeys(seedString)
    } catch (e) {
      localData.removeSeedString(username)
      throw new errors.KeyNotValid(username)
    }
    localData.removeSeedRequest(username)
  }
}

export default new Connection()
