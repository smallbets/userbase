import uuidv4 from 'uuid/v4'
import base64 from 'base64-arraybuffer'
import api from './api'
import ws from './ws'
import db from './db'
import crypto from './Crypto'
import localData from './localData'

const wsNotOpen = 'Web Socket not open'
const deviceAlreadyRegistered = 'Device already registered'

const signUp = async (username, password, onSessionChange) => {
  const lowerCaseUsername = username.toLowerCase()
  const userId = uuidv4()

  const seed = await crypto.generateSeed()
  const masterKey = await crypto.hkdf.importMasterKey(seed)

  const encryptionKeySalt = crypto.hkdf.generateSalt()
  const dhKeySalt = crypto.hkdf.generateSalt()
  const hmacKeySalt = crypto.hkdf.generateSalt()

  const dhPrivateKey = await crypto.diffieHellman.importKeyFromMaster(masterKey, dhKeySalt)
  const { publicKey, sharedSecret } = crypto.diffieHellman.getPublicKeyAndSharedSecretWithServer(dhPrivateKey)

  const [encryptedValidationMessage, sharedKey] = await Promise.all([
    api.auth.signUp(
      lowerCaseUsername,
      password,
      userId,
      base64.encode(publicKey),
      base64.encode(encryptionKeySalt),
      base64.encode(dhKeySalt),
      base64.encode(hmacKeySalt)
    ),
    crypto.aesGcm.getKeyFromRawKey(await crypto.sha256.hash(sharedSecret))
  ])

  const validationMessage = await crypto.aesGcm.decrypt(sharedKey, encryptedValidationMessage)

  // Saves to local storage before validation to ensure user has it.
  // Warning: if user hits the sign up button twice,
  // it's possible the key will be overwritten here and will be lost
  await localData.saveSeedToLocalStorage(lowerCaseUsername, seed)

  await api.auth.validateKey(validationMessage)

  const session = localData.signInSession(lowerCaseUsername)

  const signingUp = true
  await ws.connect(session, onSessionChange, signingUp)

  return session
}

const signOut = async () => {
  ws.signOut()
  await api.auth.signOut()
}

const signIn = async (username, password, onSessionChange) => {
  const lowerCaseUsername = username.toLowerCase()

  await api.auth.signIn(lowerCaseUsername, password)

  const session = localData.signInSession(lowerCaseUsername)

  const signingUp = false
  await ws.connect(session, onSessionChange, signingUp)

  return session
}

const initSession = async (onSessionChange) => {
  const session = localData.getCurrentSession()
  if (!session) return onSessionChange({ username: undefined, signedIn: false, seed: undefined })
  if (!session.username || !session.signedIn) return onSessionChange(session)

  try {
    const signingUp = false
    await ws.connect(session, onSessionChange, signingUp)
  } catch (e) {
    ws.close()
    onSessionChange(ws.session)
    throw e
  }
}

const registerDevice = async () => {
  if (!ws.connected) throw new Error(wsNotOpen)
  if (ws.keys.init) throw new Error(deviceAlreadyRegistered)

  const alreadySavedRequest = localData.getTempRequestForSeed(ws.session.username)

  let requesterPublicKey
  let tempKeyToRequestSeed
  if (!alreadySavedRequest) {
    // this could be random bytes -- it's not used to encrypt/decrypt anything, only to generate DH
    tempKeyToRequestSeed = await crypto.aesGcm.getKeyStringFromKey(await crypto.aesGcm.generateKey())
    const publicKey = crypto.diffieHellman.getPublicKey(tempKeyToRequestSeed)
    requesterPublicKey = base64.encode(publicKey)

    localData.setTempRequestForSeed(ws.session.username, requesterPublicKey, tempKeyToRequestSeed)
  } else {
    requesterPublicKey = alreadySavedRequest.requesterPublicKey
    tempKeyToRequestSeed = alreadySavedRequest.tempKeyToRequestSeed
  }

  await ws.requestSeed(requesterPublicKey, tempKeyToRequestSeed)

  return {
    devicePublicKey: requesterPublicKey,
    firstTimeRegistering: !alreadySavedRequest
  }
}

// TO-DO: validate the key is user's key
const importKey = async (seedString) => {
  if (!ws.connected) throw new Error(wsNotOpen)
  if (ws.keys.init) throw new Error(deviceAlreadyRegistered)

  localData.saveSeedStringToLocalStorage(ws.session.username, seedString)
  await ws.setKeys(seedString)
  ws.onSessionChange(ws.session)
}

const grantDatabaseAccess = async (dbName, username, readOnly) => {
  if (!ws.keys.init) return

  const database = db.getOpenDb(dbName)

  const lowerCaseUsername = username.toLowerCase()

  let action = 'GetPublicKey'
  let params = { username: lowerCaseUsername }
  const granteePublicKeyResponse = await ws.request(action, params)
  const granteePublicKey = granteePublicKeyResponse.data

  await ws.grantDatabaseAccess(database, username, granteePublicKey, readOnly)
}

export default {
  signUp,
  signOut,
  signIn,
  initSession,
  registerDevice,
  importKey,
  grantDatabaseAccess,
}
