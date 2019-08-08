import crypto from 'crypto'

// RFC 3526 detailing publicly known 2048 bit safe prime: https://www.ietf.org/rfc/rfc3526.txt
const PRIME = Buffer.from('ffffffffffffffffc90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b139b22514a08798e3404ddef9519b3cd3a431b302b0a6df25f14374fe1356d6d51c245e485b576625e7ec6f44c42e9a637ed6b0bff5cb6f406b7edee386bfb5a899fa5ae9f24117c4b1fe649286651ece45b3dc2007cb8a163bf0598da48361c55d39a69163fa8fd24cf5f83655d23dca3ad961c62f356208552bb9ed529077096966d670c354e4abc9804f1746c08ca18217c32905e462e36ce3be39e772c180e86039b2783a2ec07a28fb5c55df06f4c52c9de2bcbf6955817183995497cea956ae515d2261898fa051015728e5a8aacaa68ffffffffffffffff', 'hex')
const GENERATOR = new Int8Array([2])

let server_dh

const _getDiffieHellman = () => {
  if (server_dh) return server_dh
  server_dh = crypto.createDiffieHellman(PRIME, GENERATOR)
  if (!process.env.SECRET_FOR_DIFFIE_HELLMAN) throw new Error('Missing secret for diffie hellman')
  server_dh.setPrivateKey(process.env.SECRET_FOR_DIFFIE_HELLMAN)
  server_dh.generateKeys()
  return server_dh
}

const computeSecret = (otherPublicKey) => {
  const dh = _getDiffieHellman()
  return dh.computeSecret(otherPublicKey)
}

export default {
  computeSecret
}
