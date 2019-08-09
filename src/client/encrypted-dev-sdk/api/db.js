import axios from 'axios'

const TEN_SECONDS_MS = 10 * 1000
const TIMEOUT = TEN_SECONDS_MS

const insert = async (itemId, encryptedItem) => {
  const response = await axios({
    method: 'POST',
    url: '/api/db/insert',
    params: {
      itemId
    },
    data: encryptedItem,
    timeout: TIMEOUT
  })
  return response.data.sequenceNo
}

const update = async (itemId, encryptedItem) => {
  const response = await axios({
    method: 'POST',
    url: '/api/db/update',
    params: {
      itemId
    },
    data: encryptedItem,
    timeout: TIMEOUT
  })
  return response.data.sequenceNo
}

const delete_ = async (itemId) => {
  const response = await axios({
    method: 'POST',
    url: '/api/db/delete',
    data: {
      itemId
    },
    timeout: TIMEOUT
  })
  return response.data.sequenceNo
}

const queryEncryptedDbState = async (bundleSeqNo) => {
  const encryptedDbStateResponse = await axios({
    method: 'GET',
    url: '/api/db/query/db-state',
    params: {
      bundleSeqNo
    },
    responseType: 'arraybuffer'
  })
  return encryptedDbStateResponse.data
}

const queryTransactionLog = async (startingSeqNo) => {
  const transactionLogResponse = await axios({
    method: 'GET',
    url: '/api/db/query/tx-log',
    params: {
      startingSeqNo
    }
  })

  const transactionLog = transactionLogResponse.data
  const bundleSeqNo = Number(transactionLogResponse.headers['bundle-seq-no'])

  return {
    transactionLog,
    bundleSeqNo
  }
}

const acquireLock = async () => {
  const lockResponse = await axios.post('/api/db/acq-bundle-tx-log-lock')
  const lockId = lockResponse.data
  return lockId
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

const bundleTxLog = async (bundleSeqNo, lockId, encryptedDbState) => {
  await axios({
    method: 'POST',
    url: '/api/db/bundle-tx-log',
    params: {
      bundleSeqNo,
      lockId
    },
    data: encryptedDbState
  })
}

export default {
  insert,
  update,
  delete: delete_,
  queryEncryptedDbState,
  queryTransactionLog,
  acquireLock,
  releaseLock,
  bundleTxLog
}
