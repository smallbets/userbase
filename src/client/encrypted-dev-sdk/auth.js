import uuidv4 from 'uuid/v4'
import base64 from 'base64-arraybuffer'
import api from './api'
import ws from './ws'
import crypto from './Crypto'
import localData from './localData'

const wsNotOpen = 'Web Socket not open'
const deviceAlreadyRegistered = 'Device already registered'

const signUp = async (username, password, onSessionChange) => {
  const lowerCaseUsername = username.toLowerCase()
  const userId = uuidv4()

  const aesKey = await crypto.aesGcm.generateKey()
  const rawAesKey = await crypto.aesGcm.getRawKeyFromKey(aesKey)
  const { publicKey, sharedSecret } = crypto.diffieHellman.getPublicKeyAndSharedSecretWithServer(rawAesKey)

  const base64PublicKey = base64.encode(publicKey)

  const [encryptedValidationMessage, sharedKey] = await Promise.all([
    api.auth.signUp(lowerCaseUsername, password, userId, base64PublicKey),
    crypto.aesGcm.getKeyFromRawKey(await crypto.sha256.hash(sharedSecret))
  ])

  const validationMessage = await crypto.aesGcm.decrypt(sharedKey, encryptedValidationMessage)

  // Saves to local storage before validation to ensure user has it.
  // Warning: if user hits the sign up button twice,
  // it's possible the key will be overwritten here and will be lost
  await localData.saveKeyToLocalStorage(lowerCaseUsername, aesKey)

  await api.auth.validateKey(validationMessage)

  const signedIn = true
  const session = localData.setCurrentSession(lowerCaseUsername, signedIn)

  await ws.connect(session, onSessionChange)

  return session
}

const signOut = async () => {
  ws.signOut()
  await api.auth.signOut()
}

const signIn = async (username, password, onSessionChange) => {
  const lowerCaseUsername = username.toLowerCase()

  await api.auth.signIn(lowerCaseUsername, password)

  const signedIn = true
  const session = localData.setCurrentSession(lowerCaseUsername, signedIn)

  await ws.connect(session, onSessionChange)

  getRequestsForMasterKey()

  return session
}

const initSession = async (onSessionChange) => {
  const session = localData.getCurrentSession()
  if (!session) return onSessionChange({ username: undefined, signedIn: false, key: undefined })
  if (!session.username || !session.signedIn) return onSessionChange(session)

  try {
    const connected = await ws.connect(session, onSessionChange)

    getRequestsForMasterKey()

    return connected
  } catch (e) {
    const signedIn = false
    localData.setCurrentSession(session.username, signedIn)
    return onSessionChange({ ...session, signedIn })
  }
}

const registerDevice = async () => {
  if (!ws.connected) throw new Error(wsNotOpen)
  if (ws.keys.init) throw new Error(deviceAlreadyRegistered)

  const alreadySavedRequest = localData.getTempRequestForMasterKey(ws.session.username)

  let requesterPublicKey
  let tempKeyToRequestMasterKey
  if (!alreadySavedRequest) {
    // this could be random bytes -- it's not used to encrypt/decrypt anything, only to generate DH
    tempKeyToRequestMasterKey = await crypto.aesGcm.getKeyStringFromKey(await crypto.aesGcm.generateKey())
    const publicKey = crypto.diffieHellman.getPublicKey(tempKeyToRequestMasterKey)
    requesterPublicKey = base64.encode(publicKey)

    localData.setTempRequestForMasterKey(ws.session.username, requesterPublicKey, tempKeyToRequestMasterKey)
  } else {
    requesterPublicKey = alreadySavedRequest.requesterPublicKey
    tempKeyToRequestMasterKey = alreadySavedRequest.tempKeyToRequestMasterKey
  }

  await ws.requestMasterKey(requesterPublicKey, tempKeyToRequestMasterKey)

  return {
    devicePublicKey: requesterPublicKey,
    firstTimeRegistering: !alreadySavedRequest
  }
}

// TO-DO: validate the key is user's key
const importKey = async (keyString) => {
  if (!ws.connected) throw new Error(wsNotOpen)
  if (ws.keys.init) throw new Error(deviceAlreadyRegistered)

  localData.saveKeyStringToLocalStorage(ws.session.username, keyString)
  await ws.setKeys(keyString)
  ws.onSessionChange(ws.session)
}

const getRequestsForMasterKey = async () => {
  if (!ws.keys.init) return

  const response = await ws.request('GetRequestsForMasterKey')

  const masterKeyRequests = response.data.masterKeyRequests

  for (const masterKeyRequest of masterKeyRequests) {
    const requesterPublicKey = masterKeyRequest['requester-public-key']

    ws.sendMasterKey(requesterPublicKey)
  }
}

export default {
  signUp,
  signOut,
  signIn,
  initSession,
  registerDevice,
  importKey,
}
