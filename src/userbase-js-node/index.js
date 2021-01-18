// Subtle Crypto
const { Crypto } = require('@peculiar/webcrypto')
global.window = { crypto: new Crypto() }

// XMLHttpRequest
global.XMLHttpRequest = require('xhr2')

// localStorage
const { LocalStorage } = require('node-localstorage')
global.localStorage = new LocalStorage('./__userbase_localStorage')

// sessionStorage
// https://gist.github.com/juliocesar/926500#gistcomment-1620487
global.sessionStorage = {
  _data: {},
  setItem: function (id, val) { return this._data[id] = String(val) },
  getItem: function (id) { return Object.prototype.hasOwnProperty.call(this._data, 'id') ? this._data[id] : undefined },
  removeItem: function (id) { return delete this._data[id] },
  clear: function () { return this._data = {} }
}

// WebSocket
global.WebSocket = require('isomorphic-ws')


// DOMException
global.DOMException = require('domexception')

// atob and btoa
global.atob = require('atob')
global.btoa = require('btoa')

// Blob
global.Blob = require('blob-polyfill').Blob

// URL.createObjectUrl
// URL.revokeObjectUrl
// https://stackoverflow.com/a/59902602/11601853
function mergeTypedArrays(arrays) {
  // sum of individual array lengths
  let totalLength = arrays.reduce((acc, value) => acc + value.length, 0)

  if (!arrays.length) return null

  let result = new Uint8Array(totalLength)

  // for each array - copy it over result
  // next array is copied right after the previous one
  let length = 0
  for (let array of arrays) {
    result.set(array, length)
    length += array.length
  }

  return result
}

URL.createObjectURL = function (blob) {
  const blobString = Buffer.from(mergeTypedArrays(blob._buffer)).toString('base64')
  return `data:${blob.type};base64,${blobString}`
}

// no-op because createObjectURL returns all data embedded into the URL, so no reference to revoke
URL.revokeObjectURL = () => { }

// Worker
global.Worker = require('web-worker')

// File
global.File = require('web-file-polyfill').File

// FileReader
global.FileReader = class FileReader {
  onload = () => {}

  readAsArrayBuffer = async (blob) => {
    const arrayBuffer = await blob.arrayBuffer()
    const e = { target: { result: arrayBuffer }}
    this.onload(e)
  }
}

module.exports = require('userbase-js')
