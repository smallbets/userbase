import scrypt from 'scrypt-js'
import base64 from 'base64-arraybuffer'
import { stringToArrayBuffer } from './utils'

/**
 *
 * From the Scrypt paper:
 *
 * "100ms is a reasonable upper bound on the delay which should be
 * cryptographically imposed on interactive logins"
 *
 * Pg. 13
 * https://www.tarsnap.com/scrypt/scrypt.pdf
 *
 * With an optimized Scrypt algorithm running on a 3.1 GHz Intel Core i5,
 * N = 32768 is the highest work factor that takes <100ms for the
 * algorithm to run. Thus, it's the latest recommended work factor.
 *
 * Source: https://blog.filippo.io/the-scrypt-parameters/
 *
 * However, we are not running an optimized version of the algorithm on a
 * single machine. Users are running a pure js version written for the browser.
 * Safari, for example, takes >6 seconds to run when N = 32768 on a 2.5 GHz
 * Intel Core i5. A higher end CPU can only shave around 1 second off that time.
 * Further, it takes over 1s to run in Firefox, and over 500ms to run in Chrome.
 * This is an unacceptably slow interactive login delay to impose on users.
 *
 * Thus, we are going with N = 16384 to ensure interactive logins
 * are closer to the reasonable delay the function will impose on users,
 * while still maintaining a high level of security.
 *
 **/
const N = 16384 // 16mb
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
