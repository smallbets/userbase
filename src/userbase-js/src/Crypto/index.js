import aesGcm from './aes-gcm'
import aesKw from './aes-kw'
import diffieHellman from './diffie-hellman'
import ecdsa from './ecdsa'
import ecdh from './ecdh'
import sha256 from './sha-256'
import hmac from './hmac'
import hkdf from './hkdf'
import scrypt from './scrypt'

const SEED_BYTE_SIZE = 32 // 256 / 8
const generateSeed = () => window.crypto.getRandomValues(new Uint8Array(SEED_BYTE_SIZE))

export default {
  generateSeed,
  aesGcm,
  aesKw,
  diffieHellman,
  ecdsa,
  ecdh,
  sha256,
  hmac,
  hkdf,
  scrypt
}
