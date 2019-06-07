import { arrayBufferToString, stringToArrayBuffer, appendBuffer } from './utils'

const ALGORITHIM_NAME = 'AES-GCM'
const BIT_SIZE = 256
const KEY_IS_EXTRACTABLE = true
const KEY_WILL_BE_USED_TO = ['encrypt', 'decrypt']
const EXTRACTED_KEY_TYPE = 'jwk' // json web key

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

const generateKey = () => window.crypto.subtle.generateKey(
  {
    name: ALGORITHIM_NAME,
    length: BIT_SIZE
  },
  KEY_IS_EXTRACTABLE,
  KEY_WILL_BE_USED_TO
)

const saveKeyToLocalStorage = async (key) => {
  const extractedJsonKey = await window.crypto.subtle.exportKey(EXTRACTED_KEY_TYPE, key)
  const jsonKeyAsString = JSON.stringify(extractedJsonKey)
  localStorage.setItem('key', jsonKeyAsString)
}

const getKeyFromLocalStorage = () => {
  const jsonKeyAsString = localStorage.getItem('key')
  const jsonKey = JSON.parse(jsonKeyAsString)
  return window.crypto.subtle.importKey(
    EXTRACTED_KEY_TYPE,
    jsonKey,
    {
      name: ALGORITHIM_NAME
    },
    KEY_IS_EXTRACTABLE,
    KEY_WILL_BE_USED_TO
  )
}

/**
 *
 * @param {CryptoKey} key
 * @param {object | string} plaintext
 * @returns {ArrayBuffer} encrypted Array Buffer
 *
 *     encrypted is a concatentation of ciphertext + IV Array Buffers
 *
 *     The IV is a random intialization vector that prevents an attacker
 *     from determining a user's key. It can be exposed alongside the ciphertext safely.
 *
 */
const encrypt = async (key, plaintext) => {
  const plaintextString = JSON.stringify(plaintext)
  const plaintextArrayBuffer = stringToArrayBuffer(plaintextString)

  const iv = window.crypto.getRandomValues(new Uint8Array(RECOMMENDED_IV_BYTE_SIZE))

  const ciphertextArrayBuffer = await window.crypto.subtle.encrypt(
    {
      name: ALGORITHIM_NAME,
      iv,
      tagLength: RECOMMENDED_AUTHENTICATION_TAG_LENGTH
    },
    key,
    plaintextArrayBuffer
  )

  return appendBuffer(ciphertextArrayBuffer, iv)
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

  const plaintextArrayBuffer = await window.crypto.subtle.decrypt(
    {
      name: ALGORITHIM_NAME,
      iv,
      tagLength: RECOMMENDED_AUTHENTICATION_TAG_LENGTH
    },
    key,
    ciphertextArrayBuffer
  )

  const plaintextString = arrayBufferToString(plaintextArrayBuffer)
  return JSON.parse(plaintextString)
}

export default {
  generateKey,
  saveKeyToLocalStorage,
  getKeyFromLocalStorage,
  encrypt,
  decrypt,
}
