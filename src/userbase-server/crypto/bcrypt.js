import bcrypt from 'bcrypt'
import statusCodes from '../statusCodes'

// bcrypt does not use > 72 bytes
const MAX_BYTE_LEN = 72

const SALT_ROUNDS = 10

const hash = (password) => {
  if (typeof password !== 'string') throw {
    status: statusCodes['Bad Request'],
    data: 'Password must be a string'
  }

  if (password.length > MAX_BYTE_LEN || Buffer.byteLength(password, 'utf8') > MAX_BYTE_LEN) throw {
    status: statusCodes['Bad Request'],
    data: 'Password must be less than 72 bytes'
  }

  return bcrypt.hash(password, SALT_ROUNDS)
}

const compare = (providedPassword, actualPasswordHash) => {
  if (typeof providedPassword !== 'string') throw {
    status: statusCodes['Bad Request'],
    data: 'Password must be a string'
  }

  if (providedPassword.length > MAX_BYTE_LEN || Buffer.byteLength(providedPassword, 'utf8') > MAX_BYTE_LEN) throw {
    status: statusCodes['Bad Request'],
    data: "If you're confident your password is supposed to be as long as you entered it, please reset your password using the forgot password option. A patch to our server-side password hashing algorithm package (bcrypt) revealed that passwords greater than 255 bytes cannot be verified as expected. Your account is safe.\n\nContact support@userbase.com with any questions."
  }

  return bcrypt.compare(providedPassword, actualPasswordHash)
}

export default {
  hash,
  compare,
}
