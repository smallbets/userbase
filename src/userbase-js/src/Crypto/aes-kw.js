const KEY_TYPE = 'jwk'

const KEY_IS_NOT_EXTRACTABLE = false
const KEY_WILL_BE_USED_TO = ['wrapKey', 'unwrapKey']

const AES_KW = 'AES-KW'
const BIT_SIZE = 256
const AES_KW_PARAMS = {
  name: AES_KW,
  length: BIT_SIZE
}

export default {
  KEY_TYPE,
  KEY_IS_NOT_EXTRACTABLE,
  KEY_WILL_BE_USED_TO,
  AES_KW_PARAMS,
}
