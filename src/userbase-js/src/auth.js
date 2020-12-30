import base64 from 'base64-arraybuffer'
import authApi from './api/auth'
import ws from './ws'
import crypto from './Crypto'
import localData from './localData'
import config from './config'
import errors from './errors'
import statusCodes from './statusCodes'
import { objectHasOwnProperty, getWsUrl } from './utils'

const MAX_PASSWORD_CHAR_LENGTH = 1000
const MIN_PASSWORD_CHAR_LENGTH = 6

const REMEMBER_ME_OPTIONS = {
  local: true,
  session: true,
  none: true
}

const KEY_NOT_FOUND_ON_SIGN_IN = "Device not recognized. This temporary password can only be used to sign in from a device you've signed in from before."
const KEY_NOT_FOUND_ON_FORGOT_PASSWORD = "Device not recognized. Forgot password only works from a device you've signed in from before."

const _checkSignedInState = () => {
  if (ws.reconnecting) throw new errors.Reconnecting
  if (!ws.keys.init && ws.changePassword) throw new errors.UserMustChangePassword
  if (!ws.keys.init) throw new errors.UserNotSignedIn
}

const _parseGenericErrors = (e) => {
  if (e.response) {
    if (e.response.data === 'Domain not whitelisted') {
      throw new errors.DomainNotWhitelisted(window.location.origin)
    } else if (e.response.data === 'App ID not valid') {
      throw new errors.AppIdNotValid
    } else if (e.response.data === 'UserNotFound') {
      throw new errors.UserNotFound
    } else if (e.response.status === statusCodes['Internal Server Error']) {
      throw new errors.InternalServerError
    } else if (e.response.status === statusCodes['Gateway Timeout']) {
      throw new errors.Timeout
    }
  } else if (e.message && e.message.indexOf('timeout') !== -1) {
    throw new errors.Timeout
  }
}

const _connectWebSocket = async (session, seed, rememberMe, changePassword) => {
  try {
    await ws.connect(session, seed, rememberMe, changePassword)
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
  } else if (e.response && e.response.data.error === 'PasswordAttemptLimitExceeded') {
    throw new errors.PasswordAttemptLimitExceeded(e.response.data.delay)
  }
}

const _parseSessionLengthError = (e) => {
  if (e.response && e.response.data) {
    const data = e.response.data

    switch (data.error) {
      case 'SessionLengthTooShort':
        throw new errors.SessionLengthTooShort(data.minLen)

      case 'SessionLengthTooLong':
        throw new errors.SessionLengthTooLong(data.maxLen)
    }
  }
}

