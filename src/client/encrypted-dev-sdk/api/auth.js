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

const requestMasterKey = async (requesterPublicKey) => {
  const senderPublicKeyResponse = await axios({
    method: 'POST',
    url: '/api/auth/request-master-key',
    data: {
      requesterPublicKey: Buffer.from(requesterPublicKey)
    },
    responseType: 'arraybuffer',
    timeout: TIMEOUT
  })
  const senderPublicKey = new Uint8Array(senderPublicKeyResponse.data)
  return senderPublicKey
}

const getMasterKeyRequests = async () => {
  const response = await axios.get('/api/auth/get-master-key-requests')
  const masterKeyRequests = response.data
  return masterKeyRequests
}

const sendMasterKey = async (requesterPublicKey, encryptedMasterKey) => {
  await axios({
    method: 'POST',
    url: '/api/auth/send-master-key',
    data: {
      requesterPublicKey: Buffer.from(requesterPublicKey),
      encryptedMasterKey: Buffer.from(encryptedMasterKey)
    },
    timeout: TIMEOUT
  })
}

const receiveMasterKey = async (requesterPublicKey) => {
  const encryptedMasterKeyResponse = await axios({
    method: 'POST',
    url: '/api/auth/receive-master-key',
    data: {
      requesterPublicKey: Buffer.from(requesterPublicKey)
    },
    responseType: 'arraybuffer',
    timeout: TIMEOUT
  })
  const encryptedMasterKey = encryptedMasterKeyResponse.data
  return encryptedMasterKey
}

export default {
  signUp,
  validateKey,
  signOut,
  signIn,
  requestMasterKey,
  getMasterKeyRequests,
  sendMasterKey,
  receiveMasterKey
}
