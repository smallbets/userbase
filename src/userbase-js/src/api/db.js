import config from '../config'
import { processXhr } from './utils'

export const uploadBundleChunk = async (token, userId, databaseId, seqNo, chunkNo, chunk) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const method = 'POST'
    const url = `${config.getEndpoint()}/api/bundle-chunk?userbaseJsVersion=${config.USERBASE_JS_VERSION}` +
      `&userId=${userId}&databaseId=${databaseId}&seqNo=${seqNo}&chunkNumber=${chunkNo}`

    xhr.open(method, url)
    xhr.setRequestHeader('Authorization', 'Bearer ' + token)
    xhr.send(new Uint8Array(chunk)) // Uint8Array view prevents deprecation warning in Safari

    processXhr(xhr, resolve, reject)
  })
}
