import base64 from 'base64-arraybuffer'
import copy from 'copy-to-clipboard'
import api from './api'
import ws from './ws'
import db from './db'
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
    } else if (e.response.status === statusCodes['Internal Server Error']) {
      throw new errors.InternalServerError
    } else if (e.response.status === statusCodes['Gateway Timeout']) {
      throw new errors.Timeout
    }
  } else if (e.message && e.message.includes('timeout')) {
    throw new errors.Timeout
  }
}

const _connectWebSocket = async (appId, sessionId, username, seed, rememberMe, passwordBasedKeyRecoveryEnabled) => {
  try {
    const seedString = await ws.connect(appId, sessionId, username, seed, rememberMe, passwordBasedKeyRecoveryEnabled)
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

const _generateKeysAndSignUp = async (username, password, seed, email, profile, passwordBasedKeyRecoveryEnabled) => {
  const passwordSecureHash = await crypto.sha256.hashString(password)

  let pbkdfKeySalt, passwordEncryptedSeed
  if (passwordBasedKeyRecoveryEnabled) {
    pbkdfKeySalt = await crypto.pbkdf.generateSalt()
    const passwordBasedEncryptionKey = await crypto.pbkdf.importKey(password, pbkdfKeySalt)
    passwordEncryptedSeed = await crypto.aesGcm.encrypt(passwordBasedEncryptionKey, seed)
  }

  const masterKey = await crypto.hkdf.importMasterKey(seed)

  const encryptionKeySalt = crypto.hkdf.generateSalt()
  const dhKeySalt = crypto.hkdf.generateSalt()
  const hmacKeySalt = crypto.hkdf.generateSalt()

  const dhPrivateKey = await crypto.diffieHellman.importKeyFromMaster(masterKey, dhKeySalt)
  const publicKey = crypto.diffieHellman.getPublicKey(dhPrivateKey)

  try {
    const session = await api.auth.signUp(
      username,
      passwordSecureHash,
      base64.encode(publicKey),
      base64.encode(encryptionKeySalt),
      base64.encode(dhKeySalt),
      base64.encode(hmacKeySalt),
      email,
      profile,
      pbkdfKeySalt && base64.encode(pbkdfKeySalt),
      passwordEncryptedSeed && base64.encode(passwordEncryptedSeed)
    )
    return session
  } catch (e) {
    _parseUserResponseError(e, username)
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

const displayShowKeyModal = (seedString, rememberMe, passwordBasedKeyRecoveryEnabled) => new Promise(resolve => {
  const showKeyModal = document.createElement('div')
  showKeyModal.className = 'userbase-modal'

  let message = ' '
  if (rememberMe && !passwordBasedKeyRecoveryEnabled) {
    message += 'You will need your secret key to sign in on other devices.'
  } else if (rememberMe && passwordBasedKeyRecoveryEnabled) {
    message += 'If you forget your password, you will need your secret key to sign in on other devices.'
  } else if (!rememberMe && !passwordBasedKeyRecoveryEnabled) {
    message += 'Without your secret key, you will not be able to log in to your account.'
  } else if (!rememberMe && passwordBasedKeyRecoveryEnabled) {
    message += 'If you forget your password, you will not be able to log in to your account without your secret key.'
  }

  showKeyModal.innerHTML = `
    <div class='userbase-container'>

      <div class='userbase-text-line'>
        Your secret key:
      </div>

      <div class='userbase-table'>
        <div class='userbase-table-row'>
          <div class='userbase-table-cell'>
            <div class='userbase-display-key'>
              ${seedString}
            </div>
          </div>
        </div>
      </div>

      <div id='userbase-secret-key-button-outer-wrapper'>
        <div id='userbase-secret-key-button-input-wrapper'>
          <input
            id='userbase-show-key-modal-copy-button'
            class='userbase-button'
            type='button'
            value='Copy'
          />

          <input
            id='userbase-show-key-modal-close-button'
            class='userbase-button-cancel'
            type='button'
            value='Close'
          />
        </div>

        <div id='userbase-show-key-modal-copied-key-message' class='userbase-message'>
          Key copied to clipboard
        </div>
      </div>

      <div>
        <hr class='userbase-divider'>
        </hr>
      </div>


    <div>
    <span class='fas userbase-fa-exclamation-triangle' />
    <span class='userbase-text-line'>

    Store this key somewhere safe.${message}

    </span>
    </div>

    </div>
  `

  document.body.appendChild(showKeyModal)

  const copyButton = document.getElementById('userbase-show-key-modal-copy-button')
  const copiedKeyMessage = document.getElementById('userbase-show-key-modal-copied-key-message')
  const closeButton = document.getElementById('userbase-show-key-modal-close-button')

  function copyKey() {
    copy(seedString)
    copiedKeyMessage.style.display = 'block'
  }

  function hideShowKeyModal() {
    document.body.removeChild(showKeyModal)
    resolve()
  }

  copyButton.onclick = copyKey
  closeButton.onclick = hideShowKeyModal
})

const signUp = async (username, password, email, profile, showKeyHandler, rememberMe = false, passwordBasedKeyRecoveryEnabled = true) => {
  try {
    _validateSignUpOrSignInInput(username, password)
    if (profile) _validateProfile(profile)
    if (showKeyHandler && typeof showKeyHandler !== 'function') throw new errors.ShowKeyHandlerMustBeFunction

    const appId = config.getAppId()
    const lowerCaseUsername = username.toLowerCase()

    const seed = await crypto.generateSeed()

    const lowerCaseEmail = email && email.toLowerCase()

    const session = await _generateKeysAndSignUp(lowerCaseUsername, password, seed, lowerCaseEmail, profile, passwordBasedKeyRecoveryEnabled)
    const { sessionId, creationDate } = session

    const seedString = base64.encode(seed)

    if (showKeyHandler) {
      await showKeyHandler(seedString, rememberMe, passwordBasedKeyRecoveryEnabled)
    } else {
      await displayShowKeyModal(seedString, rememberMe, passwordBasedKeyRecoveryEnabled)
    }

    if (rememberMe) {
      localData.saveSeedString(lowerCaseUsername, seedString)
      localData.signInSession(lowerCaseUsername, sessionId, creationDate)
    }

    await _connectWebSocket(appId, sessionId, lowerCaseUsername, seedString, rememberMe, passwordBasedKeyRecoveryEnabled)

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

const _getSeedStringFromPasswordBasedBackup = async (password, passwordBasedBackup) => {
  try {
    const { pbkdfKeySalt, passwordEncryptedSeed } = passwordBasedBackup

    const passwordBasedEncryptionKey = await crypto.pbkdf.importKey(password, base64.decode(pbkdfKeySalt))
    const seedFromBackup = await crypto.aesGcm.decrypt(passwordBasedEncryptionKey, base64.decode(passwordEncryptedSeed))
    const seedStringFromBackup = base64.encode(seedFromBackup)

    return seedStringFromBackup
  } catch (e) {
    // possible it fails because user provides temp password rather than actual password. Allow failure
    return null
  }
}

const _signInWrapper = async (username, passwordSecureHash) => {
  try {
    const { session, email, profile, passwordBasedBackup } = await api.auth.signIn(username, passwordSecureHash)
    return { session, email, profile, passwordBasedBackup }
  } catch (e) {
    _parseGenericErrors(e)
    _parseGenericUsernamePasswordError(e)

    if (e.response && e.response.data === 'Invalid password') {
      throw new errors.UsernameOrPasswordMismatch
    }

    throw e
  }
}

const signIn = async (username, password, rememberMe = false) => {
  try {
    _validateSignUpOrSignInInput(username, password)

    const appId = config.getAppId()
    const lowerCaseUsername = username.toLowerCase()
    const passwordSecureHash = await crypto.sha256.hashString(password)

    const { session, email, profile, passwordBasedBackup } = await _signInWrapper(lowerCaseUsername, passwordSecureHash)
    const { sessionId, creationDate } = session

    const savedSeedString = localData.getSeedString(lowerCaseUsername) // might be null if does not have seed saved

    let seedStringFromBackup
    if (!savedSeedString && passwordBasedBackup) {
      seedStringFromBackup = await _getSeedStringFromPasswordBasedBackup(password, passwordBasedBackup)
    }

    if (rememberMe) localData.signInSession(lowerCaseUsername, sessionId, creationDate)

    const passwordBasedKeyRecoveryEnabled = passwordBasedBackup ? true : false

    const seedString = await _connectWebSocket(appId, sessionId, username, savedSeedString || seedStringFromBackup, rememberMe, passwordBasedKeyRecoveryEnabled)

    if (rememberMe && !savedSeedString) localData.saveSeedString(lowerCaseUsername, seedString)

    await ws.getRequestsForSeed()
    await ws.getDatabaseAccessGrants()

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

const init = async ({ appId, endpoint, keyNotFoundHandler }) => {
  try {
    if (ws.connected) throw new errors.UserAlreadySignedIn(ws.username)
    config.configure({ appId, endpoint, keyNotFoundHandler })

    const session = await signInWithSession(appId)
    return session
  } catch (e) {

    switch (e.name) {
      case 'AppIdMustBeString':
      case 'AppIdCannotBeBlank':
      case 'AppIdNotValid':
      case 'KeyNotFoundHandlerMustBeFunction':
      case 'UserAlreadySignedIn':
      case 'UserCanceledSignIn':
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
    const { email, profile, passwordBasedBackup } = apiSignInWithSessionResult

    const savedSeedString = localData.getSeedString(username) // might be null if does not have seed saved

    const passwordBasedKeyRecoveryEnabled = passwordBasedBackup ? true : false

    const seedString = await _connectWebSocket(appId, sessionId, username, savedSeedString, false, passwordBasedKeyRecoveryEnabled)

    await ws.getRequestsForSeed()
    await ws.getDatabaseAccessGrants()

    return { user: _buildUserResult(username, seedString, email, profile) }
  } catch (e) {
    _parseGenericErrors(e)
    throw e
  }
}

const grantDatabaseAccess = async (dbName, username, readOnly) => {
  try {
    const database = db.getOpenDb(dbName)
    _validateUsername(username)

    const lowerCaseUsername = username.toLowerCase()

    let action = 'GetPublicKey'
    let params = { username: lowerCaseUsername }

    try {
      const granteePublicKeyResponse = await ws.request(action, params)
      const granteePublicKey = granteePublicKeyResponse.data

      await ws.grantDatabaseAccess(database, username, granteePublicKey, readOnly)
    } catch (e) {
      _parseGenericErrors(e)

      if (e.message === 'User not found') {
        throw new errors.UserNotFound
      } else if (e.message === 'UserCannotBeYou') {
        throw new errors.UserCannotBeYou
      }

      throw e
    }
  } catch (e) {

    switch (e.name) {
      case 'UserNotSignedIn':
      case 'UserNotFound':
      case 'UserCannotBeYou':
      case 'DatabaseNameMustBeString':
      case 'DatabaseNameCannotBeBlank':
      case 'DatabaseNameTooLong':
      case 'DatabaseNotOpen':
      case 'UsernameCannotBeBlank':
      case 'UsernameMustBeString':
      case 'UsernameTooLong':
      case 'AppIdNotValid':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.ServiceUnavailable
    }

  }
}

const importKey = async (keyString) => {
  try {
    if (typeof keyString !== 'string') throw new errors.KeyMustBeString
    if (keyString.length === 0) throw new errors.KeyCannotBeBlank

    if (!ws.connected) throw new errors.UserNotSignedIn

    try {
      await ws.saveSeed(keyString)
    } catch (e) {
      _parseGenericErrors(e)
      throw e
    }

  } catch (e) {

    switch (e.name) {
      case 'KeyMustBeString':
      case 'KeyCannotBeBlank':
      case 'KeyNotValid':
      case 'UserNotSignedIn':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.ServiceUnavailable
    }
  }
}

const forgotPassword = async (username) => {
  try {
    _validateUsername(username)

    try {
      await api.auth.forgotPassword(username)
    } catch (e) {
      _parseGenericErrors(e)

      if (e.response) {
        if (e.response.data === 'UserNotFound') {
          throw new errors.UserNotFound
        } else if (e.response.data === 'UserEmailNotFound') {
          throw new errors.UserEmailNotFound
        }
      }

      throw e
    }

  } catch (e) {

    switch (e.name) {
      case 'UsernameCannotBeBlank':
      case 'UsernameMustBeString':
      case 'AppIdNotSet':
      case 'AppIdNotValid':
      case 'UserNotFound':
      case 'UserEmailNotFound':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.ServiceUnavailable

    }
  }
}

const _validateUpdatedUserInput = (user) => {
  if (typeof user !== 'object') throw new errors.UserMustBeObject

  const { username, password, profile } = user

  if (!objectHasOwnProperty(user, 'username')
    && !objectHasOwnProperty(user, 'password')
    && !objectHasOwnProperty(user, 'email')
    && !objectHasOwnProperty(user, 'profile')
  ) {
    throw new errors.UserMissingExpectedProperties
  }

  if (objectHasOwnProperty(user, 'username')) _validateUsername(username)
  if (objectHasOwnProperty(user, 'password')) _validatePassword(password)
  if (profile) _validateProfile(profile) // if profile is falsey, gets set to false
}

const _buildUpdateUserParams = async (user) => {
  const params = { ...user }
  if (params.username) params.username = params.username.toLowerCase()

  if (params.password) {
    params.passwordSecureHash = await crypto.sha256.hashString(params.password)

    if (ws.passwordBasedKeyRecoveryEnabled) {
      const pbkdfKeySalt = await crypto.pbkdf.generateSalt()
      const passwordBasedEncryptionKey = await crypto.pbkdf.importKey(params.password, pbkdfKeySalt)
      const passwordEncryptedSeed = await crypto.aesGcm.encrypt(passwordBasedEncryptionKey, base64.decode(ws.seedString))

      params.pbkdfKeySalt = base64.encode(pbkdfKeySalt)
      params.passwordEncryptedSeed = base64.encode(passwordEncryptedSeed)
    }

    delete params.password
  }

  if (params.email) params.email = params.email.toLowerCase()
  else if (objectHasOwnProperty(params, 'email')) params.email = false // marks email for deletion

  if (!params.profile && objectHasOwnProperty(params, 'profile')) params.profile = false // marks profile for deletion

  return params
}

const updateUser = async (user) => {
  try {
    _validateUpdatedUserInput(user)

    const action = 'UpdateUser'
    const params = await _buildUpdateUserParams(user)

    if (!ws.keys.init) throw new errors.UserNotSignedIn
    try {
      if (ws.rememberMe && params.username) localData.saveSeedString(params.username, ws.seedString)

      await ws.request(action, params)

      if (params.username) ws.username = params.username // eslint-disable-line require-atomic-updates
    } catch (e) {
      _parseUserResponseError(e, params.username)
    }
  } catch (e) {

    switch (e.name) {
      case 'UserMustBeObject':
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
      case 'UserNotSignedIn':
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
  getLastUsedUsername,
  init,
  grantDatabaseAccess,
  importKey,
  forgotPassword,
  updateUser
}
