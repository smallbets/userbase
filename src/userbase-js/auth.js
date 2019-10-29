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

  const session = await api.auth.signUp(
    lowerCaseUsername,
    password,
    base64.encode(publicKey),
    base64.encode(encryptionKeySalt),
    base64.encode(dhKeySalt),
    base64.encode(hmacKeySalt)
  )
  const { sessionId, creationDate } = session

  const seedString = base64.encode(seed)
  // Warning: if user hits the sign up button twice,
  // it's possible the seed will be overwritten here and will be lost
  localData.saveSeedString(username, seedString)

  localData.signInSession(lowerCaseUsername, sessionId, creationDate)

  const signingUp = true
  await ws.connect(appId, sessionId, lowerCaseUsername, seedString, signingUp)
  return { username: lowerCaseUsername, seed: seedString, signedIn: true, creationDate }
}

const signOut = async () => {
  const session = await ws.signOut()
  return session
}

class SignInFailed extends Error {
  constructor(message, username, ...params) {
    super(...params)

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SignInFailed)
    }

    this.name = 'Sign in failed'
    this.message = message
    this.username = username
  }
}

const signIn = async (username, password) => {
  const appId = config.getAppId()
  if (!appId) throw new Error(appIdNotSet)

  const lowerCaseUsername = username.toLowerCase()

  const session = await api.auth.signIn(lowerCaseUsername, password)
  const { sessionId, creationDate } = session

  localData.signInSession(lowerCaseUsername, sessionId, creationDate)

  const savedSeedString = localData.getSeedString(lowerCaseUsername) // might be null if does not have seed saved
  try {
    const seedString = await ws.connect(appId, sessionId, username, savedSeedString)
    return { username: lowerCaseUsername, seed: seedString, signedIn: true, creationDate }
  } catch (e) {
    if (e.message === 'Canceled') {
      throw new SignInFailed('Canceled', lowerCaseUsername)
    }
    throw e
  }
}

const getLastUsedUsername = () => {
  const lastUsedSession = localData.getCurrentSession()
  if (!lastUsedSession) return undefined
  else return lastUsedSession.username
}

const signInWithSession = async () => {
  const appId = config.getAppId()
  if (!appId) throw new Error(appIdNotSet)

  const currentSession = localData.getCurrentSession()
  if (!currentSession) throw new SignInFailed('No session available')

  const { signedIn, username, sessionId, creationDate } = currentSession
  if (!signedIn) throw new SignInFailed('User is not signed in', username)

  let extendedDate
  try {
    extendedDate = await api.auth.signInWithSession(sessionId)
  } catch (e) {
    if (e && e.response && e.response.data === 'Invalid session') {
      throw new SignInFailed('Invalid session', username)
    }
    throw e
  }

  const savedSeedString = localData.getSeedString(username) // might be null if does not have seed saved
  try {
    const seedString = await ws.connect(appId, sessionId, username, savedSeedString)
    return { username, seed: seedString, signedIn: true, creationDate, extendedDate }
  } catch (e) {
    if (e.message === 'Canceled') {
      throw new SignInFailed('Canceled', username)
    }
    throw e
  }
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
  getLastUsedUsername,
  signInWithSession,
  grantDatabaseAccess,
}
