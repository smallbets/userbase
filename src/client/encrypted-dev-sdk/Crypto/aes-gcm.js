import { arrayBufferToString, stringToArrayBuffer } from './utils'

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
 * Additional source on tag length:
 * https://crypto.stackexchange.com/questions/26783/ciphertext-and-tag-size-and-iv-transmission-with-aes-in-gcm-mode/26787
 **/
const RECOMMENDED_IV_BYTE_SIZE = 96 / 8
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
 * @param {Crypto Key} key
 * @param {object | string} plaintext
 * @returns {object}
 * @returns {Uint8Array} iv - random initialization vector that prevents key leak. It can
 *                            be exposed safely
 * @returns {ArrayBuffer} encryptedArrayBuffer
 */
const encrypt = async (key, plaintext) => {
  const plaintextString = JSON.stringify(plaintext)
  const plaintextArrayBuffer = stringToArrayBuffer(plaintextString)
  const iv = window.crypto.getRandomValues(new Uint8Array(RECOMMENDED_IV_BYTE_SIZE))
  const encryptedArrayBuffer = await window.crypto.subtle.encrypt(
    {
      name: ALGORITHIM_NAME,
      iv,
      tagLength: RECOMMENDED_AUTHENTICATION_TAG_LENGTH
    },
    key,
    plaintextArrayBuffer
  )
  return {
    iv,
    encryptedArrayBuffer,
  }
}

/**
 *
 * @param {CryptoKey} key - Crypto key object
 * @param {ArrayBuffer} encryptedArrayBuffer
 * @param {Uint8Array} iv - initialization vector used to encrypt data
 * @returns {object}
 */
const decrypt = async (key, encryptedArrayBuffer, iv) => {
  const plaintextArrayBuffer = await window.crypto.subtle.decrypt(
    {
      name: ALGORITHIM_NAME,
      iv,
      tagLength: RECOMMENDED_AUTHENTICATION_TAG_LENGTH
    },
    key,
    encryptedArrayBuffer
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
