import argon2 from 'argon2-browser'
import base64 from 'base64-arraybuffer'
import { stringToArrayBuffer } from './utils'

/**
 *
 * "Frontend server authentication, that takes 0.5 seconds on a 2 GHz
 *  CPU using 2 cores - Argon2id with 4 lanes and 1 GiB of RAM."
 *
 * source: https://tools.ietf.org/html/draft-irtf-cfrg-argon2-09#section-4
 *
 **/
const type = argon2.ArgonType.Argon2id
const parallelism = 4
const mem = 1024 * 1024 // 1gb

/**
 *
 * "The Argon2id variant with t=1 and maximum available memory is
 *  RECOMMENDED as a default setting for all environments."
 *
 * source: https://tools.ietf.org/html/draft-irtf-cfrg-argon2-09#section-8.4
 *
 */
const time = 1

/**
 *
 * "Select the tag length. 128 bits is sufficient for most
 *  applications, including key derivation.  If longer keys are
 *  needed, select longer tags."
 *
 * source: https://tools.ietf.org/html/draft-irtf-cfrg-argon2-09#section-4
 *
 **/
const hashLen = 32

/**
 *
 * "Select the salt length. 128 bits is sufficient for all applications..."
 *
 * source: https://tools.ietf.org/html/draft-irtf-cfrg-argon2-09#section-4
 *
 **/
const SALT_LENGTH = 16
const generateSalt = () => window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH))

const hash = async (passwordString, salt) => {
  const passwordArrayBuffer = new Uint8Array(stringToArrayBuffer(passwordString))
  const passwordHash = await argon2.hash({
    pass: passwordArrayBuffer,
    salt,
    type,
    parallelism,
    mem,
    time,
    hashLen
  })
  return base64.encode(passwordHash.hash)
}

export default {
  generateSalt,
  hash,
}
