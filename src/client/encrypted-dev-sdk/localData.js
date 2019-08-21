import base64 from 'base64-arraybuffer'
import crypto from './Crypto'

const setCurrentSession = (username, signedIn) => {
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

const saveKeyStringToLocalStorage = async (keyString) => {
  const currentSession = getCurrentSession()

  const rawKey = base64.decode(keyString)
  await crypto.aesGcm.getKeyFromRawKey(rawKey) // ensures key is valid, would throw if invalid

  localStorage.setItem('key.' + currentSession.username, keyString)
}

const saveKeyToLocalStorage = async (username, key) => {
  const keyString = await crypto.aesGcm.getKeyStringFromKey(key)
  localStorage.setItem('key.' + username, keyString)
}

const getKeyStringFromLocalStorage = () => {
  const currentSession = getCurrentSession()
  if (!currentSession) {
    return undefined
  }

  const username = currentSession.username
  const keyString = localStorage.getItem('key.' + username)
  return keyString
}

const getKeyFromLocalStorage = async () => {
  const keyString = getKeyStringFromLocalStorage()

  if (!keyString) {
    return undefined
  }

  const key = await crypto.aesGcm.getKeyFromKeyString(keyString)
  return key
}

const getRawKeyByUsername = async (username) => {
  const keyString = localStorage.getItem('key.' + username)
  if (!keyString) {
    return undefined
  }
  const rawKey = base64.decode(keyString)
  return rawKey
}

const clearAuthenticatedDataFromBrowser = () => {
  const currentSession = getCurrentSession()
  const signedIn = false
  return setCurrentSession(currentSession.username, signedIn)
}

export default {
  setCurrentSession,
  getCurrentSession,
  getKeyFromLocalStorage,
  getKeyStringFromLocalStorage,
  getRawKeyByUsername,
  saveKeyStringToLocalStorage,
  saveKeyToLocalStorage,
  clearAuthenticatedDataFromBrowser,
}
