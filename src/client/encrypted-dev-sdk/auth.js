import uuidv4 from 'uuid/v4'
import axios from 'axios'
import crypto from './Crypto'
import stateManager from './stateManager'

const _setCurrentSession = (username, sessionId) => {
  const session = { username, sessionId }
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
  const username = currentSession.username

  const keyString = localStorage.getItem('key.' + username)
  const key = await crypto.aesGcm.getKeyFromKeyString(keyString)
  return key
}

const signUp = async (username, password) => {
  const symmetricKey = await crypto.aesGcm.generateKey()

  const lowerCaseUsername = username.toLowerCase()
  await saveKeyToLocalStorage(lowerCaseUsername, symmetricKey)

  const response = await axios.post('/api/auth/sign-up', {
    username: lowerCaseUsername,
    password,
    userId: uuidv4()
  })
  const sessionId = response.data

  const session = _setCurrentSession(lowerCaseUsername, sessionId)
  return session
}

const signOut = async () => {
  await axios.post('/api/auth/sign-out')

  const currentSession = getCurrentSession()
  _setCurrentSession(currentSession.username, null)

  stateManager.clearState()
}

const signIn = async (username, password) => {
  const lowerCaseUsername = username.toLowerCase()

  const response = await axios.post('/api/auth/sign-in', {
    username: lowerCaseUsername,
    password
  })
  const sessionId = response.data

  const session = _setCurrentSession(lowerCaseUsername, sessionId)
  return session
}

export default {
  getCurrentSession,
  saveKeyToLocalStorage,
  getKeyFromLocalStorage,
  signUp,
  signOut,
  signIn,
}
