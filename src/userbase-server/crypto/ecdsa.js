import crypto from 'crypto'

const verify = (data, publicKey, signature) => {
  const verifier = crypto.createVerify('SHA256')

  verifier.update(data).end()

  const verifyParams = {
    key: Buffer.from(publicKey, 'base64'),

    // these are specific to WebCrypto
    format: 'der',
    type: 'spki',
    dsaEncoding: 'ieee-p1363'
  }

  return verifier.verify(verifyParams, signature, 'base64')
}

export default {
  verify,
}
