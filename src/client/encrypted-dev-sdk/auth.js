import uuidv4 from 'uuid/v4'
import server from './server'
import crypto from './Crypto'
import base64 from 'base64-arraybuffer'
import stateManager from './stateManager'

const _setCurrentSession = (username, signedIn) => {
  const session = { username, signedIn }
  const sessionString = JSON.stringify(session)
  localStorage.setItem('currentSession', sessionString)
  return session
}

const getCurrentSession = () => {
  const currentSessionString = localStorage.getItem('currentSession')
  const currentSession = JSON.parse(currentSessionString)
  return currentSession
}

const saveKeyToLocalStorage = async (username, key) => {
  const keyString = await crypto.aesGcm.getKeyStringFromKey(key)
  localStorage.setItem('key.' + username, keyString)
}

const getKeyFromLocalStorage = async () => {
  const currentSession = getCurrentSession()
  if (!currentSession) {
    return undefined
  }

  const username = currentSession.username
  const keyString = localStorage.getItem('key.' + username)

  if (!keyString) {
    return undefined
  }

  const key = await crypto.aesGcm.getKeyFromKeyString(keyString)
  return key
}

const getKey = async () => {
  const key = await getKeyFromLocalStorage()
  if (!key) {
    return undefined
  }
  const rawKey = await crypto.aesGcm.exportRawKey(key)
  const base64Key = base64.encode(rawKey)
  return base64Key
}

const saveKey = async (base64Key) => {
  const rawKey = base64.decode(base64Key)
  const key = await crypto.aesGcm.importRawKey(rawKey)
  const currentSession = getCurrentSession()
  saveKeyToLocalStorage(currentSession.username, key)
}

const signUp = async (username, password) => {
  const lowerCaseUsername = username.toLowerCase()
  const userId = uuidv4()

  const aesKey = await crypto.aesGcm.generateKey()
  const rawAesKey = await crypto.aesGcm.exportRawKey(aesKey)
  const { publicKey, sharedSecret } = crypto.diffieHellman.createDiffieHellmanUsingAesKey(rawAesKey)

  const encryptedValidationMessage = await server.auth.signUp(
    lowerCaseUsername, password, userId, publicKey
  )

  const sharedKeyArrayBuffer = await crypto.sha256.hash(sharedSecret)
  const sharedKey = await crypto.aesGcm.importRawKey(sharedKeyArrayBuffer)

  const validationMessage = await crypto.aesGcm.decrypt(sharedKey, encryptedValidationMessage)

  // Saves to local storage before validation to ensure user has it.
  // Warning: if user hits the sign up button twice,
  // it's possible the key will be overwritten here and will be lost
  await saveKeyToLocalStorage(lowerCaseUsername, aesKey)

  await server.auth.validateKey(validationMessage)

  const signedIn = true
  const session = _setCurrentSession(lowerCaseUsername, signedIn)
  return session
}

const clearAuthenticatedDataFromBrowser = () => {
  stateManager.clearState()

  const currentSession = getCurrentSession()
  const signedIn = false
  return _setCurrentSession(currentSession.username, signedIn)
}

const signOut = async () => {
  const session = clearAuthenticatedDataFromBrowser()

  await server.auth.signOut()

  return session
}

const signIn = async (username, password) => {
  const lowerCaseUsername = username.toLowerCase()

  await server.auth.signIn(lowerCaseUsername, password)

  const signedIn = true
  const session = _setCurrentSession(lowerCaseUsername, signedIn)
  return session
}

export default {
  getCurrentSession,
  getKeyFromLocalStorage,
  getKey,
  saveKey,
  signUp,
  clearAuthenticatedDataFromBrowser,
  signOut,
  signIn,
}
