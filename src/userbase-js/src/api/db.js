import config from '../config'
import { processXhr } from './utils'

const TIMEOUT = 30 * 1000

export const uploadBundleChunk = async (userId, databaseId, seqNo, bundleId, chunkNo, chunk) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const method = 'POST'
    const url = `${config.getEndpoint()}/api/bundle-chunk?userbaseJsVersion=${config.USERBASE_JS_VERSION}&` +
      `userId=${userId}&` +
      `databaseId=${databaseId}&` +
      `seqNo=${seqNo}&` +
      `bundleId=${bundleId}&` +
      `chunkNumber=${chunkNo}`

    xhr.open(method, url)
    xhr.send(new Uint8Array(chunk)) // Uint8Array view prevents deprecation warning in Safari

    processXhr(xhr, resolve, reject, TIMEOUT)
  })
}
