import base64 from 'base64-arraybuffer'
import api from './api'
import ws from './ws'
import db from './db'
import crypto from './Crypto'
import localData from './localData'
import config from './config'

const appIdNotSet = 'App id not set'

const signUp = async (username, password) => {
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

  const seedString = base64.encode(seed)
  // Warning: if user hits the sign up button twice,
  // it's possible the seed will be overwritten here and will be lost
  localData.saveSeedString(username, seedString)

  localData.signInSession(lowerCaseUsername, sessionId)

  const signingUp = true
  await ws.connect(appId, sessionId, lowerCaseUsername, seedString, signingUp)
  return { username: lowerCaseUsername, seed: seedString, signedIn: true }
}

const signOut = async () => {
  const session = await ws.signOut()
  return session
}

const signIn = async (username, password) => {
  const appId = config.getAppId()
  if (!appId) throw new Error(appIdNotSet)

  const lowerCaseUsername = username.toLowerCase()

  const sessionId = await api.auth.signIn(lowerCaseUsername, password)

  localData.signInSession(lowerCaseUsername, sessionId)

  const savedSeedString = localData.getSeedString(lowerCaseUsername) // might be null if does not have seed saved
  const session = await ws.connect(appId, sessionId, username, savedSeedString)
  if (!session.signedIn) throw new Error('Canceled')
  return session
}

const init = async () => {
  const appId = config.getAppId()
  if (!appId) throw new Error(appIdNotSet)

  const currentSession = localData.getCurrentSession()
  if (!currentSession) return { signedIn: false }

  const { signedIn, username, sessionId } = currentSession
  if (!signedIn) return { username: username, signedIn: false }

  try {
    await api.auth.signInWithSession(sessionId)
  } catch (e) {
    if (e && e.response && e.response.data === 'Invalid session') {
      return { username, signedIn: false }
    }
    throw e
  }

  const savedSeedString = localData.getSeedString(username) // might be null if does not have seed saved
  const session = await ws.connect(appId, sessionId, username, savedSeedString)
  return session
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
  grantDatabaseAccess,
}
