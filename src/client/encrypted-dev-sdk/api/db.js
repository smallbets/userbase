import axios from 'axios'

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
  queryEncryptedDbState,
  queryTransactionLog,
  acquireLock,
  releaseLock,
  bundleTxLog
}
