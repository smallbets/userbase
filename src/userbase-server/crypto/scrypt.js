import crypto from 'crypto'
import { stringToArrayBuffer } from '../utils'

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

const PARAMS = {
  N,
  r,
  p,

  // "Memory upper bound. It is an error when (approximately) 128 * N * r > maxmem."
  // source: https://nodejs.org/api/crypto.html#crypto_crypto_scrypt_password_salt_keylen_options_callback
  maxmem: 128 * N * r * 2
}

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
const generateSalt = () => crypto.randomBytes(SALT_LENGTH)


// matches userbase-js/Crypto/scrypt.js implementation
const hash = async (password, salt) => {
  const passwordArrayBuffer = new Uint8Array(stringToArrayBuffer(password))
  const result = await new Promise((resolve, reject) => {
    crypto.scrypt(passwordArrayBuffer, salt, HASH_LENGTH, PARAMS, (err, derivedKey) => {
      if (err) throw reject(err)
      resolve(derivedKey)
    })
  })
  return result.toString('base64')
}

export default {
  generateSalt,
  hash,
}
