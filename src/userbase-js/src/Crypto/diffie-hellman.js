import DH from 'diffie-hellman'
import aesGcm from './aes-gcm'
import hkdf from './hkdf'
import sha256 from './sha-256'
import { hexStringToArrayBuffer } from './utils'
import api from '../api'

const KEY_IS_EXTRACTABLE = true
const KEY_WILL_BE_USED_TO = ['encrypt'] // unused
const DIFFIE_HELLMAN_KEY_NAME = 'diffie-hellman'

// RFC 3526 detailing publicly known 2048 bit safe prime: https://www.ietf.org/rfc/rfc3526.txt
const PRIME = hexStringToArrayBuffer('ffffffffffffffffc90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b139b22514a08798e3404ddef9519b3cd3a431b302b0a6df25f14374fe1356d6d51c245e485b576625e7ec6f44c42e9a637ed6b0bff5cb6f406b7edee386bfb5a899fa5ae9f24117c4b1fe649286651ece45b3dc2007cb8a163bf0598da48361c55d39a69163fa8fd24cf5f83655d23dca3ad961c62f356208552bb9ed529077096966d670c354e4abc9804f1746c08ca18217c32905e462e36ce3be39e772c180e86039b2783a2ec07a28fb5c55df06f4c52c9de2bcbf6955817183995497cea956ae515d2261898fa051015728e5a8aacaa68ffffffffffffffff')
const GENERATOR = [2]

// get public key from the server to allow developers to easily swap out default server with their own
// server running userbase-server
let serverPublicKey = null
const getServerPublicKey = async () => {
  if (serverPublicKey) {
    return serverPublicKey
  } else {
    serverPublicKey = await api.auth.getServerPublicKey() // eslint-disable-line require-atomic-updates
    return serverPublicKey
  }
}

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
  const sharedKey = await getSharedKey(privateKey, new Uint8Array(await getServerPublicKey()))
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
