import base64 from 'base64-arraybuffer'
import hkdf from './hkdf'
import sha256 from './sha-256'
import { stringToArrayBuffer } from './utils'

const HMAC_KEY_NAME = 'authentication'

const ALGORITHM_NAME = 'HMAC'
const KEY_IS_EXTRACTABLE = false
const KEY_WILL_BE_USED_TO = ['sign']

const importKeyFromMaster = async (masterKey, salt) => {
  const hmacKey = await window.crypto.subtle.deriveKey(
    hkdf.getParams(HMAC_KEY_NAME, salt),
    masterKey,
    {
      name: ALGORITHM_NAME,
      hash: {
        name: sha256.HASH_ALGORITHM_NAME
      }
    },
    KEY_IS_EXTRACTABLE,
    KEY_WILL_BE_USED_TO
  )
  return hmacKey
}

/**
 *
 * @param {CryptoKey} key
 * @param {String} data
 */
const sign = async (key, data) => {
  const result = await window.crypto.subtle.sign(
    {
      name: ALGORITHM_NAME,
    },
    key,
    data
  )
  return result
}

/**
 *
 * @param {CryptoKey} key
 * @param {String} data
 */
const signString = async (key, data) => {
  const result = await sign(key, stringToArrayBuffer(data))
  return base64.encode(result)
}

export default {
  importKeyFromMaster,
  sign,
  signString
}
