import bcrypt from 'bcrypt'

const SALT_ROUNDS = 10

const hash = (password) => bcrypt.hash(password, SALT_ROUNDS)

const compare = (providedPassword, actualPasswordHash) => bcrypt.compare(providedPassword, actualPasswordHash)

export default {
  hash,
  compare,
}
