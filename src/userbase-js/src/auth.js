import base64 from 'base64-arraybuffer'
import api from './api'
import ws from './ws'
import crypto from './Crypto'
import localData from './localData'
import config from './config'
import errors from './errors'
import statusCodes from './statusCodes'
import { objectHasOwnProperty } from './utils'

const MAX_PASSWORD_CHAR_LENGTH = 1000
const MIN_PASSWORD_CHAR_LENGTH = 6

const _parseGenericErrors = (e) => {
  if (e.response) {
    if (e.response.data === 'App ID not valid') {
      throw new errors.AppIdNotValid(e.response.status)
    } else if (e.response.data === 'UserNotFound') {
      throw new errors.UserNotFound
    } else if (e.response.status === statusCodes['Internal Server Error']) {
      throw new errors.InternalServerError
    } else if (e.response.status === statusCodes['Gateway Timeout']) {
      throw new errors.Timeout
    }
  } else if (e.message && e.message.includes('timeout')) {
    throw new errors.Timeout
  }
}

const _connectWebSocket = async (session, seed, rememberMe) => {
  try {
    await ws.connect(session, seed, rememberMe)
  } catch (e) {
    _parseGenericErrors(e)

    if (e.message === 'Web Socket already connected') {
      throw new errors.UserAlreadySignedIn(e.username)
    }

    throw e
  }
}

const _parseGenericUsernamePasswordError = (e) => {
  if (e.response && e.response.data.error === 'UsernameTooLong') {
    throw new errors.UsernameTooLong(e.response.data.maxLen)
  }
}

