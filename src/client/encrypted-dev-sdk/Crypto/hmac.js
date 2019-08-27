import base64 from 'base64-arraybuffer'
import { stringToArrayBuffer } from './utils'

const ALGORITHM_NAME = 'HMAC'
const HASH_ALGORITHIM_NAME = 'SHA-256'
const KEY_IS_EXTRACTABLE = false
const KEY_WILL_BE_USED_TO = ['sign']
const RAW_KEY_TYPE = 'raw'

const importKey = async (rawKey) => {
  const result = await window.crypto.subtle.importKey(
    RAW_KEY_TYPE,
    rawKey,
    {
      name: ALGORITHM_NAME,
      hash: {
        name: HASH_ALGORITHIM_NAME
      }
    },
    KEY_IS_EXTRACTABLE,
    KEY_WILL_BE_USED_TO
  )
  return result
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
  importKey,
  sign,
  signString
}
