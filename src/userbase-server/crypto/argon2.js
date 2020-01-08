import argon2 from 'argon2'
import { stringToArrayBuffer } from '../utils'

/**
 *
 * "Frontend server authentication, that takes 0.5 seconds on a 2 GHz
 *  CPU using 2 cores - Argon2id with 4 lanes and 1 GiB of RAM."
 *
 * source: https://tools.ietf.org/html/draft-irtf-cfrg-argon2-09#section-4
 *
 **/
const type = argon2.argon2id
const parallelism = 4
const memoryCost = 1024 * 1024 // 1gb

/**
 *
 * "The Argon2id variant with t=1 and maximum available memory is
 *  RECOMMENDED as a default setting for all environments."
 *
 * source: https://tools.ietf.org/html/draft-irtf-cfrg-argon2-09#section-8.4
 *
 */
const timeCost = 1

/**
 *
 * "Select the tag length. 128 bits is sufficient for most
 *  applications, including key derivation.  If longer keys are
 *  needed, select longer tags."
 *
 * source: https://tools.ietf.org/html/draft-irtf-cfrg-argon2-09#section-4
 *
 **/
const hashLength = 32

/**
 *
 * "Select the salt length. 128 bits is sufficient for all applications..."
 *
 * source: https://tools.ietf.org/html/draft-irtf-cfrg-argon2-09#section-4
 *
 **/
const SALT_LENGTH = 16
const generateSalt = () => window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH))

// matches userbase-js/Crypto/argon2.js implementation
const hash = async (passwordString, salt) => {
  const passwordArrayBuffer = Buffer.from(new Uint8Array(stringToArrayBuffer(passwordString)))
  const passwordHash = await argon2.hash(passwordArrayBuffer, {
    salt,
    type,
    parallelism,
    memoryCost,
    timeCost,
    hashLength,
    raw: true
  })
  return passwordHash.toString('base64')
}

export default {
  generateSalt,
  hash,
}
