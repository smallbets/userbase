import { arrayBufferToString, stringToArrayBuffer, appendBuffer } from './utils'

const ALGORITHIM_NAME = 'AES-GCM'
const BIT_SIZE = 256
const KEY_IS_EXTRACTABLE = true
const KEY_WILL_BE_USED_TO = ['encrypt', 'decrypt']
const JSON_KEY_TYPE = 'jwk' // json web key
const RAW_KEY_TYPE = 'raw' // raw key

/**
 * NIST recommendation:
 *
 * "For  IVs,  it  is  recommended  that  implementations  restrict  support  to
 * the  length  of  96  bits,  to  promote interoperability, efficiency, and
 * simplicity of design."
 *
 * Pg. 8
 * https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf
 *
 **/
const RECOMMENDED_IV_BYTE_SIZE = 96 / 8

/**
 * Source on tag length:
 * https://crypto.stackexchange.com/questions/26783/ciphertext-and-tag-size-and-iv-transmission-with-aes-in-gcm-mode/26787
 */
const RECOMMENDED_AUTHENTICATION_TAG_LENGTH = 128

const windowOrSelfObject = () => {
  return typeof window !== 'undefined'
    ? window
    : self
}

const generateKey = async () => {
  const key = await window.crypto.subtle.generateKey(
    {
      name: ALGORITHIM_NAME,
      length: BIT_SIZE
    },
    KEY_IS_EXTRACTABLE,
    KEY_WILL_BE_USED_TO
  )
  return key
}

const getKeyStringFromKey = async (key) => {
  const extractedJsonKey = await window.crypto.subtle.exportKey(JSON_KEY_TYPE, key)
  const keyString = JSON.stringify(extractedJsonKey)
  return keyString
}

const getKeyFromKeyString = async (keyString) => {
  const jsonKey = JSON.parse(keyString)
  const key = await windowOrSelfObject().crypto.subtle.importKey(
    JSON_KEY_TYPE,
    jsonKey,
    {
      name: ALGORITHIM_NAME
    },
    KEY_IS_EXTRACTABLE,
    KEY_WILL_BE_USED_TO
  )
  return key
}

const importRawKey = async (rawKey) => {
  const key = await windowOrSelfObject().crypto.subtle.importKey(
    RAW_KEY_TYPE,
    rawKey,
    {
      name: ALGORITHIM_NAME
    },
    KEY_IS_EXTRACTABLE,
    KEY_WILL_BE_USED_TO
  )
  return key
}

const exportRawKey = async (key) => {
  const rawKey = await windowOrSelfObject().crypto.subtle.exportKey(RAW_KEY_TYPE, key)
  return rawKey
}

/**
 *
 * @param {CryptoKey} key
 * @param {ArrayBuffer} plaintext
 * @returns {ArrayBuffer} encrypted Array Buffer
 *
 *     encrypted is a concatentation of Array Buffers [ciphertext, auth tag, IV]
 *
 *     The Authentication Tag is a hash of the plaintext to ensure the same data that
 *     is ecncrypted is the resulting data when decrypted. Note that the browser crypto
 *     library's result is the concatenation of Array Buffers [ciphertext, auth tag]
 *
 *     The IV is a random intialization vector that prevents an attacker
 *     from determining a user's key. It can be exposed alongside the ciphertext safely.
 *
 */
const encrypt = async (key, plaintext) => {
  const iv = windowOrSelfObject().crypto.getRandomValues(new Uint8Array(RECOMMENDED_IV_BYTE_SIZE))

  // this result is the concatenation of Array Buffers [ciphertext, auth tag]
  const ciphertextArrayBuffer = await windowOrSelfObject().crypto.subtle.encrypt(
    {
      name: ALGORITHIM_NAME,
      iv,
      tagLength: RECOMMENDED_AUTHENTICATION_TAG_LENGTH
    },
    key,
    plaintext
  )

  return appendBuffer(ciphertextArrayBuffer, iv)
}

const encryptJson = async (key, plaintextJson) => {
  const plaintextString = JSON.stringify(plaintextJson)
  const plaintextArrayBuffer = stringToArrayBuffer(plaintextString)
  const encrypted = await encrypt(key, plaintextArrayBuffer)
  return encrypted
}

/**
 *
 * @param {CryptoKey} key
 * @param {ArrayBuffer} encrypted - the encrypted Array Buffer
 * @returns {object} plaintext
 */
const decrypt = async (key, encrypted) => {
  const ivStartIndex = encrypted.byteLength - RECOMMENDED_IV_BYTE_SIZE
  const ciphertextArrayBuffer = encrypted.slice(0, ivStartIndex)
  const iv = encrypted.slice(ivStartIndex)

  const plaintextArrayBuffer = await windowOrSelfObject().crypto.subtle.decrypt(
    {
      name: ALGORITHIM_NAME,
      iv,
      tagLength: RECOMMENDED_AUTHENTICATION_TAG_LENGTH
    },
    key,
    ciphertextArrayBuffer
  )
  return plaintextArrayBuffer
}

const decryptJson = async (key, encryptedJson) => {
  const plaintextArrayBuffer = await decrypt(key, encryptedJson)
  const plaintextString = arrayBufferToString(plaintextArrayBuffer)
  return JSON.parse(plaintextString)
}

export default {
  generateKey,
  getKeyStringFromKey,
  getKeyFromKeyString,
  importRawKey,
  exportRawKey,
  encrypt,
  encryptJson,
  decrypt,
  decryptJson,
}
