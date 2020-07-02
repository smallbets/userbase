import base64 from 'base64-arraybuffer'
import sha256 from './sha-256'
import hkdf from './hkdf'
import aesGcm from './aes-gcm'
import { stringToArrayBuffer, arrayBufferToString } from './utils'

const ECDSA_ALGORITHM_NAME = 'ECDSA'
const KEY_IS_EXTRACTABLE = true
const KEY_PAIR_WILL_BE_USED_TO = ['sign', 'verify']
const PRIVATE_KEY_WILL_BE_USED_TO = ['sign']
const PRIVATE_KEY_TYPE = 'jwk' // pkcs8 not supported in firefox, must use jwk
const PUBLIC_KEY_WILL_BE_USED_TO = ['verify']
const PUBLIC_KEY_TYPE = 'spki'

const ECDSA_KEY_ENCRYPTION_KEY = 'ecdsa-key-encryption-key'

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

const ECDSA_PARAMS = {
  name: ECDSA_ALGORITHM_NAME,
  namedCurve: NAMED_CURVE
}

const ECDSA_SIGNING_PARAMS = {
  name: ECDSA_ALGORITHM_NAME,
  hash: { name: sha256.HASH_ALGORITHM_NAME }
}

const generateKeyPair = async () => {
  const keyPair = await window.crypto.subtle.generateKey(
    ECDSA_PARAMS,
    KEY_IS_EXTRACTABLE,
    KEY_PAIR_WILL_BE_USED_TO
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
    ECDSA_PARAMS,
    KEY_IS_EXTRACTABLE,
    PRIVATE_KEY_WILL_BE_USED_TO,
  )

  return privateKey
}

const getPublicKeyFromRawPublicKey = async (rawPublicKey) => {
  const publicKey = await window.crypto.subtle.importKey(
    PUBLIC_KEY_TYPE,
    rawPublicKey,
    ECDSA_PARAMS,
    KEY_IS_EXTRACTABLE,
    PUBLIC_KEY_WILL_BE_USED_TO
  )
  return publicKey
}

const getRawPublicKeyFromPublicKey = async (publicKey) => {
  const rawPublicKey = await window.crypto.subtle.exportKey(PUBLIC_KEY_TYPE, publicKey)
  return rawPublicKey
}

const getPublicKeyStringFromPublicKey = async (publicKey) => {
  const rawPublicKey = await getRawPublicKeyFromPublicKey(publicKey)
  const publicKeyString = base64.encode(rawPublicKey)
  return publicKeyString
}

const getPublicKeyFromPrivateKey = async (privateKey) => {
  const jwkPrivateKey = await window.crypto.subtle.exportKey('jwk', privateKey)

  // delete private key data
  delete jwkPrivateKey.d

  // set public key key_ops to enable import as public key
  jwkPrivateKey.key_ops = PUBLIC_KEY_WILL_BE_USED_TO

  const publicKey = await window.crypto.subtle.importKey(
    'jwk',
    jwkPrivateKey, // technically this now has same values as the public key would
    ECDSA_PARAMS,
    KEY_IS_EXTRACTABLE,
    PUBLIC_KEY_WILL_BE_USED_TO
  )

  return publicKey
}

const importEcdsaKeyEncryptionKeyFromMaster = async (masterKey, salt) => {
  const keyEncryptionKey = await aesGcm.importKeyFromMaster(masterKey, salt, ECDSA_KEY_ENCRYPTION_KEY)
  return keyEncryptionKey
}

const generateEcdsaKeyData = async (masterKey) => {
  // need to generate new key pair because cannot derive ECDSA key pair using HKDF in WebCrypto
  const ecdsaKeyPair = await generateKeyPair()

  // derive a key encryption key using HKDF to encrypt the ECDSA private key and store it on server
  const ecdsaKeyEncryptionKeySalt = hkdf.generateSalt()
  const ecdsaKeyEncryptionKey = await importEcdsaKeyEncryptionKeyFromMaster(masterKey, ecdsaKeyEncryptionKeySalt)
  const ecdsaRawPrivateKey = await getRawPrivateKeyFromPrivateKey(ecdsaKeyPair.privateKey)
  const encryptedEcdsaPrivateKey = await aesGcm.encrypt(ecdsaKeyEncryptionKey, ecdsaRawPrivateKey)

  return {
    ecdsaPrivateKey: ecdsaKeyPair.privateKey,
    ecdsaPublicKey: await getPublicKeyStringFromPublicKey(ecdsaKeyPair.publicKey),
    encryptedEcdsaPrivateKey: base64.encode(encryptedEcdsaPrivateKey),
    ecdsaKeyEncryptionKeySalt: base64.encode(ecdsaKeyEncryptionKeySalt),
  }
}

const sign = async (privateKey, data) => {
  const signature = await window.crypto.subtle.sign(
    ECDSA_SIGNING_PARAMS,
    privateKey,
    data
  )
  return signature
}

const signString = async (privateKey, dataString) => {
  const data = stringToArrayBuffer(dataString)
  const signature = await sign(privateKey, data)
  const signatureString = base64.encode(signature)
  return signatureString
}

const verify = async (publicKey, signature, data) => {
  const isVerified = await window.crypto.subtle.verify(
    ECDSA_SIGNING_PARAMS,
    publicKey,
    signature,
    data
  )
  return isVerified
}

const verifyString = async (publicKey, signatureString, dataString) => {
  const data = stringToArrayBuffer(dataString)
  const signature = base64.decode(signatureString)
  const isVerified = await verify(publicKey, signature, data)
  return isVerified
}

export default {
  generateEcdsaKeyData,
  importEcdsaKeyEncryptionKeyFromMaster,
  getPrivateKeyFromRawPrivateKey,
  getPublicKeyFromRawPublicKey,
  getRawPublicKeyFromPublicKey,
  getPublicKeyStringFromPublicKey,
  getPublicKeyFromPrivateKey,
  sign,
  signString,
  verify,
  verifyString,
}
