import 'babel-polyfill'
import api from './api'
import crypto from './Crypto'
import stateManager from './stateManager'
import { sizeOfDdbItems } from './utils'

const ONE_KB = 1024
const ONE_MB = 1024 * ONE_KB
const NINETY_PERCENT_OF_ONE_MB = Math.floor(.9 * ONE_MB)

const getDbState = async (key, oldBundleSeqNo) => {
  if (oldBundleSeqNo) {
    const encryptedDbState = await api.db.queryEncryptedDbState(oldBundleSeqNo)

    const dbState = await crypto.aesGcm.decryptJson(key, encryptedDbState)
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

  const encryptedDbState = await crypto.aesGcm.encryptJson(key, newDbState)

  await api.db.bundleTxLog(newBundleSeqNo, lockId, encryptedDbState)
}



const handleMessage = async (key) => {
  let lockId
  try {
    lockId = await api.db.acquireLock()

    const transactionLogResponse = await api.db.queryTransactionLog()
    const transactionLog = transactionLogResponse.transactionLog
    const oldBundleSeqNo = transactionLogResponse.bundleSeqNo

    if (sizeOfDdbItems(transactionLog) > NINETY_PERCENT_OF_ONE_MB) {
      console.log('Bundling transaction log!')
      await bundleTransactionLog(key, transactionLog, oldBundleSeqNo, lockId)
      console.log('Finished bundling transaction log!')
    } else {
      await api.db.releaseLock(lockId)
    }

  } catch (e) {
    if (!e.response || e.response.data.readableMessage !== 'Failed to acquire lock') {
      console.log('Error in bundle transaction log worker process', e)
    }

    if (lockId) {
      try {
        await api.db.releaseLock(lockId)
      } catch (err) {
        console.log('Failed to release bundle transaction log lock with', e)
      }
    }
  }

  self.close() // allows garbage collector to free memory allocated to this worker
}

self.onmessage = (e) => {
  const key = e.data
  handleMessage(key)
}
