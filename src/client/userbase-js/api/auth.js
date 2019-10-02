import axios from 'axios'
import { readArrayBufferAsString } from '../utils'
import ws from '../ws'

const TEN_SECONDS_MS = 10 * 1000
const TIMEOUT = TEN_SECONDS_MS

const signUp = async (username, password, userId, publicKey, encryptionKeySalt, dhKeySalt, hmacKeySalt) => {
  try {
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
      responseType: 'arraybuffer',
      timeout: TIMEOUT
    })
    const encryptedValidationMessage = signUpResponse.data
    return encryptedValidationMessage
  } catch (e) {
    if (e.response && e.response.data) {
      // necessary conversion for arraybuffer response type
      e.response.data = JSON.parse(await readArrayBufferAsString(e.response.data))
    }

    throw e
  }
}

const signOut = async () => {
  await axios({
    method: 'POST',
    url: `${ws.endpoint}/api/auth/sign-out`,
    timeout: TIMEOUT
  })
}

const signIn = async (username, password) => {
  await axios({
    method: 'POST',
    url: `${ws.endpoint}/api/auth/sign-in`,
    data: {
      username,
      password
    },
    timeout: TIMEOUT
  })
}

export default {
  signUp,
  signOut,
  signIn,
}
