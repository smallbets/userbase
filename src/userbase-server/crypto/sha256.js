import crypto from 'crypto'

const ALGORITHIM_NAME = 'sha256'

const hash = (data) => {
  const hashStream = crypto.createHash(ALGORITHIM_NAME)
  hashStream.update(data)
  return hashStream.digest()
}

export default {
  hash
}
