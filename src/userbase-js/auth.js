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
    if (e.response.data === 'App ID not valid') {
      throw new errors.AppIdNotValid(e.response.status)
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
      throw new errors.UserAlreadySignedIn(e.username)
    } else if (e.message === 'Canceled') {
      throw new errors.UserCanceledSignIn('Canceled', e.username)
    }

    throw e
  }
}

const _parseGenericUsernamePasswordError = (e) => {
  if (e.response) {
    if (e.response.data.error === 'UsernameTooLong') {
      throw new errors.UsernameTooLong(e.response.data.maxLen)
    } else if (e.response.data.error === 'PasswordTooShort') {
      throw new errors.PasswordTooShort(e.response.data.minLen)
    } else if (e.response.data.error === 'PasswordTooLong') {
      throw new errors.PasswordTooLong(e.response.data.maxLen)
    }
  }
}

const _validateSignUpOrSignInInput = (username, password) => {
  if (!username) throw new errors.UsernameCannotBeBlank
  if (!password) throw new errors.PasswordCannotBeBlank

  if (typeof username !== 'string') throw new errors.UsernameMustBeString
  if (typeof password !== 'string') throw new errors.PasswordMustBeString
}

const _generateKeysAndSignUp = async (username, password, seed, email, profile) => {
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
      base64.encode(hmacKeySalt),
      email,
      profile
    )
    return session
  } catch (e) {
    _parseGenericErrors(e)
    _parseGenericUsernamePasswordError(e)

    if (e.response) {
      const status = e.response.status
      const data = e.response.data

      if (status === statusCodes['Conflict']) {
        throw new errors.UsernameAlreadyExists(username)
      } else {
        switch (data.error) {
          case 'EmailNotValid':
            throw new errors.EmailNotValid

          case 'ProfileMustBeObject':
            throw new errors.ProfileMustBeObject

          case 'ProfileKeyMustBeString':
            throw new errors.ProfileKeyMustBeString(data.key)

          case 'ProfileKeyTooLong':
            throw new errors.ProfileKeyTooLong(data.maxLen, data.key)

          case 'ProfileValueMustBeString':
            throw new errors.ProfileValueMustBeString(data.key, data.value)

          case 'ProfileValueTooLong':
            throw new errors.ProfileValueTooLong(data.maxLen, data.key, data.value)

          case 'ProfileHasTooManyKeys':
            throw new errors.ProfileHasTooManyKeys(data.maxKeys)

          case 'ProfileCannotBeEmpty':
            throw new errors.ProfileCannotBeEmpty
        }
      }
    }

    throw e
  }
}

const _buildUserResult = (username, key, email, profile) => {
  const result = { username, key }

  if (email) result.email = email
  if (profile) result.profile = profile

  return result
}

const _validateProfile = (profile) => {
  if (typeof profile !== 'object') throw new errors.ProfileMustBeObject

  let keyExists = false
  for (const key in profile) {
    keyExists = true

    if (typeof key !== 'string') throw new errors.ProfileKeyMustBeString(key)

    const value = profile[key]
    if (value) {
      if (typeof value !== 'string') throw new errors.ProfileValueMustBeString(key, value)
    }
  }

  if (!keyExists) throw new errors.ProfileCannotBeEmpty
}

const signUp = async (username, password, email, profile) => {
  try {
    _validateSignUpOrSignInInput(username, password)
    if (profile) _validateProfile(profile)

    const appId = config.getAppId()
    const lowerCaseUsername = username.toLowerCase()
    const seed = await crypto.generateSeed()

    const lowerCaseEmail = email && email.toLowerCase()

    const session = await _generateKeysAndSignUp(lowerCaseUsername, password, seed, lowerCaseEmail, profile)
    const { sessionId, creationDate } = session

    const seedString = base64.encode(seed)
    // Warning: if user hits the sign up button twice,
    // it's possible the seed will be overwritten here and will be lost
    localData.saveSeedString(lowerCaseUsername, seedString)

    localData.signInSession(lowerCaseUsername, sessionId, creationDate)

    const signingUp = true
    await _connectWebSocket(appId, sessionId, lowerCaseUsername, seedString, signingUp)

    return _buildUserResult(lowerCaseUsername, seedString, lowerCaseEmail, profile)
  } catch (e) {

    switch (e.name) {
      case 'UsernameAlreadyExists':
      case 'UsernameCannotBeBlank':
      case 'UsernameMustBeString':
      case 'UsernameTooLong':
      case 'PasswordCannotBeBlank':
      case 'PasswordTooShort':
      case 'PasswordTooLong':
      case 'PasswordMustBeString':
      case 'EmailNotValid':
      case 'ProfileMustBeObject':
      case 'ProfileCannotBeEmpty':
      case 'ProfileHasTooManyKeys':
      case 'ProfileKeyMustBeString':
      case 'ProfileKeyTooLong':
      case 'ProfileValueMustBeString':
      case 'ProfileValueTooLong':
      case 'AppIdNotSet':
      case 'AppIdNotValid':
      case 'UserAlreadySignedIn':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.ServiceUnavailable
    }

  }
}

const signOut = async () => {
  try {
    if (!ws.connected) throw new errors.UserNotSignedIn

    try {
      await ws.signOut()
    } catch (e) {
      _parseGenericErrors(e)
      throw e
    }

  } catch (e) {

    switch (e.name) {
      case 'UserNotSignedIn':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.ServiceUnavailable
    }
  }
}

const _signInWrapper = async (username, password) => {
  try {
    const { session, email, profile } = await api.auth.signIn(username, password)
    return { session, email, profile }
  } catch (e) {
    _parseGenericErrors(e)
    _parseGenericUsernamePasswordError(e)

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

    const { session, email, profile } = await _signInWrapper(lowerCaseUsername, password)
    const { sessionId, creationDate } = session

    localData.signInSession(lowerCaseUsername, sessionId, creationDate)

    const savedSeedString = localData.getSeedString(lowerCaseUsername) // might be null if does not have seed saved

    const seedString = await _connectWebSocket(appId, sessionId, username, savedSeedString)

    return _buildUserResult(lowerCaseUsername, seedString, email, profile)
  } catch (e) {

    switch (e.name) {
      case 'UsernameOrPasswordMismatch':
      case 'UsernameCannotBeBlank':
      case 'UsernameTooLong':
      case 'UsernameMustBeString':
      case 'PasswordCannotBeBlank':
      case 'PasswordTooShort':
      case 'PasswordTooLong':
      case 'PasswordMustBeString':
      case 'AppIdNotSet':
      case 'AppIdNotValid':
      case 'UserAlreadySignedIn':
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
    if (!currentSession) return {}

    const { signedIn, username, sessionId } = currentSession
    if (!signedIn) return { lastUsedUsername: username }

    let apiSignInWithSessionResult
    try {
      apiSignInWithSessionResult = await api.auth.signInWithSession(sessionId)
    } catch (e) {
      _parseGenericErrors(e)

      if (e.response && e.response.data === 'Session invalid') {
        return { lastUsedUsername: username }
      }

      throw e
    }
    const { email, profile } = apiSignInWithSessionResult

    const savedSeedString = localData.getSeedString(username) // might be null if does not have seed saved
    const seedString = await _connectWebSocket(appId, sessionId, username, savedSeedString)
    return { user: _buildUserResult(username, seedString, email, profile) }
  } catch (e) {

    switch (e.name) {
      case 'AppIdNotSet':
      case 'AppIdNotValid':
      case 'UserAlreadySignedIn':
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
