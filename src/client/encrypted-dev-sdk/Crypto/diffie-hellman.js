import DH from 'diffie-hellman'
import aesGcm from './aes-gcm'
import hkdf from './hkdf'
import sha256 from './sha-256'
import { hexStringToArrayBuffer } from './utils'

const KEY_IS_EXTRACTABLE = true
const KEY_WILL_BE_USED_TO = ['encrypt'] // unused
const DIFFIE_HELLMAN_KEY_NAME = 'diffie-hellman'

// RFC 3526 detailing publicly known 2048 bit safe prime: https://www.ietf.org/rfc/rfc3526.txt
const PRIME = hexStringToArrayBuffer('ffffffffffffffffc90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b139b22514a08798e3404ddef9519b3cd3a431b302b0a6df25f14374fe1356d6d51c245e485b576625e7ec6f44c42e9a637ed6b0bff5cb6f406b7edee386bfb5a899fa5ae9f24117c4b1fe649286651ece45b3dc2007cb8a163bf0598da48361c55d39a69163fa8fd24cf5f83655d23dca3ad961c62f356208552bb9ed529077096966d670c354e4abc9804f1746c08ca18217c32905e462e36ce3be39e772c180e86039b2783a2ec07a28fb5c55df06f4c52c9de2bcbf6955817183995497cea956ae515d2261898fa051015728e5a8aacaa68ffffffffffffffff')
const GENERATOR = [2]

const SERVER_PUBLIC_KEY = hexStringToArrayBuffer('c55023ae0a6d85fce5f2a8f9918a56b9f36618c7cae3630cb449712b72e104eac6035ba602d914ccf8bf55d4e13a3728fade099204f40610acba575a59fbd69a14344c9882466bb755740a213f357c297d8514ef66fb03e298f568d196895e601498f11ed8ed14687b3bb201b7afe836e537b620ac3fe9d3ea7c7c37e868df022d9b1f03552a5bf4380b7eddc627eab2151b73d05692b64915dd093cadd3788be6c178314628ffeb7a8d24c1e19fda65c56bde5c7b3c2eeb69b2f3adb765354365e8fe1b51683176df9ff3de00283c8c3920cff1257f594fbdb232b9270e25e941a8685a2eda01ea024000046323146a140c34f04e982c5a3c8fc66e98562bfa')

const setPrivateKeyAndGenerateKeys = (diffieHellman, privateKey) => {
  diffieHellman.setPrivateKey(privateKey)
  diffieHellman.generateKeys()
  return diffieHellman
}

const createDiffieHellman = (privateKey) => {
  const diffieHellman = DH.createDiffieHellman(PRIME, GENERATOR)
  return setPrivateKeyAndGenerateKeys(diffieHellman, privateKey)
}

const getSharedKey = async (privateKey, otherPublicKey) => {
  const diffieHellman = createDiffieHellman(privateKey)
  const sharedSecret = diffieHellman.computeSecret(otherPublicKey)

  const sharedRawKey = await sha256.hash(sharedSecret)
  const sharedKey = await aesGcm.getKeyFromRawKey(sharedRawKey)
  return sharedKey
}

const getPublicKey = (privateKey) => {
  const diffieHellman = createDiffieHellman(privateKey)
  return diffieHellman.getPublicKey()
}

const getSharedKeyWithServer = async (privateKey) => {
  const sharedKey = await getSharedKey(privateKey, SERVER_PUBLIC_KEY)
  return sharedKey
}

const importKeyFromMaster = async (masterKey, salt) => {
  const privateKey = await window.crypto.subtle.deriveKey(
    hkdf.getParams(DIFFIE_HELLMAN_KEY_NAME, salt),
    masterKey,
    aesGcm.getEncryptionKeyParams(), // DH not supported, using raw AES key as secret instead
    KEY_IS_EXTRACTABLE,
    KEY_WILL_BE_USED_TO
  )

  const rawPrivateKey = await aesGcm.getRawKeyFromKey(privateKey)
  return rawPrivateKey
}

export default {
  getPublicKey,
  getSharedKey,
  getSharedKeyWithServer,
  importKeyFromMaster,
}
