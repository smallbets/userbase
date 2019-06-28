import 'babel-polyfill'
import axios from 'axios'
import crypto from './Crypto'
import stateManager from './stateManager'
import { sizeOfDdbItems } from './utils'

const ONE_KB = 1024
const ONE_MB = 1024 * ONE_KB
const NINETY_PERCENT_OF_ONE_MB = Math.floor(.9 * ONE_MB)

self.onmessage = async (e) => {
  const keyString = e.data
  const key = await crypto.aesGcm.importKey(keyString)

  const dbOperationLogResponse = await axios.get('/api/db/query/db-op-log')

  const dbOperationLog = dbOperationLogResponse.data
  const oldBundleSeqNo = Number(dbOperationLogResponse.headers['bundle-seq-no'])

  if (sizeOfDdbItems(dbOperationLog) > 10) {
    console.log('Flushing db operation log!')

    let dbState
    if (oldBundleSeqNo) {
      const dbStateResponse = await axios({
        url: '/api/db/query/db-state',
        method: 'GET',
        params: {
          bundleSeqNo: oldBundleSeqNo
        },
        responseType: 'arraybuffer'
      })

      const encryptedDbState = dbStateResponse.data
      dbState = await crypto.aesGcm.decrypt(key, encryptedDbState)
    } else {
      dbState = {
        itemsInOrderOfInsertion: [],
        itemIdsToOrderOfInsertion: {}
      }
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
}
