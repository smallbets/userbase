import base64 from 'base64-arraybuffer'
import hkdf from './hkdf'
import aesKw from './aes-kw'
import ecdsa from './ecdsa'

const ECDH_ALGORITHM_NAME = 'ECDH'
const KEY_IS_EXTRACTABLE = true
const KEY_WILL_BE_USED_TO = ['deriveKey', 'deriveBits']
const PUBLIC_KEY_TYPE = 'spki'

const ECDH_KEY_WRAPPER = 'ecdh-key-wrapper'

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

const getRawPublicKeyFromPublicKey = async (publicKey) => {
  const rawPublicKey = await window.crypto.subtle.exportKey(PUBLIC_KEY_TYPE, publicKey)
  return rawPublicKey
}

const importEcdhKeyWrapperFromMaster = async (masterKey, salt) => {
  const keyWrapper = await window.crypto.subtle.deriveKey(
    hkdf.getParams(ECDH_KEY_WRAPPER, salt),
    masterKey,
    aesKw.AES_KW_PARAMS,
    aesKw.KEY_IS_NOT_EXTRACTABLE,
    aesKw.KEY_WILL_BE_USED_TO
  )

  return keyWrapper
}

const wrapEcdhPrivateKey = async (ecdhPrivateKey, ecdhKeyWrapper) => {
  const ciphertextArrayBuffer = await window.crypto.subtle.wrapKey(
    aesKw.KEY_TYPE,
    ecdhPrivateKey,
    ecdhKeyWrapper,
    aesKw.AES_KW_PARAMS
  )

  return ciphertextArrayBuffer
}

const unwrapEcdhPrivateKey = async (wrappedEcdhPrivateKey, ecdhKeyWrapper) => {
  const ecdhPrivateKey = await window.crypto.subtle.unwrapKey(
    aesKw.KEY_TYPE,
    wrappedEcdhPrivateKey,
    ecdhKeyWrapper,
    aesKw.AES_KW_PARAMS,
    ECDH_PARAMS,
    KEY_IS_EXTRACTABLE,
    KEY_WILL_BE_USED_TO
  )

  return ecdhPrivateKey
}

const generateEcdhKeyData = async (masterKey, ecdsaPrivateKey) => {
  // need to generate new key pair because cannot derive ECDH key pair using HKDF in WebCrypto
  const ecdhKeyPair = await generateKeyPair()

  // derive a key wrapper using HKDF to wrap the ECDH private key and store it on server
  const ecdhKeyWrapperSalt = hkdf.generateSalt()
  const ecdhKeyWrapper = await importEcdhKeyWrapperFromMaster(masterKey, ecdhKeyWrapperSalt)
  const wrappedEcdhPrivateKey = await wrapEcdhPrivateKey(ecdhKeyPair.privateKey, ecdhKeyWrapper)

  const ecdhPublicKey = await getRawPublicKeyFromPublicKey(ecdhKeyPair.publicKey)
  const signedEcdhPublicKey = await ecdsa.sign(ecdsaPrivateKey, ecdhPublicKey)

  return {
    ecdhPrivateKey: ecdhKeyPair.privateKey,
    ecdhPublicKey: base64.encode(ecdhPublicKey),
    wrappedEcdhPrivateKey: base64.encode(wrappedEcdhPrivateKey),
    signedEcdhPublicKey: base64.encode(signedEcdhPublicKey),
    ecdhKeyWrapperSalt: base64.encode(ecdhKeyWrapperSalt),
  }
}

export default {
  generateEcdhKeyData,
  importEcdhKeyWrapperFromMaster,
  getRawPublicKeyFromPublicKey,
  unwrapEcdhPrivateKey,
}
