import 'babel-polyfill'
import axios from 'axios'
import crypto from './Crypto'
import stateManager from './stateManager'
import { stringToArrayBuffer } from './Crypto/utils'

self.onmessage = async (e) => {
  const keyString = e.data
  const key = await crypto.aesGcm.importKey(keyString)

  const dbResponse = await axios.get('/api/db/query')

  const formBoundary = dbResponse
    .headers['x-content-type']
    .split('multipart/form-data; boundary=')[1]

  const forms = dbResponse.data.split(formBoundary)

  const dbOpLogFormData = forms[1]
  const startOfDbOpLog = dbOpLogFormData.indexOf('[')
  const dbOpLogString = dbOpLogFormData.substring(startOfDbOpLog)
  const dbOperationLog = JSON.parse(dbOpLogString)

  const dbStateFormData = forms[2]
  const contentType = 'Content-Type: application/octet-stream'
  const indexOfContentType = dbStateFormData.indexOf(contentType)

  let dbState = {
    itemsInOrderOfInsertion: [],
    itemIdsToOrderOfInsertion: {}
  }
  if (indexOfContentType > -1) {
    const startOfDbState = 4 + dbStateFormData.indexOf(contentType) + contentType.length
    const dbStateString = dbStateFormData.substring(startOfDbState)
    const encryptedDbState = stringToArrayBuffer(dbStateString)
    dbState = await crypto.aesGcm.decrypt(key, encryptedDbState)
  }

  dbState = await stateManager.applyOperationsToDbState(key, dbState, dbOperationLog)

  const bundleSeqNo = dbState.maxSequenceNo

  const encryptedDbState = await crypto.aesGcm.encrypt(key, dbState)

  await axios({
    method: 'POST',
    url: '/api/db/bundle-op-log',
    params: {
      bundleSeqNo
    },
    data: encryptedDbState
  })
}
