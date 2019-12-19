// source: https://github.com/manishsaraan/email-validator
const EMAIL_REGEX = /^[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/
export const validateEmail = (email) => {
  if (!email) return false

  if (email.length > 254) return false

  const valid = EMAIL_REGEX.test(email)
  if (!valid) return false

  // Further checking of some things regex can't handle
  const parts = email.split('@')
  if (parts[0].length > 64) return false

  const domainParts = parts[1].split('.')
  if (domainParts.some(part => part.length > 63)) return false

  return true
}

export const sizeOfDdbItem = (item) => {
  let bytes = 0

  for (let attribute in item) {
    if (!item.hasOwnProperty(attribute)) continue

    bytes += attribute.length

    const value = item[attribute]

    switch (typeof value) {
      case 'string':
        bytes += value.length // The size of a string is(length of attribute name) + (number of UTF - 8 - encoded bytes).
        break
      case 'number':
        bytes += Math.ceil((value.toString().length / 2)) + 1 // Numbers are variable length, with up to 38 significant digits.Leading and trailing zeroes are trimmed.The size of a number is approximately(length of attribute name) + (1 byte per two significant digits) + (1 byte).
        break
      case 'boolean':
        bytes += 1 // The size of a null attribute or a Boolean attribute is(length of attribute name) + (1 byte).
        break
      default:
        if (value.type === 'Buffer') {
          bytes += value.data.length // The size of a binary attribute is (length of attribute name) + (number of raw bytes).
        }
    }
  }

  return bytes
}

// matches stringToArrayBuffer from userbase-js/Crypto/utils
// https://developers.google.com/web/updates/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
export const stringToArrayBuffer = (str) => {
  let buf = new ArrayBuffer(str.length * 2) // 2 bytes for each char
  let bufView = new Uint16Array(buf)
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i)
  }
  return new Uint16Array(buf)
}
