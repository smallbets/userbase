import base64 from 'base64-arraybuffer'
import { stringToArrayBuffer } from './utils'

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
 */
const hashString = async (data) => {
  const result = await hash(stringToArrayBuffer(data))
  return base64.encode(result)
}

export default {
  hash,
  hashString
}
