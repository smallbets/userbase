import uuidv4 from 'uuid/v4'
import base64 from 'base64-arraybuffer'
import api from './api'
import db from './db'
import crypto from './Crypto'

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

const saveKeyStringToLocalStorage = async (keyString) => {
  const currentSession = getCurrentSession()

  const rawKey = base64.decode(keyString)
  await crypto.aesGcm.getKeyFromRawKey(rawKey) // ensures key is valid, would throw if invalid

  localStorage.setItem('key.' + currentSession.username, keyString)
}

const saveKeyToLocalStorage = async (username, key) => {
  const keyString = await crypto.aesGcm.getKeyStringFromKey(key)
  localStorage.setItem('key.' + username, keyString)
}

const getKeyStringFromLocalStorage = () => {
  const currentSession = getCurrentSession()
  if (!currentSession) {
    return undefined
  }

  const username = currentSession.username
  const keyString = localStorage.getItem('key.' + username)
  return keyString
}

const getKeyFromLocalStorage = async () => {
  const keyString = getKeyStringFromLocalStorage()

  if (!keyString) {
    return undefined
  }

  const key = await crypto.aesGcm.getKeyFromKeyString(keyString)
  return key
}

const getRawKeyByUsername = async (username) => {
  const keyString = localStorage.getItem('key.' + username)
  if (!keyString) {
    return undefined
  }
  const rawKey = base64.decode(keyString)
  return rawKey
}

const signUp = async (username, password) => {
  const lowerCaseUsername = username.toLowerCase()
  const userId = uuidv4()

  const aesKey = await crypto.aesGcm.generateKey()
  const rawAesKey = await crypto.aesGcm.getRawKeyFromKey(aesKey)
  const { publicKey, sharedSecret } = crypto.diffieHellman.getPublicKeyAndSharedSecretWithServer(rawAesKey)

  const [encryptedValidationMessage, sharedKey] = await Promise.all([
    api.auth.signUp(lowerCaseUsername, password, userId, publicKey),
    crypto.aesGcm.getKeyFromRawKey(await crypto.sha256.hash(sharedSecret))
  ])

  const validationMessage = await crypto.aesGcm.decrypt(sharedKey, encryptedValidationMessage)

  // Saves to local storage before validation to ensure user has it.
  // Warning: if user hits the sign up button twice,
  // it's possible the key will be overwritten here and will be lost
  await saveKeyToLocalStorage(lowerCaseUsername, aesKey)

  await api.auth.validateKey(validationMessage)

  pollForKeyRequests(lowerCaseUsername)

  const signedIn = true
  const session = _setCurrentSession(lowerCaseUsername, signedIn)
  return session
}

const clearAuthenticatedDataFromBrowser = () => {
  const currentSession = getCurrentSession()
  const signedIn = false
  return _setCurrentSession(currentSession.username, signedIn)
}

const signOut = async () => {
  const session = clearAuthenticatedDataFromBrowser()

  db.close()

  await api.auth.signOut()

  return session
}

const signIn = async (username, password) => {
  const lowerCaseUsername = username.toLowerCase()

  await api.auth.signIn(lowerCaseUsername, password)

  pollForKeyRequests(lowerCaseUsername)

  const signedIn = true
  const session = _setCurrentSession(lowerCaseUsername, signedIn)
  return session
}

const pollForKeyRequests = async (lowerCaseUsername) => {
  const POLL_INTERVAL = 2000

  const poll = async () => {
    try {
      const rawMasterKey = await getRawKeyByUsername(lowerCaseUsername)

      if (rawMasterKey) {
        await sendMasterKeyToRequesters(rawMasterKey)
      } else {
        await receiveRequestedMasterKey(lowerCaseUsername)
      }
    } catch {
      // swallow error
    }

    setTimeout(poll, POLL_INTERVAL)
  }

  poll()
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

    const sharedKeyPromises = sharedRawKeys.map(rawKey => crypto.aesGcm.getKeyFromRawKey(rawKey))
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

const receiveRequestedMasterKey = async (username) => {
  const alreadySavedRequest = localStorage.getItem(`${username}.temp-request-for-master-key`)

  if (alreadySavedRequest) {
    const requestForMasterKey = alreadySavedRequest.split('|')

    const tempKey = base64.decode(requestForMasterKey[0])
    const requesterPublicKey = base64.decode(requestForMasterKey[1])
    const senderPublicKey = Buffer.from(base64.decode(requestForMasterKey[2]))

    const encryptedMasterKey = await checkIfMasterKeyReceived(requesterPublicKey)

    if (encryptedMasterKey) {
      await decryptAndSaveMasterKey(username, tempKey, senderPublicKey, encryptedMasterKey)
    }
  }
}

const checkIfMasterKeyReceived = async (requesterPublicKey) => {
  try {
    const encryptedMasterKey = await api.auth.receiveMasterKey(requesterPublicKey)
    return encryptedMasterKey
  } catch (e) {
    const notFound = e.response && e.response.status === 404
    if (notFound) return null
    else throw e
  }
}

const pollToReceiveMasterKey = (requesterPublicKey) => new Promise(res => {
  const POLL_INTERVAL = 1000

  const receiveMasterKey = async () => {
    const encryptedMasterKey = await checkIfMasterKeyReceived(requesterPublicKey)

    if (encryptedMasterKey) return res(encryptedMasterKey)

    setTimeout(receiveMasterKey, POLL_INTERVAL)
  }

  receiveMasterKey()
})

const decryptAndSaveMasterKey = async (username, tempKeyToRequestMasterKey, senderPublicKey, encryptedMasterKey) => {
  const sharedSecret = crypto.diffieHellman.getSharedSecret(tempKeyToRequestMasterKey, senderPublicKey)
  const sharedRawKey = await crypto.sha256.hash(sharedSecret)
  const sharedKey = await crypto.aesGcm.getKeyFromRawKey(sharedRawKey)

  const masterRawKey = await crypto.aesGcm.decrypt(sharedKey, encryptedMasterKey)
  const masterKey = await crypto.aesGcm.getKeyFromRawKey(masterRawKey)

  await saveKeyToLocalStorage(username, masterKey)
  localStorage.removeItem(`${username}.temp-request-for-master-key`)
  return masterRawKey
}

const registerDevice = async () => {
  const { username, signedIn } = getCurrentSession()
  if (!username || !signedIn) throw new Error('Sign in first!')

  // this could be random bytes -- it's not used to encrypt/decrypt anything, only to generate DH
  const tempKeyToRequestMasterKey = await crypto.aesGcm.getRawKeyFromKey(await crypto.aesGcm.generateKey())
  const requesterPublicKey = crypto.diffieHellman.getPublicKey(tempKeyToRequestMasterKey)
  const senderPublicKey = await api.auth.requestMasterKey(requesterPublicKey)

  const tempRequestForMasterKey = base64.encode(tempKeyToRequestMasterKey)
    + '|' + base64.encode(requesterPublicKey)
    + '|' + base64.encode(senderPublicKey)
  localStorage.setItem(`${username}.temp-request-for-master-key`, tempRequestForMasterKey)

  const encryptedMasterKey = await pollToReceiveMasterKey(requesterPublicKey)
  const masterRawKey = await decryptAndSaveMasterKey(username, tempKeyToRequestMasterKey, senderPublicKey, encryptedMasterKey)

  return base64.encode(masterRawKey)
}

export default {
  getCurrentSession,
  getKeyFromLocalStorage,
  getKeyStringFromLocalStorage,
  saveKeyStringToLocalStorage,
  signUp,
  clearAuthenticatedDataFromBrowser,
  signOut,
  signIn,
  registerDevice
}
