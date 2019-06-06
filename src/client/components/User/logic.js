import axios from 'axios'
import crypto from '../Crypto'

const signUp = async (username, password) => {
  try {
    const symmetricKey = await crypto.aesGcm.generateKey()
    await crypto.aesGcm.saveKeyToLocalStorage(symmetricKey)
  } catch (e) {
    return { error: 'Failed to save an encryption key' }
  }

  try {
    const response = await axios.post('/api/auth/sign-up', {
      username,
      password
    })
    return { user: response.data }
  } catch (e) {
    console.log('Failed to sign up with', e, e.response && e.response.data)
    const errorMsg = (e.response && e.response.data.readableMessage) || e.message
    return { error: errorMsg }
  }
}

const signOut = async () => {
  try {
    const response = await axios.post('/api/auth/sign-out')
    return { response }
  } catch (e) {
    console.log('Failed to sign out with', e, e.response && e.response.data)
    const errorMsg = (e.response && e.response.data.readableMessage) || e.message
    return { error: errorMsg }
  }
}

const signIn = async (username, password) => {
  try {
    const response = await axios.post('/api/auth/sign-in', {
      username,
      password
    })
    return { user: response.data }
  } catch (e) {
    console.log('Failed to sign in with', e, e.response && e.response.data)
    const errorMsg = (e.response && e.response.data.readableMessage) || e.message
    return { error: errorMsg }
  }
}

const query = async () => {
  try {
    const response = await axios.get('/api/user/query')
    return { user: response.data }
  } catch (e) {
    console.log('Failed to query for user with', e, e.response && e.response.data)
    const errorMsg = (e.response && e.response.data.readableMessage) || e.message
    return { error: errorMsg }
  }
}

export default {
  signUp,
  signOut,
  signIn,
  query
}
