import 'babel-polyfill'
import axios from 'axios'
import crypto from './Crypto'
import stateManager from './stateManager'
import { sizeOfDdbItems } from './utils'

const ONE_KB = 1024
const ONE_MB = 1024 * ONE_KB
const NINETY_PERCENT_OF_ONE_MB = Math.floor(.9 * ONE_MB)

const getDbState = async (key, oldBundleSeqNo) => {
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

    const dbState = await crypto.aesGcm.decrypt(key, encryptedDbState)
    return dbState
  } else {
    return {
      itemsInOrderOfInsertion: [],
      itemIdsToOrderOfInsertion: {}
    }
  }
}

const bundleTransactionLog = async (key, transactionLog, oldBundleSeqNo, lockId) => {
  const dbState = await getDbState(key, oldBundleSeqNo)

  const filterDeletedItemsFromState = true
  const newDbState = await stateManager.applyTransactionsToDbState(
    key, dbState, transactionLog, filterDeletedItemsFromState
  )

  const newBundleSeqNo = newDbState.maxSequenceNo

  const encryptedDbState = await crypto.aesGcm.encrypt(key, newDbState)

  await axios({
    method: 'POST',
    url: '/api/db/bundle-tx-log',
    params: {
      bundleSeqNo: newBundleSeqNo,
      lockId
    },
    data: encryptedDbState
  })
}

const releaseLock = async (lockId) => {
  await axios({
    method: 'POST',
    url: '/api/db/rel-bundle-tx-log-lock',
    params: {
      lockId
    }
  })
}

const handleMessage = async (key) => {
  let lockId
  try {
    const lockResponse = await axios.post('/api/db/acq-bundle-tx-log-lock')
    lockId = lockResponse.data

    const transactionLogResponse = await axios.get('/api/db/query/tx-log')

    const transactionLog = transactionLogResponse.data
    const oldBundleSeqNo = Number(transactionLogResponse.headers['bundle-seq-no'])

    if (sizeOfDdbItems(transactionLog) > NINETY_PERCENT_OF_ONE_MB) {
      console.log('Bundling transaction log!')
      await bundleTransactionLog(key, transactionLog, oldBundleSeqNo, lockId)
    } else {
      await releaseLock(lockId)
    }

  } catch (e) {
    if (!e.response || e.response.data.readableMessage !== 'Failed to acquire lock') {
      console.log(`Error in bundle transaction log worker process ${e}`)
    }

    if (lockId) {
      try {
        await releaseLock(lockId)
      } catch (err) {
        console.log(`Failed to release bundle transaction log lock with ${e}`)
      }
    }
  }

  self.close() // allows garbage collector to free memory allocated to this worker
}

self.onmessage = (e) => {
  const key = e.data
  handleMessage(key)
}
