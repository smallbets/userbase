import base64 from 'base64-arraybuffer'
import sha256 from './sha-256'
import { stringToArrayBuffer } from './utils'

const HKDF_ALGORITHM_NAME = 'HKDF'
const RAW_KEY_TYPE = 'raw'
const KEY_IS_NOT_EXTRACTABLE = false
const KEY_WILL_BE_USED_TO = ['deriveKey', 'deriveBits']

const importHkdfKeyFromString = async (seedString) => {
  const seed = stringToArrayBuffer(seedString)
  const hkdfKey = await importHkdfKey(seed)
  return hkdfKey
}

const importHkdfKey = async (seed) => {
  const hkdfKey = await window.crypto.subtle.importKey(
    RAW_KEY_TYPE,
    seed,
    {
      name: HKDF_ALGORITHM_NAME
    },
    KEY_IS_NOT_EXTRACTABLE,
    KEY_WILL_BE_USED_TO
  )
  return hkdfKey
}

/**
 *  RFC 5869:
 *
 *  "the use of salt adds significantly to the strength of HKDF...
 *  Ideally, the salt value is a random (or pseudorandom) string of the
 *  length HashLen"
 *
 *  https://tools.ietf.org/html/rfc5869#section-3.1
 *
 **/
const SALT_BYTE_SIZE = sha256.BYTE_SIZE
const generateSalt = () => window.crypto.getRandomValues(new Uint8Array(SALT_BYTE_SIZE))

const getParams = (keyName, salt) => ({
  name: HKDF_ALGORITHM_NAME,
  info: stringToArrayBuffer(keyName),
  hash: sha256.HASH_ALGORITHM_NAME,
  salt
})

const PASSWORD_TOKEN_NAME = 'password-token'
const PASSWORD_TOKEN_NUM_BITS = 256

const getPasswordToken = async (hkdfKey, salt) => {
  const passwordTokenBits = await window.crypto.subtle.deriveBits(
    getParams(PASSWORD_TOKEN_NAME, salt),
    hkdfKey,
    PASSWORD_TOKEN_NUM_BITS
  )

  return base64.encode(passwordTokenBits)
}

export default {
  importHkdfKeyFromString,
  importHkdfKey,
  generateSalt,
  getParams,
  getPasswordToken
}
