import axios from 'axios'
import ws from '../ws'
import config from '../config'

const TEN_SECONDS_MS = 10 * 1000

const signUp = async (username, password, publicKey, encryptionKeySalt, dhKeySalt, hmacKeySalt) => {
  const signUpResponse = await axios({
    method: 'POST',
    url: `${ws.endpoint}/api/auth/sign-up?appId=${config.getAppId()}`,
    data: {
      username,
      password,
      publicKey,
      encryptionKeySalt,
      dhKeySalt,
      hmacKeySalt
    },
    timeout: TEN_SECONDS_MS
  })

  const sessionId = signUpResponse.data
  return sessionId
}

const signIn = async (username, password) => {
  const signInResponse = await axios({
    method: 'POST',
    url: `${ws.endpoint}/api/auth/sign-in?appId=${config.getAppId()}`,
    data: {
      username,
      password
    },
    timeout: TEN_SECONDS_MS
  })

  const sessionId = signInResponse.data
  return sessionId
}

const signInWithSession = async (sessionId) => {
  const signInWithSessionResponse = await axios({
    method: 'POST',
    url: `${ws.endpoint}/api/auth/sign-in-with-session?appId=${config.getAppId()}&sessionId=${sessionId}`,
    timeout: TEN_SECONDS_MS
  })

  const extendedDate = signInWithSessionResponse.data
  return extendedDate
}

export default {
  signUp,
  signIn,
  signInWithSession,
}
