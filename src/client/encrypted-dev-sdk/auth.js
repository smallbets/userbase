import uuidv4 from 'uuid/v4'
import axios from 'axios'
import crypto from './Crypto'
import stateManager from './stateManager'

const _setCurrentSession = (username, sessionId) => {
  const currentSession = { username, sessionId }
  const currentSessionString = JSON.stringify(currentSession)
  localStorage.setItem('currentSession', currentSessionString)
}

const getCurrentSession = () => {
  const currentSessionString = localStorage.getItem('currentSession')
  const currentSession = JSON.parse(currentSessionString)
  return currentSession
}

const saveKeyToLocalStorage = async (username, key) => {
  const keyString = await crypto.aesGcm.getKeyStringFromKey(key)
  localStorage.setItem(username, keyString)
}

const getKeyFromLocalStorage = async () => {
  const currentSession = getCurrentSession()
  const username = currentSession.username

  const keyString = localStorage.getItem(username)
  const key = await crypto.aesGcm.getKeyFromKeyString(keyString)
  return key
}

const signUp = async (username, password) => {
  const symmetricKey = await crypto.aesGcm.generateKey()
  await saveKeyToLocalStorage(username, symmetricKey)

  const response = await axios.post('/api/auth/sign-up', {
    username,
    password,
    userId: uuidv4()
  })
  const sessionId = response.data

  _setCurrentSession(username, sessionId)

  return sessionId
}

const signOut = async () => {
  await axios.post('/api/auth/sign-out')

  const currentSession = getCurrentSession()
  _setCurrentSession(currentSession.username, null)

  stateManager.clearState()
}

const signIn = async (username, password) => {
  const response = await axios.post('/api/auth/sign-in', {
    username,
    password
  })
  const sessionId = response.data

  _setCurrentSession(username, sessionId)

  return sessionId
}

export default {
  getCurrentSession,
  saveKeyToLocalStorage,
  getKeyFromLocalStorage,
  signUp,
  signOut,
  signIn,
}
