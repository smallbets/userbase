import uuidv4 from 'uuid/v4'
import axios from 'axios'
import crypto from './Crypto'
import stateManager from './stateManager'

const signUp = async (username, password) => {
  const symmetricKey = await crypto.aesGcm.generateKey()
  await crypto.aesGcm.saveKeyToLocalStorage(symmetricKey)
  const response = await axios.post('/api/auth/sign-up', {
    username,
    password,
    userId: uuidv4()
  })
  localStorage.setItem('signedIn', true)
  const user = response.data
  return user
}

const signOut = async () => {
  await axios.post('/api/auth/sign-out')
  localStorage.removeItem('signedIn')
  stateManager.clearState()
}

const signIn = async (username, password) => {
  const response = await axios.post('/api/auth/sign-in', {
    username,
    password
  })
  localStorage.setItem('signedIn', true)
  const user = response.data
  return user
}

const isUserSignedIn = async () => {
  const signedIn = localStorage.getItem('signedIn')
  if (!signedIn) return false
  const response = await axios.get('/api/user/find')
  const user = response.data
  return user
}

export default {
  signUp,
  signOut,
  signIn,
  isUserSignedIn
}
