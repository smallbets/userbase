import axios from 'axios'
import config from '../config'

const TEN_SECONDS_MS = 10 * 1000

const signUp = async (username, passwordToken, publicKey, salts, email, profile, passwordBasedBackup) => {
  const signUpResponse = await axios({
    method: 'POST',
    url: `${config.getEndpoint()}/api/auth/sign-up?appId=${config.getAppId()}`,
    data: {
      username,
      passwordToken,
      publicKey,
      salts,
      email,
      profile,
      passwordBasedBackup
    },
    timeout: TEN_SECONDS_MS
  })

  return signUpResponse.data
}

const getPasswordSalts = async (username) => {
  const passwordSaltsResponse = await axios({
    method: 'GET',
    url: `${config.getEndpoint()}/api/auth/get-password-salts?appId=${config.getAppId()}&username=${username}`,
    timeout: TEN_SECONDS_MS
  })
  return passwordSaltsResponse.data
}

const signIn = async (username, passwordToken) => {
  const signInResponse = await axios({
    method: 'POST',
    url: `${config.getEndpoint()}/api/auth/sign-in?appId=${config.getAppId()}`,
    data: {
      username,
      passwordToken,
    },
    timeout: TEN_SECONDS_MS
  })

  return signInResponse.data
}

const signInWithSession = async (sessionId) => {
  const signInWithSessionResponse = await axios({
    method: 'POST',
    url: `${config.getEndpoint()}/api/auth/sign-in-with-session?appId=${config.getAppId()}&sessionId=${sessionId}`,
    timeout: TEN_SECONDS_MS
  })

  return signInWithSessionResponse.data
}

const getServerPublicKey = async () => {
  const serverPublicKeyResponse = await axios({
    method: 'GET',
    url: `${config.getEndpoint()}/api/auth/server-public-key`,
    timeout: TEN_SECONDS_MS,
    responseType: 'arraybuffer'
  })

  const serverPublicKey = serverPublicKeyResponse.data
  return serverPublicKey
}

const forgotPassword = async (username) => {
  await axios({
    method: 'POST',
    url: `${config.getEndpoint()}/api/auth/forgot-password?appId=${config.getAppId()}`,
    data: {
      username
    },
    timeout: TEN_SECONDS_MS
  })
}

export default {
  signUp,
  getPasswordSalts,
  signIn,
  signInWithSession,
  getServerPublicKey,
  forgotPassword
}
