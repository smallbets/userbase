import crypto from 'crypto'

export default byteLength => crypto.randomBytes(byteLength)
