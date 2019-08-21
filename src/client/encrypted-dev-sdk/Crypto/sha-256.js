import base64 from 'base64-arraybuffer'
import { stringToArrayBuffer, appendBuffer } from './utils'

const ALGORITHM_NAME = 'SHA-256'

/**
 *
 * @param {ArrayBuffer} data
 */
const hash = async (data) => {
  const result = await window.crypto.subtle.digest(
    {
      name: ALGORITHM_NAME,
    },
    data
  )
  return result
}

/**
 *
 * @param {String} data
 * @param {String} salt
 */
const hashStringsWithSalt = async (data, salt) => {
  const result = await hash(appendBuffer(
    stringToArrayBuffer(data),
    stringToArrayBuffer(salt)
  ))
  return base64.encode(result)
}

export default {
  hash,
  hashStringsWithSalt
}
