import axios from 'axios'
import crypto from './Crypto'

const signUp = async (username, password) => {
  const symmetricKey = await crypto.aesGcm.generateKey()
  await crypto.aesGcm.saveKeyToLocalStorage(symmetricKey)
  return axios.post('/api/auth/sign-up', {
    username,
    password
  })
}

const signOut = async () => axios.post('/api/auth/sign-out')

const signIn = (username, password) => axios.post('/api/auth/sign-in', {
  username,
  password
})


export default {
  signUp,
  signOut,
  signIn
}
