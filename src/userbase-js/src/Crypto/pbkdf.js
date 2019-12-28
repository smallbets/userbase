
import { stringToArrayBuffer } from './utils'
import sha256 from './sha-256'
import aesGcm from './aes-gcm'

const PBKDF_ALGORITHM_NAME = 'PBKDF2'
const RAW_KEY_TYPE = 'raw'
const KEY_IS_NOT_EXTRACTABLE = false
const PBKDF_KEY_WILL_BE_USED_TO = ['deriveKey']
const ENCRYPTION_KEY_WILL_BE_USED_TO = ['encrypt', 'decrypt']

/**
 * NIST recommendation:
 *
 * "the iteration count SHOULD be as large as verification server performance will allow,
 * typically at least 10,000 iterations."
 *
 * https://pages.nist.gov/800-63-3/sp800-63b.html#sec5
 *
 **/
const ITERATIONS = 10000

const SALT_BYTE_SIZE = sha256.BYTE_SIZE
const generateSalt = () => window.crypto.getRandomValues(new Uint8Array(SALT_BYTE_SIZE))

const importKey = async (passwordString, salt) => {
  const pbkdfKey = await window.crypto.subtle.importKey(
    RAW_KEY_TYPE,
    stringToArrayBuffer(passwordString),
    {
      name: PBKDF_ALGORITHM_NAME,
    },
    KEY_IS_NOT_EXTRACTABLE,
    PBKDF_KEY_WILL_BE_USED_TO
  )

  const encryptionKey = await window.crypto.subtle.deriveKey(
    {
      name: PBKDF_ALGORITHM_NAME,
      salt,
      iterations: ITERATIONS,
      hash: {
        name: sha256.HASH_ALGORITHM_NAME
      }
    },
    pbkdfKey,
    aesGcm.getEncryptionKeyParams(),
    KEY_IS_NOT_EXTRACTABLE,
    ENCRYPTION_KEY_WILL_BE_USED_TO
  )

  return encryptionKey
}

export default {
  generateSalt,
  importKey
}
