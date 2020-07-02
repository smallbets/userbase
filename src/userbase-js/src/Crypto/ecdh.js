import base64 from 'base64-arraybuffer'
import hkdf from './hkdf'
import aesGcm from './aes-gcm'
import ecdsa from './ecdsa'
import { stringToArrayBuffer, arrayBufferToString } from './utils'

const ECDH_ALGORITHM_NAME = 'ECDH'
const KEY_IS_EXTRACTABLE = true
const KEY_WILL_BE_USED_TO = ['deriveKey', 'deriveBits']
const PRIVATE_KEY_TYPE = 'jwk' // pkcs8 not supported in firefox, must use jwk
const PUBLIC_KEY_TYPE = 'spki'

const ECDH_KEY_ENCRYPTION_KEY = 'ecdh-key-encryption-key'

/**
 * NIST recommendation:
 *
 * 128-bit security provided with 256-bit key size
 *
 * Pg. 55
 * https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-57pt1r5.pdf
 *
 **/
const NAMED_CURVE = 'P-256'

const ECDH_PARAMS = {
  name: ECDH_ALGORITHM_NAME,
  namedCurve: NAMED_CURVE
}

const generateKeyPair = async () => {
  const keyPair = await window.crypto.subtle.generateKey(
    ECDH_PARAMS,
    KEY_IS_EXTRACTABLE,
    KEY_WILL_BE_USED_TO
  )
  return keyPair
}

const getRawPrivateKeyFromPrivateKey = async (privateKey) => {
  const jwkPrivateKey = await window.crypto.subtle.exportKey(PRIVATE_KEY_TYPE, privateKey)
  const rawPrivateKey = stringToArrayBuffer(JSON.stringify(jwkPrivateKey))
  return rawPrivateKey
}

const getPrivateKeyFromRawPrivateKey = async (rawPrivateKey) => {
  const jwkPrivateKey = JSON.parse(arrayBufferToString(rawPrivateKey))
  const privateKey = await window.crypto.subtle.importKey(
    PRIVATE_KEY_TYPE,
    jwkPrivateKey,
    ECDH_PARAMS,
    KEY_IS_EXTRACTABLE,
    KEY_WILL_BE_USED_TO,
  )

  return privateKey
}

const getRawPublicKeyFromPublicKey = async (publicKey) => {
  const rawPublicKey = await window.crypto.subtle.exportKey(PUBLIC_KEY_TYPE, publicKey)
  return rawPublicKey
}

const getPublicKeyFromRawPublicKey = async (rawPublicKey) => {
  const publicKey = await window.crypto.subtle.importKey(
    PUBLIC_KEY_TYPE,
    rawPublicKey,
    ECDH_PARAMS,
    KEY_IS_EXTRACTABLE,
    [], // empty list ok
  )

  return publicKey
}

const importEcdhKeyEncryptionKeyFromMaster = async (masterKey, salt) => {
  const keyEncryptionKey = await aesGcm.importKeyFromMaster(masterKey, salt, ECDH_KEY_ENCRYPTION_KEY)
  return keyEncryptionKey
}

const generateEcdhKeyData = async (masterKey, ecdsaPrivateKey) => {
  // need to generate new key pair because cannot derive ECDH key pair using HKDF in WebCrypto
  const ecdhKeyPair = await generateKeyPair()

  // derive a key encryption key using HKDF to encrypt the ECDH private key and store it on server
  const ecdhKeyEncryptionKeySalt = hkdf.generateSalt()
  const ecdhKeyEncryptionKey = await importEcdhKeyEncryptionKeyFromMaster(masterKey, ecdhKeyEncryptionKeySalt)
  const ecdhRawPrivateKey = await getRawPrivateKeyFromPrivateKey(ecdhKeyPair.privateKey)
  const encryptedEcdhPrivateKey = await aesGcm.encrypt(ecdhKeyEncryptionKey, ecdhRawPrivateKey)

  const ecdhPublicKey = await getRawPublicKeyFromPublicKey(ecdhKeyPair.publicKey)
  const signedEcdhPublicKey = await ecdsa.sign(ecdsaPrivateKey, ecdhPublicKey)

  return {
    ecdhPrivateKey: ecdhKeyPair.privateKey,
    ecdhPublicKey: base64.encode(ecdhPublicKey),
    encryptedEcdhPrivateKey: base64.encode(encryptedEcdhPrivateKey),
    signedEcdhPublicKey: base64.encode(signedEcdhPublicKey),
    ecdhKeyEncryptionKeySalt: base64.encode(ecdhKeyEncryptionKeySalt),
  }
}

const computeSharedKeyEncryptionKey = async (otherEcdhPublicKey, ecdhPrivateKey) => {
  const sharedKeyEncryptionKey = await window.crypto.subtle.deriveKey(
    {
      name: ECDH_ALGORITHM_NAME,
      namedCurve: NAMED_CURVE,
      public: otherEcdhPublicKey
    },
    ecdhPrivateKey,
    aesGcm.getEncryptionKeyParams(),
    !KEY_IS_EXTRACTABLE,
    aesGcm.KEY_WILL_BE_USED_TO
  )

  return sharedKeyEncryptionKey
}

export default {
  generateKeyPair,
  generateEcdhKeyData,
  importEcdhKeyEncryptionKeyFromMaster,
  getPrivateKeyFromRawPrivateKey,
  getRawPublicKeyFromPublicKey,
  getPublicKeyFromRawPublicKey,
  computeSharedKeyEncryptionKey,
}
