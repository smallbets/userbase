import uuidv4 from 'uuid/v4'
import api from './api'
import crypto from './Crypto'
import base64 from 'base64-arraybuffer'
import stateManager from './stateManager'

const _setCurrentSession = (username, signedIn) => {
  const session = { username, signedIn }
  const sessionString = JSON.stringify(session)
  localStorage.setItem('currentSession', sessionString)
  return session
}

const getCurrentSession = () => {
  const currentSessionString = localStorage.getItem('currentSession')
  const currentSession = JSON.parse(currentSessionString)
  return currentSession
}

const saveKeyToLocalStorage = async (username, key) => {
  const keyString = await crypto.aesGcm.getKeyStringFromKey(key)
  localStorage.setItem('key.' + username, keyString)
}

const getKeyFromLocalStorage = async () => {
  const currentSession = getCurrentSession()
  if (!currentSession) {
    return undefined
  }

  const username = currentSession.username
  const keyString = localStorage.getItem('key.' + username)

  if (!keyString) {
    return undefined
  }

  const key = await crypto.aesGcm.getKeyFromKeyString(keyString)
  return key
}

const getRawKey = async () => {
  const key = await getKeyFromLocalStorage()
  if (!key) {
    return undefined
  }
  const rawKey = await crypto.aesGcm.exportRawKey(key)
  return rawKey
}

const getKey = async () => {
  const rawKey = await getRawKey()
  if (!rawKey) {
    return undefined
  }
  const base64Key = base64.encode(rawKey)
  return base64Key
}

const saveKey = async (base64Key) => {
  const rawKey = base64.decode(base64Key)
  const key = await crypto.aesGcm.importRawKey(rawKey)
  const currentSession = getCurrentSession()
  saveKeyToLocalStorage(currentSession.username, key)
}

const signUp = async (username, password) => {
  const lowerCaseUsername = username.toLowerCase()
  const userId = uuidv4()

  const aesKey = await crypto.aesGcm.generateKey()
  const rawAesKey = await crypto.aesGcm.exportRawKey(aesKey)
  const { publicKey, sharedSecret } = crypto.diffieHellman.getPublicKeyAndSharedSecretWithServer(rawAesKey)

  const [encryptedValidationMessage, sharedKey] = await Promise.all([
    api.auth.signUp(lowerCaseUsername, password, userId, publicKey),
    crypto.aesGcm.importRawKey(await crypto.sha256.hash(sharedSecret))
  ])

  const validationMessage = await crypto.aesGcm.decrypt(sharedKey, encryptedValidationMessage)

  // Saves to local storage before validation to ensure user has it.
  // Warning: if user hits the sign up button twice,
  // it's possible the key will be overwritten here and will be lost
  await saveKeyToLocalStorage(lowerCaseUsername, aesKey)

  await api.auth.validateKey(validationMessage)

  const signedIn = true
  const session = _setCurrentSession(lowerCaseUsername, signedIn)
  return session
}

const clearAuthenticatedDataFromBrowser = () => {
  stateManager.clearState()

  const currentSession = getCurrentSession()
  const signedIn = false
  return _setCurrentSession(currentSession.username, signedIn)
}

const signOut = async () => {
  const session = clearAuthenticatedDataFromBrowser()

  await api.auth.signOut()

  return session
}

const signIn = async (username, password) => {
  const lowerCaseUsername = username.toLowerCase()

  await api.auth.signIn(lowerCaseUsername, password)

  const rawMasterKey = await getRawKey()
  if (!rawMasterKey) await requestMasterKey(lowerCaseUsername)
  else await sendMasterKeyToRequesters(rawMasterKey)

  const signedIn = true
  const session = _setCurrentSession(lowerCaseUsername, signedIn)
  return session
}

const requestMasterKey = async (lowerCaseUsername) => {
  // this could be random bytes -- it's not used to encrypt/decrypt anything, only to generate DH
  const tempKeyToRequestMasterKey = await crypto.aesGcm.exportRawKey(await crypto.aesGcm.generateKey())
  const requesterPublicKey = await crypto.diffieHellman.getPublicKey(tempKeyToRequestMasterKey)

  const senderPublicKey = await api.auth.requestMasterKey(requesterPublicKey)

  let counter = 0
  const ATTEMPTS = 12
  const SECONDS_MS = 5000

  // polls every 5 seconds for 60 seconds
  const receiveMasterKeyPromise = new Promise(res => {
    const receiveMasterKey = async () => {
      if (counter < ATTEMPTS) {
        console.log(`Check ${counter} if master key received yet...`)

        try {
          if (counter === 0) alert('Sign in from a device that has the key to receive the master key!')

          const encryptedMasterKey = await api.auth.receiveMasterKey(requesterPublicKey)

          if (encryptedMasterKey) return res(encryptedMasterKey)
        } catch (e) {
          const notFound = e.response && e.response.status === 404
          if (!notFound) throw e // if not found, safe to try again. anything else, throw
        }

      } else {
        throw new Error(`Did not receive master key in ${ATTEMPTS * SECONDS_MS / 1000} seconds`)
      }

      counter += 1
      setTimeout(receiveMasterKey, SECONDS_MS)
    }

    receiveMasterKey()
  })

  const encryptedMasterKey = await receiveMasterKeyPromise

  const sharedSecret = crypto.diffieHellman.getSharedSecret(tempKeyToRequestMasterKey, senderPublicKey)
  const sharedRawKey = await crypto.sha256.hash(sharedSecret)
  const sharedKey = await crypto.aesGcm.importRawKey(sharedRawKey)

  const masterRawKey = await crypto.aesGcm.decrypt(sharedKey, encryptedMasterKey)
  const masterKey = await crypto.aesGcm.importRawKey(masterRawKey)

  await saveKeyToLocalStorage(lowerCaseUsername, masterKey)
}

const sendMasterKeyToRequesters = async (rawMasterKey) => {
  const masterKeyRequests = await api.auth.getMasterKeyRequests()

  if (masterKeyRequests.length) {

    const sharedRawKeyPromises = masterKeyRequests.map(masterKeyRequest => {
      const requesterPublicKey = new Uint8Array(masterKeyRequest['requester-public-key'].data)

      const sharedSecret = crypto.diffieHellman.getSharedSecret(rawMasterKey, requesterPublicKey)

      return crypto.sha256.hash(sharedSecret)
    })
    const sharedRawKeys = await Promise.all(sharedRawKeyPromises)

    const sharedKeyPromises = sharedRawKeys.map(rawKey => crypto.aesGcm.importRawKey(rawKey))
    const sharedKeys = await Promise.all(sharedKeyPromises)

    const encryptedMasterKeyPromises = sharedKeys.map(sharedKey => crypto.aesGcm.encrypt(sharedKey, rawMasterKey))
    const encryptedMasterKeys = await Promise.all(encryptedMasterKeyPromises)

    const sendMasterKeyPromises = encryptedMasterKeys.map((encryptedMasterKey, i) => {
      const requesterPublicKey = masterKeyRequests[i]['requester-public-key'].data

      return api.auth.sendMasterKey(requesterPublicKey, encryptedMasterKey)
    })
    await Promise.all(sendMasterKeyPromises)
  }
}

export default {
  getCurrentSession,
  getKeyFromLocalStorage,
  getKey,
  saveKey,
  signUp,
  clearAuthenticatedDataFromBrowser,
  signOut,
  signIn,
}
