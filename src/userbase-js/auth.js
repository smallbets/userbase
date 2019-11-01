import base64 from 'base64-arraybuffer'
import api from './api'
import ws from './ws'
import db from './db'
import crypto from './Crypto'
import localData from './localData'
import config from './config'
import errors from './errors'
import statusCodes from './statusCodes'

const _parseGenericErrors = (e) => {
  if (e.response) {
    if (e.response.data === 'App ID invalid') {
      throw new errors.AppIdInvalid(e.response.status)
    } else if (e.response.status === statusCodes['Internal Server Error']) {
      throw new errors.InternalServerError
    } else if (e.response.status === statusCodes['Gateway Timeout']) {
      throw new errors.Timeout
    }
  } else if (e.message && e.message.includes('timeout')) {
    throw new errors.Timeout
  }
}

const _connectWebSocket = async (appId, sessionId, username, seed, signingUp) => {
  try {
    const seedString = await ws.connect(appId, sessionId, username, seed, signingUp)
    return seedString
  } catch (e) {
    _parseGenericErrors(e)

    if (e.message === 'Web Socket already connected') {
      throw new errors.SessionAlreadyExists(e.username)
    } else if (e.message === 'Canceled') {
      throw new errors.UserCanceledSignIn('Canceled', e.username)
    }

    throw e
  }
}

const _validateSignUpOrSignInInput = (username, password) => {
  if (!username) throw new errors.UsernameCannotBeBlank
  if (!password) throw new errors.PasswordCannotBeBlank

  if (typeof username !== 'string') throw new errors.UsernameMustBeString
  if (typeof password !== 'string') throw new errors.PasswordMustBeString
}

const _generateKeysAndSignUp = async (username, password, seed) => {
  const masterKey = await crypto.hkdf.importMasterKey(seed)

  const encryptionKeySalt = crypto.hkdf.generateSalt()
  const dhKeySalt = crypto.hkdf.generateSalt()
  const hmacKeySalt = crypto.hkdf.generateSalt()

  const dhPrivateKey = await crypto.diffieHellman.importKeyFromMaster(masterKey, dhKeySalt)
  const publicKey = crypto.diffieHellman.getPublicKey(dhPrivateKey)

  try {
    const session = await api.auth.signUp(
      username,
      password,
      base64.encode(publicKey),
      base64.encode(encryptionKeySalt),
      base64.encode(dhKeySalt),
      base64.encode(hmacKeySalt)
    )
    return session
  } catch (e) {
    _parseGenericErrors(e)

    if (e.response) {
      if (e.response.status === statusCodes['Conflict']) {
        throw new errors.UsernameAlreadyExists(username)
      } else if (e.response.data.error === 'UsernameTooLong') {
        throw new errors.UsernameTooLong(e.response.data.maxLength)
      } else if (e.response.data.error === 'PasswordTooShort') {
        throw new errors.PasswordTooShort(e.response.data.minLength)
      } else if (e.response.data.error === 'PasswordTooLong') {
        throw new errors.PasswordTooLong(e.response.data.maxLength)
      }
    }

    throw e
  }
}

const signUp = async (username, password) => {
  try {
    _validateSignUpOrSignInInput(username, password)

    const appId = config.getAppId()
    const lowerCaseUsername = username.toLowerCase()
    const seed = await crypto.generateSeed()

    const session = await _generateKeysAndSignUp(lowerCaseUsername, password, seed)
    const { sessionId, creationDate } = session

    const seedString = base64.encode(seed)
    // Warning: if user hits the sign up button twice,
    // it's possible the seed will be overwritten here and will be lost
    localData.saveSeedString(lowerCaseUsername, seedString)

    localData.signInSession(lowerCaseUsername, sessionId, creationDate)

    const signingUp = true
    await _connectWebSocket(appId, sessionId, lowerCaseUsername, seedString, signingUp)
    return { username: lowerCaseUsername, seed: seedString, signedIn: true, creationDate }
  } catch (e) {

    switch (e.name) {
      case 'UsernameAlreadyExists':
      case 'UsernameCannotBeBlank':
      case 'UsernameTooLong':
      case 'PasswordCannotBeBlank':
      case 'PasswordTooShort':
      case 'PasswordTooLong':
      case 'AppIdNotSet':
      case 'AppIdInvalid':
      case 'SessionAlreadyExists':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.ServiceUnavailable
    }

  }
}

const signOut = async () => {
  try {
    const session = await ws.signOut()
    return session
  } catch (e) {
    _parseGenericErrors(e)
    throw new errors.ServiceUnavailable
  }
}

const _signInWrapper = async (username, password) => {
  try {
    const session = await api.auth.signIn(username, password)
    return session
  } catch (e) {
    _parseGenericErrors(e)

    if (e.response && e.response.data === 'Invalid password') {
      throw new errors.UsernameOrPasswordMismatch
    }

    throw e
  }
}

const signIn = async (username, password) => {
  try {
    _validateSignUpOrSignInInput(username, password)

    const appId = config.getAppId()

    const lowerCaseUsername = username.toLowerCase()

    const session = await _signInWrapper(lowerCaseUsername, password)
    const { sessionId, creationDate } = session

    localData.signInSession(lowerCaseUsername, sessionId, creationDate)

    const savedSeedString = localData.getSeedString(lowerCaseUsername) // might be null if does not have seed saved

    const seedString = await _connectWebSocket(appId, sessionId, username, savedSeedString)
    return { username: lowerCaseUsername, seed: seedString, signedIn: true, creationDate }
  } catch (e) {

    switch (e.name) {
      case 'UsernameOrPasswordMismatch':
      case 'UsernameCannotBeBlank':
      case 'PasswordCannotBeBlank':
      case 'AppIdNotSet':
      case 'AppIdInvalid':
      case 'SessionAlreadyExists':
      case 'UserCanceledSignIn':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.ServiceUnavailable
    }

  }
}

const getLastUsedUsername = () => {
  const lastUsedSession = localData.getCurrentSession()
  if (!lastUsedSession) return undefined
  else return lastUsedSession.username
}

const signInWithSession = async () => {
  try {
    const appId = config.getAppId()

    const currentSession = localData.getCurrentSession()
    if (!currentSession) throw new errors.NoSessionAvailable

    const { signedIn, username, sessionId, creationDate } = currentSession
    if (!signedIn) throw new errors.UserNotSignedIn(username)

    let extendedDate
    try {
      extendedDate = await api.auth.signInWithSession(sessionId)
    } catch (e) {
      _parseGenericErrors(e)

      if (e.response && e.response.data === 'Session invalid') {
        throw new errors.SessionInvalid(username)
      }

      throw e
    }

    const savedSeedString = localData.getSeedString(username) // might be null if does not have seed saved
    const seedString = await _connectWebSocket(appId, sessionId, username, savedSeedString)
    return { username, seed: seedString, signedIn: true, creationDate, extendedDate }
  } catch (e) {

    switch (e.name) {
      case 'NoSessionAvailable':
      case 'UserNotSignedIn':
      case 'SessionInvalid':
      case 'AppIdNotSet':
      case 'AppIdInvalid':
      case 'SessionAlreadyExists':
      case 'UserCanceledSignIn':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.ServiceUnavailable
    }

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