const _parseUserResponseError = (e, username) => {
  _parseGenericErrors(e)
  _parseGenericUsernamePasswordError(e)

  if (e.response) {
    const data = e.response.data

    switch (data) {
      case 'UsernameAlreadyExists':
        throw new errors.UsernameAlreadyExists(username)

      case 'TrialExceededLimit':
        throw new errors.TrialExceededLimit

      case 'CurrentPasswordIncorrect':
        throw new errors.CurrentPasswordIncorrect

      default:
      // continue
    }

    switch (data.error) {
      case 'EmailNotValid':
        throw new errors.EmailNotValid

      case 'ProfileMustBeObject':
        throw new errors.ProfileMustBeObject

      case 'ProfileKeyTooLong':
        throw new errors.ProfileKeyTooLong(data.maxLen, data.key)

      case 'ProfileValueMustBeString':
        throw new errors.ProfileValueMustBeString(data.key, data.value)

      case 'ProfileValueCannotBeBlank':
        throw new errors.ProfileValueCannotBeBlank(data.key)

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

const _calculateSessionLengthMs = sessionLength => sessionLength && sessionLength * 60 * 60 * 1000

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

const _validateSignUpOrSignInInput = (params) => {
  if (typeof params !== 'object') throw new errors.ParamsMustBeObject

  if (!objectHasOwnProperty(params, 'username')) throw new errors.UsernameMissing
  if (!objectHasOwnProperty(params, 'password')) throw new errors.PasswordMissing

  _validateUsername(params.username)
  _validatePassword(params.password)

  if (objectHasOwnProperty(params, 'rememberMe') && !REMEMBER_ME_OPTIONS[params.rememberMe]) {
    throw new errors.RememberMeValueNotValid(REMEMBER_ME_OPTIONS)
  }

  if (objectHasOwnProperty(params, 'sessionLength') && typeof params.sessionLength !== 'number') {
    throw new errors.SessionLengthMustBeNumber
  }
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

  const passwordSalts = {
    passwordSalt: base64.encode(passwordSalt),
    passwordTokenSalt: base64.encode(passwordTokenSalt)
  }

  const passwordBasedBackup = {
    passwordBasedEncryptionKeySalt: base64.encode(passwordBasedEncryptionKeySalt),
    passwordEncryptedSeed: base64.encode(passwordEncryptedSeed)
  }

  return {
    passwordToken,
    passwordSalts,
    passwordBasedBackup
  }
}

const _generateKeys = async (seed) => {
  const masterKey = await crypto.hkdf.importHkdfKey(seed)

  const encryptionKeySalt = crypto.hkdf.generateSalt()
  const hmacKeySalt = crypto.hkdf.generateSalt()
  const keySalts = {
    encryptionKeySalt: base64.encode(encryptionKeySalt),
    hmacKeySalt: base64.encode(hmacKeySalt),
  }

  const ecdsaKeyData = await crypto.ecdsa.generateEcdsaKeyData(masterKey)
  const ecdhKeyData = await crypto.ecdh.generateEcdhKeyData(masterKey, ecdsaKeyData.ecdsaPrivateKey)

  delete ecdsaKeyData.ecdsaPrivateKey
  delete ecdhKeyData.ecdhPrivateKey

  const ecKeyData = {
    ecdsaKeyData,
    ecdhKeyData,
  }

  return { ecKeyData, keySalts }
}

const _generateKeysAndSignUp = async (username, password, seed, email, profile, sessionLength) => {
  const {
    passwordToken,
    passwordSalts,
    passwordBasedBackup
  } = await _generatePasswordToken(password, seed)

  const { ecKeyData, keySalts } = await _generateKeys(seed)

  try {
    const session = await authApi.signUp(
      username,
      passwordToken,
      ecKeyData,
      passwordSalts,
      keySalts,
      email,
      profile,
      passwordBasedBackup,
      sessionLength,
    )
    return session
  } catch (e) {
    _parseSessionLengthError(e)
    _parseUserResponseError(e, username)
  }
}

const _validateProfile = (profile) => {
  if (typeof profile !== 'object') throw new errors.ProfileMustBeObject

  let keyExists = false
  for (const key in profile) {
    keyExists = true

    const value = profile[key]
    if (typeof value !== 'string') throw new errors.ProfileValueMustBeString(key, value)
    if (!value) throw new errors.ProfileValueCannotBeBlank(key)
  }

  if (!keyExists) throw new errors.ProfileCannotBeEmpty
}

const _validateSignUpInput = (params) => {
  _validateSignUpOrSignInInput(params)

  if (params.profile) _validateProfile(params.profile)
  if (params.email && typeof params.email !== 'string') throw new errors.EmailNotValid
}

const signUp = async (params) => {
  try {
    _validateSignUpInput(params)

    const { password, profile, rememberMe = 'session' } = params

    const username = params.username.toLowerCase()
    const email = params.email && params.email.toLowerCase()

    const appId = config.getAppId()
    const seed = await crypto.generateSeed()

    const sessionLength = _calculateSessionLengthMs(params.sessionLength)

    const { sessionId, creationDate, expirationDate, userId, authToken } = await _generateKeysAndSignUp(username, password, seed, email, profile, sessionLength)
    const session = { username, userId, sessionId, creationDate, expirationDate, authToken }

    const seedString = base64.encode(seed)

    localData.saveSeedString(rememberMe, appId, username, seedString)
    localData.signInSession(rememberMe, username, sessionId, creationDate, expirationDate)

    await _connectWebSocket(session, seedString, rememberMe)

    return ws.buildUserResult({ username, userId, authToken, email, profile, userData: ws.userData })
  } catch (e) {

    switch (e.name) {
      case 'ParamsMustBeObject':
      case 'UsernameMissing':
      case 'UsernameAlreadyExists':
      case 'UsernameCannotBeBlank':
      case 'UsernameMustBeString':
      case 'UsernameTooLong':
      case 'PasswordMissing':
      case 'PasswordCannotBeBlank':
      case 'PasswordTooShort':
      case 'PasswordTooLong':
      case 'PasswordMustBeString':
      case 'EmailNotValid':
      case 'ProfileMustBeObject':
      case 'ProfileCannotBeEmpty':
      case 'ProfileHasTooManyKeys':
      case 'ProfileKeyTooLong':
      case 'ProfileValueMustBeString':
      case 'ProfileValueCannotBeBlank':
      case 'ProfileValueTooLong':
      case 'RememberMeValueNotValid':
      case 'SessionLengthMustBeNumber':
      case 'SessionLengthTooShort':
      case 'SessionLengthTooLong':
      case 'TrialExceededLimit':
      case 'AppIdNotSet':
      case 'AppIdNotValid':
      case 'DomainNotWhitelisted':
      case 'UserAlreadySignedIn':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
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
        throw new errors.UnknownServiceUnavailable(e)
    }
  }
}

const _getSeedStringFromPasswordBasedBackup = async (passwordHkdfKey, passwordBasedBackup) => {
  const { passwordBasedEncryptionKeySalt, passwordEncryptedSeed } = passwordBasedBackup

  const passwordBasedEncryptionKey = await crypto.aesGcm.getPasswordBasedEncryptionKey(
    passwordHkdfKey, base64.decode(passwordBasedEncryptionKeySalt))

  const seedFromBackup = await crypto.aesGcm.decrypt(passwordBasedEncryptionKey, base64.decode(passwordEncryptedSeed))
  const seedStringFromBackup = base64.encode(seedFromBackup)

  return seedStringFromBackup
}

const _signInWrapper = async (username, passwordToken, sessionLength) => {
  try {
    const apiSignInResult = await authApi.signIn(username, passwordToken, sessionLength)
    return apiSignInResult
  } catch (e) {
    _parseGenericErrors(e)
    _parseGenericUsernamePasswordError(e)
    _parseSessionLengthError(e)

    if (e.response && e.response.data === 'Invalid password') {
      throw new errors.UsernameOrPasswordMismatch
    } else if (e.response && e.response.data === 'User pending deletion') {
      throw new errors.UserPendingDeletion
    }

    throw e
  }
}

const _getPasswordSaltsOverRestEndpoint = async (username) => {
  try {
    const passwordSalts = await authApi.getPasswordSalts(username)
    return passwordSalts
  } catch (e) {
    _parseGenericErrors(e)
    _parseGenericUsernamePasswordError(e)

    if (e.response && e.response.data === 'User not found') {
      throw new errors.UsernameOrPasswordMismatch
    }

    throw e
  }
}

const _getPasswordSaltsOverWebSocket = async () => {
  try {
    const action = 'GetPasswordSalts'
    const passwordSaltsResponse = await ws.request(action)
    return passwordSaltsResponse.data
  } catch (e) {
    _parseGenericErrors(e)
    throw e
  }
}

const _rebuildPasswordToken = async (password, passwordSalts) => {
  const { passwordSalt, passwordTokenSalt } = passwordSalts

  const passwordHash = await crypto.scrypt.hash(password, new Uint8Array(base64.decode(passwordSalt)))
  const passwordHkdfKey = await crypto.hkdf.importHkdfKeyFromString(passwordHash)
  const passwordToken = await crypto.hkdf.getPasswordToken(passwordHkdfKey, base64.decode(passwordTokenSalt))

  return { passwordHkdfKey, passwordToken }
}

const signIn = async (params) => {
  try {
    _validateSignUpOrSignInInput(params)

    const username = params.username.toLowerCase()
    const { password, rememberMe = 'session' } = params

    const appId = config.getAppId()

    const passwordSalts = await _getPasswordSaltsOverRestEndpoint(username)
    const { passwordHkdfKey, passwordToken } = await _rebuildPasswordToken(password, passwordSalts)

    const sessionLength = _calculateSessionLengthMs(params.sessionLength)

    const apiSignInResult = await _signInWrapper(username, passwordToken, sessionLength)
    const { userId, email, profile, passwordBasedBackup, protectedProfile, usedTempPassword, changePassword } = apiSignInResult
    const session = {
      ...apiSignInResult.session,
      username,
      userId,
    }

    let seedString
    if (!changePassword) {
      const savedSeedString = localData.getSeedString(appId, username)

      let seedStringFromBackup
      if (!savedSeedString && usedTempPassword) {
        throw new errors.KeyNotFound(KEY_NOT_FOUND_ON_SIGN_IN)
      } else {
        // always use seed from backup in case it's changed and local copy is out of date
        seedStringFromBackup = await _getSeedStringFromPasswordBasedBackup(passwordHkdfKey, passwordBasedBackup)
        localData.saveSeedString(rememberMe, appId, username, seedStringFromBackup)
      }

      seedString = seedStringFromBackup || savedSeedString
    }

    localData.signInSession(rememberMe, username, session.sessionId, session.creationDate, session.expirationDate)

    try {
      await _connectWebSocket(session, seedString, rememberMe, changePassword)
    } catch (e) {
      if (usedTempPassword && e.message === 'Invalid seed') throw new errors.KeyNotFound(KEY_NOT_FOUND_ON_SIGN_IN)
      throw e
    }

    return ws.buildUserResult({
      username, userId, authToken: session.authToken, email,
      profile, protectedProfile, usedTempPassword, changePassword, userData: ws.userData
    })
  } catch (e) {

    switch (e.name) {
      case 'ParamsMustBeObject':
      case 'UsernameMissing':
      case 'UsernameOrPasswordMismatch':
      case 'UserPendingDeletion':
      case 'UsernameCannotBeBlank':
      case 'UsernameTooLong':
      case 'UsernameMustBeString':
      case 'PasswordMissing':
      case 'PasswordCannotBeBlank':
      case 'PasswordTooShort':
      case 'PasswordTooLong':
      case 'PasswordMustBeString':
      case 'PasswordAttemptLimitExceeded':
      case 'RememberMeValueNotValid':
      case 'SessionLengthMustBeNumber':
      case 'SessionLengthTooShort':
      case 'SessionLengthTooLong':
      case 'KeyNotFound':
      case 'AppIdNotSet':
      case 'AppIdNotValid':
      case 'DomainNotWhitelisted':
      case 'UserAlreadySignedIn':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }

  }
}

const init = async (params) => {
  try {
    if (!window.crypto.subtle) throw new errors.WebCryptoUnavailable

    if (typeof params !== 'object') throw new errors.ParamsMustBeObject

    if (!objectHasOwnProperty(params, 'appId')) throw new errors.AppIdMissing
    if (typeof params.appId !== 'string') throw new errors.AppIdMustBeString
    if (params.appId.length === 0) throw new errors.AppIdCannotBeBlank

    if (objectHasOwnProperty(params, 'updateUserHandler') && typeof params.updateUserHandler !== 'function') {
      throw new errors.UpdateUserHandlerMustBeFunction
    }

    if (objectHasOwnProperty(params, 'sessionLength') && typeof params.sessionLength !== 'number') {
      throw new errors.SessionLengthMustBeNumber
    }

    if (objectHasOwnProperty(params, 'allowServerSideEncryption') && typeof params.allowServerSideEncryption !== 'boolean') {
      throw new errors.AllowServerSideEncryptionMustBeBoolean
    }

    config.configure(params)

    const session = await signInWithSession(params.appId, _calculateSessionLengthMs(params.sessionLength))
    return session
  } catch (e) {

    switch (e.name) {
      case 'WebCryptoUnavailable':
      case 'ParamsMustBeObject':
      case 'AppIdMissing':
      case 'AppIdAlreadySet':
      case 'AppIdMustBeString':
      case 'AppIdCannotBeBlank':
      case 'AppIdNotValid':
      case 'DomainNotWhitelisted':
      case 'UpdateUserHandlerMustBeFunction':
      case 'SessionLengthMustBeNumber':
      case 'SessionLengthTooShort':
      case 'SessionLengthTooLong':
      case 'AllowServerSideEncryptionMustBeBoolean':
      case 'UserAlreadySignedIn':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }

  }
}

const signInWithSession = async (appId, sessionLength) => {
  let lastUsedUsername
  try {
    const currentSession = localData.getCurrentSession()
    if (!currentSession) return {}

    const { signedIn, sessionId, creationDate, expirationDate, rememberMe } = currentSession
    lastUsedUsername = currentSession.username
    const savedSeedString = localData.getSeedString(appId, lastUsedUsername)

    if (!signedIn || !savedSeedString || new Date() > new Date(expirationDate)) {
      return { lastUsedUsername }
    }

    let apiSignInWithSessionResult
    try {
      apiSignInWithSessionResult = await authApi.signInWithSession(sessionId, sessionLength)
    } catch (e) {
      _parseGenericErrors(e)
      _parseSessionLengthError(e)

      if (e.response && e.response.data === 'Session invalid') {
        return { lastUsedUsername }
      }

      throw e
    }
    const { userId, authToken, username, email, profile, protectedProfile } = apiSignInWithSessionResult

    // overwrite local data if username has been changed on server
    if (username !== lastUsedUsername) {
      localData.saveSeedString(rememberMe, appId, username, savedSeedString)
      localData.removeSeedString(appId, lastUsedUsername)
    }

    // expirationDate should have been extended
    localData.signInSession(rememberMe, username, sessionId, creationDate, apiSignInWithSessionResult.expirationDate)

    // enable idempotent calls to init()
    if (ws.connectionResolved) {
      if (ws.session.sessionId === sessionId) {
        return { user: ws.buildUserResult({ username, userId, authToken: ws.session.authToken, email, profile, protectedProfile, userData: ws.userData }) }
      } else {
        throw new errors.UserAlreadySignedIn(ws.session.username)
      }
    }

    const session = { ...currentSession, username, userId, authToken }
    await _connectWebSocket(session, savedSeedString, rememberMe)

    return { user: ws.buildUserResult({ username, userId, authToken, email, profile, protectedProfile, userData: ws.userData }) }
  } catch (e) {
    if (e.message === 'Invalid seed') return { lastUsedUsername }
    _parseGenericErrors(e)
    throw e
  }
}

const _validateUpdatedUserInput = (params) => {
  if (!objectHasOwnProperty(params, 'username')
    && !objectHasOwnProperty(params, 'newPassword')
    && !objectHasOwnProperty(params, 'email')
    && !objectHasOwnProperty(params, 'profile')
  ) {
    throw new errors.ParamsMissing
  }

  const { username, currentPassword, newPassword, email, profile } = params

  if (objectHasOwnProperty(params, 'username')) _validateUsername(username)
  if (objectHasOwnProperty(params, 'newPassword')) {
    if (!objectHasOwnProperty(params, 'currentPassword')) throw new errors.CurrentPasswordMissing

    _validatePassword(currentPassword)
    _validatePassword(newPassword)
  }

  // if email or profile are falsey, will be set to false
  if (email && typeof email !== 'string') throw new errors.EmailNotValid
  if (profile) _validateProfile(profile)
}

const _buildUpdateUserParams = async (params, newSeed) => {
  if (params.username) params.username = params.username.toLowerCase()

  if (params.newPassword) {
    const [currentPasswordSalts, newPasswordPromise, newKeyData] = await Promise.all([
      _getPasswordSaltsOverWebSocket(),
      _generatePasswordToken(params.newPassword, newSeed || base64.decode(ws.seedString)),
      newSeed && _generateKeys(newSeed)
    ])

    // current password
    const { passwordToken } = await _rebuildPasswordToken(params.currentPassword, currentPasswordSalts)
    params.currentPasswordToken = passwordToken
    delete params.currentPassword

    // new password
    params.passwordToken = newPasswordPromise.passwordToken
    params.passwordSalts = newPasswordPromise.passwordSalts
    params.passwordBasedBackup = newPasswordPromise.passwordBasedBackup
    delete params.newPassword

    if (newKeyData) params.newKeyData = newKeyData
  }

  if (params.email) params.email = params.email.toLowerCase()
  else if (objectHasOwnProperty(params, 'email')) params.email = false // marks email for deletion

  if (!params.profile && objectHasOwnProperty(params, 'profile')) params.profile = false // marks profile for deletion

  return params
}

const updateUser = async (params) => {
  try {
    if (typeof params !== 'object') throw new errors.ParamsMustBeObject

    _validateUpdatedUserInput(params)

    if (ws.reconnecting) throw new errors.Reconnecting
    if (!ws.connectionResolved) throw new errors.UserNotSignedIn
    const startingUserId = ws.session.userId

    // need to generate new seed to rotate keys if user signed in with temp password to delete private data
    const newSeed = params.newPassword && !ws.keys.init && ws.changePassword && await crypto.generateSeed()

    const action = 'UpdateUser'
    const finalParams = await _buildUpdateUserParams({ ...params }, newSeed)

    if (ws.reconnecting) throw new errors.Reconnecting
    if (!ws.connectionResolved) throw new errors.UserNotSignedIn

    // ensures same user still attempting to update
    if (!ws.session || startingUserId !== ws.session.userId) throw new errors.ServiceUnavailable

    try {
      if (finalParams.username) {
        localData.saveSeedString(ws.rememberMe, config.getAppId(), finalParams.username, ws.seedString)
      }

      const response = await ws.request(action, finalParams)
      const updatedUser = response.data.updatedUser
      ws.handleUpdateUser(updatedUser)

      // must have rotated keys successfully
      if (newSeed && ws.session && startingUserId === ws.session.userId) {
        const newSeedString = base64.encode(newSeed)
        await ws.rotateKeys(newSeedString, finalParams.newKeyData)
        localData.saveSeedString(ws.rememberMe, config.getAppId(), updatedUser.username, newSeedString)

        const { sessionId, creationDate, expirationDate } = ws.session
        localData.signInSession(ws.rememberMe, updatedUser.username, sessionId, creationDate, expirationDate)
      }
    } catch (e) {
      _parseUserResponseError(e, finalParams.username)
    }
  } catch (e) {

    switch (e.name) {
      case 'ParamsMustBeObject':
      case 'ParamsMissing':
      case 'UsernameAlreadyExists':
      case 'UsernameMustBeString':
      case 'UsernameCannotBeBlank':
      case 'UsernameTooLong':
      case 'CurrentPasswordMissing':
      case 'CurrentPasswordIncorrect':
      case 'PasswordAttemptLimitExceeded':
      case 'PasswordMustBeString':
      case 'PasswordCannotBeBlank':
      case 'PasswordTooShort':
      case 'PasswordTooLong':
      case 'EmailNotValid':
      case 'ProfileMustBeObject':
      case 'ProfileCannotBeEmpty':
      case 'ProfileHasTooManyKeys':
      case 'ProfileKeyTooLong':
      case 'ProfileValueMustBeString':
      case 'ProfileValueCannotBeBlank':
      case 'ProfileValueTooLong':
      case 'AppIdNotSet':
      case 'AppIdNotValid':
      case 'UserNotFound':
      case 'UserNotSignedIn':
      case 'TooManyRequests':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }

  }
}

const deleteUser = async () => {
  try {
    _checkSignedInState()

    const username = ws.session.username
    localData.removeSeedString(config.getAppId(), username)
    localData.removeCurrentSession()

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
      case 'UserMustChangePassword':
      case 'UserNotSignedIn':
      case 'UserNotFound':
      case 'TooManyRequests':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }

  }
}

const _getMasterKeyAndKeyNotFoundMessage = async (appId, username) => {
  const seedString = localData.getSeedString(appId, username)
  if (!seedString) throw new errors.KeyNotFound(KEY_NOT_FOUND_ON_FORGOT_PASSWORD)
  const seed = base64.decode(seedString)
  const masterKey = await crypto.hkdf.importHkdfKey(seed)
  return masterKey
}

const forgotPassword = async (params) => {
  try {
    if (typeof params !== 'object') throw new errors.ParamsMustBeObject
    if (objectHasOwnProperty(params, 'deleteEndToEndEncryptedData') && typeof params.deleteEndToEndEncryptedData !== 'boolean') {
      throw new errors.DeleteEndToEndEncryptedDataMustBeBoolean
    }
    if (!objectHasOwnProperty(params, 'username')) throw new errors.UsernameMissing

    _validateUsername(params.username)
    const username = params.username.toLowerCase()

    const appId = config.getAppId()

    const url = `${getWsUrl(config.getEndpoint())}/api/auth/forgot-password?appId=${appId}&username=${encodeURIComponent(username)}&userbaseJsVersion=${config.USERBASE_JS_VERSION}`
    const forgotPasswordWs = new WebSocket(url + (objectHasOwnProperty(params, 'deleteEndToEndEncryptedData')
      ? `&deleteEndToEndEncryptedData=${params.deleteEndToEndEncryptedData}` : ''))

    await new Promise((resolve, reject) => {
      setTimeout(() => reject(new errors.Timeout), 15000)

      forgotPasswordWs.onerror = () => reject(new errors.ServiceUnavailable)

      forgotPasswordWs.onmessage = async (e) => {
        try {
          const message = JSON.parse(e.data)

          switch (message.route) {

            // users created with userbase-js < v2.0.0 that have not signed in yet will need to prove access to DH key by decrypting token
            case 'ReceiveEncryptedToken': {
              const masterKey = await _getMasterKeyAndKeyNotFoundMessage(appId, username)

              // if client decrypts encrypted token successfully, proves to server it has the user's key
              const encryptedForgotPasswordToken = new Uint8Array(message.encryptedForgotPasswordToken.data)

              const dhPrivateKey = await crypto.diffieHellman.importKeyFromMaster(masterKey, base64.decode(message.dhKeySalt))
              const sharedKey = await crypto.diffieHellman.getSharedKeyWithServer(dhPrivateKey)

              let forgotPasswordToken
              try {
                // if it fails to decrypt, it's almost certainly because key is incorrect
                forgotPasswordToken = base64.encode(await crypto.aesGcm.decrypt(sharedKey, encryptedForgotPasswordToken))
              } catch {
                throw new errors.KeyNotFound(KEY_NOT_FOUND_ON_FORGOT_PASSWORD)
              }

              forgotPasswordWs.send(JSON.stringify({
                action: 'ForgotPassword',
                params: { forgotPasswordToken }
              }))

              break
            }

            // users signed in with userbase-js >= v2.0.1 will need to prove access to ECDSA key by signing token
            case 'ReceiveToken': {
              const masterKey = await _getMasterKeyAndKeyNotFoundMessage(appId, username)

              const {
                ecdsaKeyEncryptionKeySalt,
                encryptedEcdsaPrivateKey,
                forgotPasswordToken,
              } = message

              const ecdsaKeyEncryptionKey = await crypto.ecdsa.importEcdsaKeyEncryptionKeyFromMaster(masterKey, base64.decode(ecdsaKeyEncryptionKeySalt))

              let ecdsaPrivateKey
              try {
                // if it fails to decrypt, it's almost certainly because key is incorrect
                const rawEcdsaPrivateKey = await crypto.aesGcm.decrypt(ecdsaKeyEncryptionKey, base64.decode(encryptedEcdsaPrivateKey))
                ecdsaPrivateKey = await crypto.ecdsa.getPrivateKeyFromRawPrivateKey(rawEcdsaPrivateKey)
              } catch {
                throw new errors.KeyNotFound(KEY_NOT_FOUND_ON_FORGOT_PASSWORD)
              }

              const signedForgotPasswordToken = base64.encode(await crypto.ecdsa.sign(ecdsaPrivateKey, base64.decode(forgotPasswordToken)))

              forgotPasswordWs.send(JSON.stringify({
                action: 'ForgotPassword',
                params: { signedForgotPasswordToken }
              }))

              break
            }

            case 'SuccessfullyForgotPassword': {
              // server has sent the email
              resolve()
              break
            }

            case 'Error': {
              const data = message.data

              switch (data.name) {
                case 'UsernameTooLong': throw new errors.UsernameTooLong(data.maxLen)
                case 'AppIdNotValid': throw new errors.AppIdNotValid
                case 'UserNotFound': throw new errors.UserNotFound
                case 'UserEmailNotFound': throw new errors.UserEmailNotFound

                default: {
                  if (message.status === statusCodes['Internal Server Error']) throw new errors.ServiceUnavailable
                  else throw new errors.UnknownServiceUnavailable(data)
                }
              }
            }

            case 'Ping': {
              // ignore -- websocket connection should only exist for the life of the forgot password request
              break
            }

            default:
              reject(new Error(`Received unknown message from userbase-server: ${e.data}`))
          }
        } catch (e) {
          reject(e)
        }
      }
    })

    forgotPasswordWs.close()
  } catch (e) {

    switch (e.name) {
      case 'ParamsMustBeObject':
      case 'UsernameMissing':
      case 'UsernameMustBeString':
      case 'UsernameCannotBeBlank':
      case 'UsernameTooLong':
      case 'AppIdNotSet':
      case 'AppIdNotValid':
      case 'KeyNotFound':
      case 'UserNotFound':
      case 'UserEmailNotFound':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)

    }
  }
}

export default {
  signUp,
  signOut,
  signIn,
  init,
  updateUser,
  deleteUser,
  forgotPassword,
}
