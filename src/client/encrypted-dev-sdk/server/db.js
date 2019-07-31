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

const batchInsert = async (itemsMetadata, buffer) => {
  const response = await axios({
    method: 'POST',
    url: '/api/db/batch-insert',
    params: {
      itemsMetadata
    },
    data: buffer,
    timeout: TIMEOUT
  })
  return response.data.sequenceNos
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

const batchUpdate = async (updatedItemsMetadata, buffer) => {
  const response = await axios({
    method: 'POST',
    url: '/api/db/batch-update',
    params: {
      updatedItemsMetadata
    },
    data: buffer,
    timeout: TIMEOUT
  })
  return response.data.sequenceNos
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

const batchDelete = async (itemIds) => {
  const response = await axios({
    method: 'POST',
    url: '/api/db/batch-delete',
    data: {
      itemIds
    },
    timeout: TIMEOUT
  })
  return response.data.sequenceNos
}

const queryEncryptedDbState = async (bundleSeqNo) => {
  const encryptedDbStateResponse = await axios({
    url: '/api/db/query/db-state',
    method: 'GET',
    params: {
      bundleSeqNo
    },
    responseType: 'arraybuffer'
  })
  return encryptedDbStateResponse.data
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
  batchInsert,
  batchUpdate,
  batchDelete,
  queryEncryptedDbState,
  acquireLock,
  releaseLock,
  bundleTxLog,
}
