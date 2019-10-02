import axios from 'axios'
import ws from '../ws'

const TEN_SECONDS_MS = 10 * 1000
const TIMEOUT = TEN_SECONDS_MS

const signUp = async (username, password, userId, publicKey, encryptionKeySalt, dhKeySalt, hmacKeySalt) => {
  const signUpResponse = await axios({
    method: 'POST',
    url: `${ws.endpoint}/api/auth/sign-up`,
    data: {
      username,
      password,
      userId,
      publicKey,
      encryptionKeySalt,
      dhKeySalt,
      hmacKeySalt
    },
    timeout: TIMEOUT
  })

  const sessionId = signUpResponse.data
  return sessionId
}

const signIn = async (username, password) => {
  const signInResponse = await axios({
    method: 'POST',
    url: `${ws.endpoint}/api/auth/sign-in`,
    data: {
      username,
      password
    },
    timeout: TIMEOUT
  })

  const sessionId = signInResponse.data
  return sessionId
}

export default {
  signUp,
  signIn,
}
