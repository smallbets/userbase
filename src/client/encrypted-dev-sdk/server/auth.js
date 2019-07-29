import axios from 'axios'

const TEN_SECONDS_MS = 10 * 1000
const TIMEOUT = TEN_SECONDS_MS

const signUp = async (username, password, userId, publicKey) => {
  const signUpResponse = await axios({
    method: 'POST',
    url: '/api/auth/sign-up',
    data: {
      username,
      password,
      userId,
      publicKey
    },
    responseType: 'arraybuffer',
    timeout: TIMEOUT
  })
  const encryptedValidationMessage = signUpResponse.data
  return encryptedValidationMessage
}

const validateKey = async (validationMessage) => {
  await axios({
    method: 'POST',
    url: '/api/auth/validate-key',
    data: validationMessage,
    timeout: TIMEOUT
  })
}

const signOut = async () => {
  await axios({
    method: 'POST',
    url: '/api/auth/sign-out',
    timeout: TIMEOUT
  })
}

const signIn = async (username, password) => {
  await axios({
    method: 'POST',
    url: '/api/auth/sign-in',
    data: {
      username,
      password
    },
    timeout: TIMEOUT
  })
}

export default {
  signUp,
  validateKey,
  signOut,
  signIn,
}
