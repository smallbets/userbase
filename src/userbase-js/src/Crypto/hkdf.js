import sha256 from './sha-256'
import { stringToArrayBuffer } from './utils'

const ALGORITHM_NAME = 'HKDF'
const RAW_KEY_TYPE = 'raw'
const KEY_IS_NOT_EXTRACTABLE = false
const KEY_WILL_BE_USED_TO = ['deriveKey']

const importMasterKey = async (seed) => {
  const masterKey = await window.crypto.subtle.importKey(
    RAW_KEY_TYPE,
    seed,
    {
      name: ALGORITHM_NAME
    },
    KEY_IS_NOT_EXTRACTABLE,
    KEY_WILL_BE_USED_TO
  )
  return masterKey
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
  name: ALGORITHM_NAME,
  info: stringToArrayBuffer(keyName),
  hash: sha256.HASH_ALGORITHM_NAME,
  salt
})

export default {
  importMasterKey,
  generateSalt,
  getParams
}