const _parseUserResponseError = (e, username) => {
  _parseGenericErrors(e)
  _parseGenericUsernamePasswordError(e)

  if (e.response) {
    const data = e.response.data

    if (data === 'UsernameAlreadyExists') {
      throw new errors.UsernameAlreadyExists(username)
    } else if (data === 'TrialExceededLimit') {
      throw new errors.TrialExceededLimit
    }

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

  throw e
}

const _validateUsername = (username) => {
  if (typeof username !== 'string') throw new errors.UsernameMustBeString
  if (username.length === 0) throw new errors.UsernameCannotBeBlank
}

const _validatePassword = (password) => {
  if (typeof password !== 'string') throw new errors.PasswordMustBeString
  if (password.length === 0) throw new errors.PasswordCannotBeBlank
  if (password.length < MIN_PASSWORD_CHAR_LENGTH) throw new errors.PasswordTooShort(MIN_PASSWORD_CHAR_LENGTH)
  if (password.length > MAX_PASSWORD_CHAR_LENGTH) throw new errors.PasswordTooLong(MAX_PASSWORD_CHAR_LENGTH)
}

const _validateSignUpOrSignInInput = (username, password) => {
  _validateUsername(username)
  _validatePassword(password)
}

const _generatePasswordToken = async (password, seed) => {
  const passwordSalt = crypto.scrypt.generateSalt()
  const passwordHash = await crypto.scrypt.hash(password, passwordSalt)

  const passwordHkdfKey = await crypto.hkdf.importHkdfKeyFromString(passwordHash)

  const passwordTokenSalt = crypto.hkdf.generateSalt()
  const passwordToken = await crypto.hkdf.getPasswordToken(passwordHkdfKey, passwordTokenSalt)

  const passwordBasedEncryptionKeySalt = crypto.hkdf.generateSalt()
  const passwordBasedEncryptionKey = await crypto.aesGcm.getPasswordBasedEncryptionKey(
    passwordHkdfKey, passwordBasedEncryptionKeySalt)

  const passwordEncryptedSeed = await crypto.aesGcm.encrypt(passwordBasedEncryptionKey, seed)

  return {
    passwordSalt,
    passwordTokenSalt,
    passwordToken,
    passwordBasedEncryptionKeySalt,
    passwordEncryptedSeed
  }
}

const _generateKeysAndSignUp = async (username, password, seed, email, profile) => {
  const {
    passwordSalt,
    passwordTokenSalt,
    passwordToken,
    passwordBasedEncryptionKeySalt,
    passwordEncryptedSeed
  } = await _generatePasswordToken(password, seed)

  const masterKey = await crypto.hkdf.importHkdfKey(seed)

  const encryptionKeySalt = crypto.hkdf.generateSalt()
  const dhKeySalt = crypto.hkdf.generateSalt()
  const hmacKeySalt = crypto.hkdf.generateSalt()

  const dhPrivateKey = await crypto.diffieHellman.importKeyFromMaster(masterKey, dhKeySalt)
  const publicKey = crypto.diffieHellman.getPublicKey(dhPrivateKey)

  const salts = {
    passwordSalt: base64.encode(passwordSalt),
    passwordTokenSalt: base64.encode(passwordTokenSalt),
    encryptionKeySalt: base64.encode(encryptionKeySalt),
    dhKeySalt: base64.encode(dhKeySalt),
    hmacKeySalt: base64.encode(hmacKeySalt),
  }

  const passwordBasedBackup = {
    passwordBasedEncryptionKeySalt: base64.encode(passwordBasedEncryptionKeySalt),
    passwordEncryptedSeed: base64.encode(passwordEncryptedSeed)
  }

  try {
    const session = await api.auth.signUp(
      username,
      passwordToken,
      publicKey,
      salts,
      email,
      profile,
      passwordBasedBackup
    )
    return session
  } catch (e) {
    _parseUserResponseError(e, username)
  }
}

const _buildUserResult = (username, email, profile) => {
  const result = { username }

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

const signUp = async (input) => {
  try {
    if (typeof input !== 'object') throw new errors.InputMustBeObject

    const { username, password, email, profile, rememberMe = false } = input

    _validateSignUpOrSignInInput(username, password)
    if (profile) _validateProfile(profile)
    if (email && typeof email !== 'string') throw new errors.EmailNotValid
    if (typeof rememberMe !== 'boolean') throw new errors.RememberMeMustBeBoolean

    const appId = config.getAppId()
    const lowerCaseUsername = username.toLowerCase()

    const seed = await crypto.generateSeed()

    const lowerCaseEmail = email && email.toLowerCase()

    const { sessionId, creationDate } = await _generateKeysAndSignUp(lowerCaseUsername, password, seed, lowerCaseEmail, profile)
    const session = {
      username: lowerCaseUsername,
      sessionId,
      creationDate
    }

    const seedString = base64.encode(seed)

    if (rememberMe) {
      localData.saveSeedString(appId, lowerCaseUsername, seedString)
      localData.signInSession(session)
    }

    await _connectWebSocket(session, seedString, rememberMe)

    return _buildUserResult(lowerCaseUsername, lowerCaseEmail, profile)
  } catch (e) {

    switch (e.name) {
      case 'InputMustBeObject':
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
      case 'RememberMeMustBeBoolean':
      case 'TrialExceededLimit':
      case 'AppIdNotSet':
      case 'AppIdNotValid':
      case 'UserAlreadySignedIn':
      case 'ShowKeyHandlerMustBeFunction':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.ServiceUnavailable
    }

  }
}

const signOut = async () => {
  try {
    if (!ws.session.username) throw new errors.UserNotSignedIn

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

const _getSeedStringFromPasswordBasedBackup = async (passwordHkdfKey, passwordBasedBackup) => {
  try {
    const { passwordBasedEncryptionKeySalt, passwordEncryptedSeed } = passwordBasedBackup

    const passwordBasedEncryptionKey = await crypto.aesGcm.getPasswordBasedEncryptionKey(
      passwordHkdfKey, base64.decode(passwordBasedEncryptionKeySalt))

    const seedFromBackup = await crypto.aesGcm.decrypt(passwordBasedEncryptionKey, base64.decode(passwordEncryptedSeed))
    const seedStringFromBackup = base64.encode(seedFromBackup)

    return seedStringFromBackup
  } catch (e) {
    throw new errors.UsernameOrPasswordMismatch
  }
}

const _signInWrapper = async (username, passwordToken) => {
  try {
    const apiSignInResult = await api.auth.signIn(username, passwordToken)
    return apiSignInResult
  } catch (e) {
    _parseGenericErrors(e)
    _parseGenericUsernamePasswordError(e)

    if (e.response && e.response.data === 'Invalid password') {
      throw new errors.UsernameOrPasswordMismatch
    }

    throw e
  }
}

const _rebuildPasswordToken = async (username, password) => {
  let passwordSalts
  try {
    passwordSalts = await api.auth.getPasswordSalts(username)
  } catch (e) {
    _parseGenericErrors(e)

    if (e.response && e.response.data === 'User not found') {
      throw new errors.UsernameOrPasswordMismatch
    }

    throw e
  }
  const { passwordSalt, passwordTokenSalt } = passwordSalts

  const passwordHash = await crypto.scrypt.hash(password, new Uint8Array(base64.decode(passwordSalt)))
  const passwordHkdfKey = await crypto.hkdf.importHkdfKeyFromString(passwordHash)
  const passwordToken = await crypto.hkdf.getPasswordToken(passwordHkdfKey, base64.decode(passwordTokenSalt))

  return { passwordHkdfKey, passwordToken }
}

const signIn = async (input) => {
  try {
    if (typeof input !== 'object') throw new errors.InputMustBeObject

    const { username, password, rememberMe = false } = input

    _validateSignUpOrSignInInput(username, password)
    if (typeof rememberMe !== 'boolean') throw new errors.RememberMeMustBeBoolean

    const appId = config.getAppId()
    const lowerCaseUsername = username.toLowerCase()

    const { passwordHkdfKey, passwordToken } = await _rebuildPasswordToken(username, password)

    const apiSignInResult = await _signInWrapper(lowerCaseUsername, passwordToken)
    const { email, profile, passwordBasedBackup } = apiSignInResult
    const session = {
      ...apiSignInResult.session,
      username: lowerCaseUsername
    }

    const savedSeedString = localData.getSeedString(lowerCaseUsername)

    let seedStringFromBackup
    if (!savedSeedString) {
      seedStringFromBackup = await _getSeedStringFromPasswordBasedBackup(passwordHkdfKey, passwordBasedBackup)
      if (rememberMe) localData.saveSeedString(appId, lowerCaseUsername, seedStringFromBackup)
    }

    const seedString = savedSeedString || seedStringFromBackup

    if (rememberMe) localData.signInSession(lowerCaseUsername, session.sessionId, session.creationDate)

    await _connectWebSocket(session, seedString, rememberMe)

    return _buildUserResult(lowerCaseUsername, email, profile)
  } catch (e) {

    switch (e.name) {
      case 'InputMustBeObject':
      case 'UsernameOrPasswordMismatch':
      case 'UsernameCannotBeBlank':
      case 'UsernameTooLong':
      case 'UsernameMustBeString':
      case 'PasswordCannotBeBlank':
      case 'PasswordTooShort':
      case 'PasswordTooLong':
      case 'PasswordMustBeString':
      case 'RememberMeMustBeBoolean':
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

const init = async (input) => {
  try {
    if (typeof input !== 'object') throw new errors.InputMustBeObject

    const { appId } = input

    config.configure({ appId })

    const session = await signInWithSession(appId)
    return session
  } catch (e) {

    switch (e.name) {
      case 'InputMustBeObject':
      case 'AppIdAlreadySet':
      case 'AppIdMustBeString':
      case 'AppIdCannotBeBlank':
      case 'AppIdNotValid':
      case 'UserAlreadySignedIn':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.ServiceUnavailable
    }

  }
}

const signInWithSession = async (appId) => {
  try {
    const currentSession = localData.getCurrentSession()
    if (!currentSession) return {}

    const { signedIn, username, sessionId } = currentSession
    const savedSeedString = localData.getSeedString(appId, username)

    if (!signedIn || !savedSeedString) return { lastUsedUsername: username }

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

    // enable idempotent calls to init()
    if (ws.connectionResolved) {
      if (ws.session.username === username) {
        return { user: _buildUserResult(username, email, profile) }
      } else {
        throw new errors.UserAlreadySignedIn(ws.session.username)
      }
    }

    const rememberMe = false
    await _connectWebSocket(currentSession, savedSeedString, rememberMe)

    return { user: _buildUserResult(username, email, profile) }
  } catch (e) {
    _parseGenericErrors(e)
    throw e
  }
}

const _validateUpdatedUserInput = (input) => {
  if (!objectHasOwnProperty(input, 'username')
    && !objectHasOwnProperty(input, 'password')
    && !objectHasOwnProperty(input, 'email')
    && !objectHasOwnProperty(input, 'profile')
  ) {
    throw new errors.UserMissingExpectedProperties
  }

  const { username, password, email, profile } = input

  if (objectHasOwnProperty(input, 'username')) _validateUsername(username)
  if (objectHasOwnProperty(input, 'password')) _validatePassword(password)

  // if email or profile are falsey, will be set to false
  if (email && typeof email !== 'string') throw new errors.EmailNotValid
  if (profile) _validateProfile(profile)
}

const _buildUpdateUserParams = async (input) => {
  const params = { ...input }
  if (params.username) params.username = params.username.toLowerCase()

  if (params.password) {
    const {
      passwordSalt,
      passwordTokenSalt,
      passwordToken,
      passwordBasedEncryptionKeySalt,
      passwordEncryptedSeed
    } = await _generatePasswordToken(params.password, base64.decode(ws.seedString))

    params.passwordToken = passwordToken

    params.passwordSalts = {
      passwordSalt: base64.encode(passwordSalt),
      passwordTokenSalt: base64.encode(passwordTokenSalt)
    }

    params.passwordBasedBackup = {
      passwordBasedEncryptionKeySalt: base64.encode(passwordBasedEncryptionKeySalt),
      passwordEncryptedSeed: base64.encode(passwordEncryptedSeed)
    }

    delete params.password
  }

  if (params.email) params.email = params.email.toLowerCase()
  else if (objectHasOwnProperty(params, 'email')) params.email = false // marks email for deletion

  if (!params.profile && objectHasOwnProperty(params, 'profile')) params.profile = false // marks profile for deletion

  return params
}

const updateUser = async (input) => {
  try {
    if (typeof input !== 'object') throw new errors.InputMustBeObject

    _validateUpdatedUserInput(input)

    if (!ws.keys.init) throw new errors.UserNotSignedIn
    const startingSeedString = ws.seedString

    const action = 'UpdateUser'
    const params = await _buildUpdateUserParams(input)

    if (ws.reconnecting) throw new errors.Reconnecting
    if (!ws.keys.init) throw new errors.UserNotSignedIn

    // ensures same user still attempting to update (seed should remain constant)
    if (startingSeedString !== ws.seedString) throw new errors.ServiceUnavailable

    try {
      const rememberMe = ws.rememberMe
      if (rememberMe && params.username) {
        localData.saveSeedString(config.getAppId(), params.username, ws.seedString)
        localData.removeCurrentSession()
      }

      await ws.request(action, params)

      // ensures same user still attempting to update (seed should remain constant)
      if (startingSeedString !== ws.seedString) throw new errors.ServiceUnavailable

      if (params.username) {
        ws.session.username = params.username // eslint-disable-line require-atomic-updates

        if (rememberMe) {
          localData.signInSession(params.username, ws.session.sessionId, ws.session.creationDate)
        }
      }
    } catch (e) {
      _parseUserResponseError(e, params.username)
    }
  } catch (e) {

    switch (e.name) {
      case 'InputMustBeObject':
      case 'UserMissingExpectedProperties':
      case 'UsernameAlreadyExists':
      case 'UsernameMustBeString':
      case 'UsernameCannotBeBlank':
      case 'UsernameTooLong':
      case 'PasswordMustBeString':
      case 'PasswordCannotBeBlank':
      case 'PasswordTooShort':
      case 'PasswordTooLong':
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
      case 'UserNotFound':
      case 'UserNotSignedIn':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.ServiceUnavailable
    }

  }
}

const deleteUser = async () => {
  try {
    if (ws.reconnecting) throw new errors.Reconnecting
    if (!ws.keys.init) throw new errors.UserNotSignedIn

    const username = ws.session.username
    localData.removeSeedString(username)
    localData.removeCurrentSession(username)

    try {
      const action = 'DeleteUser'
      await ws.request(action)
    } catch (e) {
      _parseGenericErrors(e)
      throw e
    }

    ws.close()

  } catch (e) {

    switch (e.name) {
      case 'UserNotSignedIn':
      case 'UserNotFound':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.ServiceUnavailable
    }

  }
}

export default {
  signUp,
  signOut,
  signIn,
  init,
  updateUser,
  deleteUser
}
