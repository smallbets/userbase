import base64 from 'base64-arraybuffer'
import api from './api'
import ws from './ws'
import db from './db'
import crypto from './Crypto'
import localData from './localData'
import config from './config'

const appIdNotSet = 'App id not set'
const wsNotOpen = 'Web Socket not open'
const deviceAlreadyRegistered = 'Device already registered'

const signUp = async (username, password, onSessionChange = (() => { })) => {
  const appId = config.getAppId()
  if (!appId) throw new Error(appIdNotSet)

  const lowerCaseUsername = username.toLowerCase()

  const seed = await crypto.generateSeed()
  const masterKey = await crypto.hkdf.importMasterKey(seed)

  const encryptionKeySalt = crypto.hkdf.generateSalt()
  const dhKeySalt = crypto.hkdf.generateSalt()
  const hmacKeySalt = crypto.hkdf.generateSalt()

  const dhPrivateKey = await crypto.diffieHellman.importKeyFromMaster(masterKey, dhKeySalt)
  const publicKey = crypto.diffieHellman.getPublicKey(dhPrivateKey)

  const sessionId = await api.auth.signUp(
    lowerCaseUsername,
    password,
    base64.encode(publicKey),
    base64.encode(encryptionKeySalt),
    base64.encode(dhKeySalt),
    base64.encode(hmacKeySalt)
  )

  // Warning: if user hits the sign up button twice,
  // it's possible the seed will be overwritten here and will be lost
  await localData.saveSeedToLocalStorage(lowerCaseUsername, seed)

  const session = localData.signInSession(lowerCaseUsername, sessionId)

  const signingUp = true
  await ws.connect(session, appId, onSessionChange, signingUp)

  return session
}

const signOut = async () => {
  if (!ws.connected) throw new Error(wsNotOpen)

  await ws.signOut()
}

const signIn = async (username, password, onSessionChange = (() => { })) => {
  const appId = config.getAppId()
  if (!appId) throw new Error(appIdNotSet)

  const lowerCaseUsername = username.toLowerCase()

  const sessionId = await api.auth.signIn(lowerCaseUsername, password)

  const session = localData.signInSession(lowerCaseUsername, sessionId)

  const signingUp = false
  await ws.connect(session, appId, onSessionChange, signingUp)

  return session
}

const init = async (onSessionChange = (() => { })) => {
  const appId = config.getAppId()
  if (!appId) throw new Error(appIdNotSet)

  const session = localData.getCurrentSession()
  if (!session) return onSessionChange({ username: undefined, signedIn: false, seed: undefined })
  if (!session.username || !session.signedIn) return onSessionChange(session)

  try {
    const signingUp = false
    await ws.connect(session, appId, onSessionChange, signingUp)
    return session
  } catch (e) {
    ws.close()
    onSessionChange(ws.session)
    throw e
  }
}

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
  init,
  importKey,
  grantDatabaseAccess,
}
