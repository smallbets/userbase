// https://developers.google.com/web/updates/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
export const arrayBufferToString = (buf) => {
  return String.fromCharCode.apply(null, new Uint16Array(buf))
}

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
