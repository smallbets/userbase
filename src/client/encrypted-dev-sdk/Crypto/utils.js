const ONE_KB = 1024
const TEN_KB = 10 * ONE_KB

// https://stackoverflow.com/a/20604561/11601853
export const arrayBufferToString = (buf) => {
  const bufView = new Uint16Array(buf)
  const length = bufView.length
  let result = ''
  let chunkSize = TEN_KB // using chunks prevents stack from blowing up

  for (var i = 0; i < length; i += chunkSize) {
    if (i + chunkSize > length) {
      chunkSize = length - i
    }
    const chunk = bufView.subarray(i, i + chunkSize)
    result += String.fromCharCode.apply(null, chunk)
  }

  return result
}

// https://developers.google.com/web/updates/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
export const stringToArrayBuffer = (str) => {
  let buf = new ArrayBuffer(str.length * 2) // 2 bytes for each char
  let bufView = new Uint16Array(buf)
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i)
  }
  return buf
}

/**
* Creates a new Uint8Array based on two different ArrayBuffers
*
* Source: https://gist.github.com/72lions/4528834
*
* @param {ArrayBuffers} buffer1 The first buffer.
* @param {ArrayBuffers} buffer2 The second buffer.
* @return {ArrayBuffers} The new ArrayBuffer created out of the two.
*
*/
export const appendBuffer = (buffer1, buffer2) => {
  const tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength)
  tmp.set(new Uint8Array(buffer1), 0)
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength)
  return tmp.buffer
}

export const appendBuffers = (buffers) => {
  const bufferByteLengths = buffers.map(buffer => buffer.byteLength)
  const totalByteLength = bufferByteLengths.reduce((byteLengthSum, bufferByteLength) => byteLengthSum + bufferByteLength)

  const tmp = new Uint8Array(totalByteLength)
  let currentByteLength = 0
  for (let i = 0; i < buffers.length; i++) {
    tmp.set(new Uint8Array(buffers[i]), currentByteLength)
    currentByteLength += bufferByteLengths[i]
  }

  return {
    buffer: tmp.buffer,
    byteLengths: bufferByteLengths
  }
}

export const hexStringToArrayBuffer = (hexString) => {
  if (hexString.length % 2 !== 0) throw new Error('Hex string must be even length')
  const halfHexStringLen = hexString.length / 2
  const array = []
  for (let i = 0; i < halfHexStringLen; i++) {
    const byteStartIndex = i * 2
    const byte = hexString.substring(byteStartIndex, byteStartIndex + 2)
    const byteAsInt = parseInt(byte, 16)
    array.push(byteAsInt)
  }
  return new Uint8Array(array)
}
