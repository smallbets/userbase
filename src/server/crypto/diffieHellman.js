import crypto from 'crypto'

// 2048 bits
const PRIME = Buffer.from('aaf7658bdd624560a2e23bf2a3248e4de82c1224b116984198c9f825d6021b40907ddd7527c6b3b421b2d8ac0db50eeb4f468217471896eff572e3b7048a5f15bf996a0ba7899b1b9cf0ddbf2e81217ae5aaee3747100ba9895bfe339e53f724ada9eedfde73e5fd80951c92d44c1e8a4a38c7a3022ccc1056910e2876b802843573cde57f496e5ee437f97131e4901154dd801e4b8e1a77e2553b19b6c625faf585c382698d5362b7ade019fcbb98126eba5629af5d0bac4ee64718e33a4d842a1d2c0711d2e0a7962fd9b9275f5b0a7fa5f4be0c098282f1e1ff8f471e33e074ed789b6596101c0089a0bb2a4cc047267248483944c308e085de721b0efcfb', 'hex')
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
