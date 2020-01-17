import scrypt from 'scrypt-js'
import base64 from 'base64-arraybuffer'
import { stringToArrayBuffer } from './utils'

/**
 *
 * These parameters ensure the hash function will run in <100ms
 * on consumer hardware while also maintaining acceptable security.
 *
 * source: https://blog.filippo.io/the-scrypt-parameters/
 *
 **/
const N = 32768 // 32mb
const r = 8
const p = 1

const HASH_LENGTH = 32

/**
 * NIST recommendation:
 *
 * "The length of the randomly-generated portion of the salt shall be at least 128 bits."
 *
 * Section 5.1
 * https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-132.pdf
 *
 **/
const SALT_LENGTH = 16
const generateSalt = () => window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH))

const hash = async (passwordString, salt) => {
  const passwordArrayBuffer = new Uint8Array(stringToArrayBuffer(passwordString))
  const passwordHash = await scrypt.scrypt(passwordArrayBuffer, salt, N, r, p, HASH_LENGTH)
  return base64.encode(passwordHash)
}

export default {
  generateSalt,
  hash,
}
