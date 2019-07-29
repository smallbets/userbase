import crypto from 'crypto'

const ALGORITHIM_NAME = 'aes-256-gcm'

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

const encrypt = (key, plaintext) => {
  const iv = crypto.randomBytes(RECOMMENDED_IV_BYTE_SIZE)
  const cipher = crypto.createCipheriv(ALGORITHIM_NAME, key, iv)
  const ciphertext = cipher.update(plaintext)
  cipher.final()
  const authTag = cipher.getAuthTag()
  return Buffer.concat([ciphertext, authTag, iv])
}

export default {
  encrypt
}
