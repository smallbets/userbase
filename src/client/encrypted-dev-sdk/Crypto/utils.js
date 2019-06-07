// https://developers.google.com/web/updates/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
export const arrayBufferToString = (buf) => {
  return String.fromCharCode.apply(null, new Uint16Array(buf))
}

export const stringToArrayBuffer = (str) => {
  var buf = new ArrayBuffer(str.length * 2) // 2 bytes for each char
  var bufView = new Uint16Array(buf)
  for (var i = 0, strLen = str.length; i < strLen; i++) {
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
  var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength)
  tmp.set(new Uint8Array(buffer1), 0)
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength)
  return tmp.buffer
}
