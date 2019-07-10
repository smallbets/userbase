import uuidv4 from 'uuid/v4'
import axios from 'axios'
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
  const symmetricKey = await crypto.aesGcm.generateKey()
  const lowerCaseUsername = username.toLowerCase()

  await saveKeyToLocalStorage(lowerCaseUsername, symmetricKey)

  await axios.post('/api/auth/sign-up', {
    username: lowerCaseUsername,
    password,
    userId: uuidv4()
  })

  const signedIn = true
  const session = _setCurrentSession(lowerCaseUsername, signedIn)
  return session
}

const signOut = async () => {
  await axios.post('/api/auth/sign-out')

  const currentSession = getCurrentSession()
  const signedIn = false
  const session = _setCurrentSession(currentSession.username, signedIn)

  stateManager.clearState()
  return session
}

const signIn = async (username, password) => {
  const lowerCaseUsername = username.toLowerCase()

  await axios.post('/api/auth/sign-in', {
    username: lowerCaseUsername,
    password
  })

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
  signOut,
  signIn,
}
