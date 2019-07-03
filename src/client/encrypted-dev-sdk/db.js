import uuidv4 from 'uuid/v4'
import axios from 'axios'
import Worker from './worker.js'
import crypto from './Crypto'
import stateManager from './stateManager'
import { appendBuffers } from './Crypto/utils'
import { getSecondsSinceT0 } from './utils'

/**

    Webworker runs to determine if user's transaction log size
    is above the limit and bundles it to S3 if so. This is
    called after every write to the server.

 */
const initializeBundlingProcess = () => {
  const worker = new Worker()
  worker.postMessage(localStorage.getItem('key')) // can't read localStorage from worker
}

/**

    Takes an item as input, encrypts the item client-side,
    then sends the encrypted item to the database for storage.

    Returns the item id of the item stored in the database
    as well as the sequence number of the write operation. A
    user's sequence number increases monotonically with each
    write operation to the database.

    Example call:

      db.insert({
        todo: 'remember the milk'
      }).then(function (item) {
        // asynchronously called
      });

    Response:

      item-id {String} - GUID for item inserted into the database
      sequence-no {Integer} - counter for user's write operations on the database
      command {String} - the write operation type

      Example:

        {
          'item-id': 'b09cf9c2-86bd-499c-af06-709d5c11f64b',
          'sequence-no': 1,
          command: 'Insert'
        }

 */
const insert = async (item) => {
  const key = await crypto.aesGcm.getKeyFromLocalStorage()
  const encryptedItem = await crypto.aesGcm.encrypt(key, item)

  const response = await axios({
    method: 'POST',
    url: '/api/db/insert',
    params: {
      itemId: uuidv4()
    },
    data: encryptedItem
  })

  const insertedItem = response.data

  const itemToReturn = {
    ...insertedItem,
    encryptedRecord: encryptedItem,
    record: item
  }

  stateManager.insertItem(itemToReturn)

  initializeBundlingProcess()

  return itemToReturn
}

const batchInsert = async (items) => {
  const key = await crypto.aesGcm.getKeyFromLocalStorage()
  const encryptionPromises = items.map(item => crypto.aesGcm.encrypt(key, item))
  const encryptedItems = await Promise.all(encryptionPromises)

  const { buffer, byteLengths } = appendBuffers(encryptedItems)

  const itemsMetadata = items.map((item, i) => ({
    itemId: uuidv4(),
    byteLength: byteLengths[i]
  }))

  const response = await axios({
    method: 'POST',
    url: '/api/db/batch-insert',
    params: {
      itemsMetadata
    },
    data: buffer
  })

  const insertedItems = response.data

  const itemsToReturn = insertedItems.map((insertedItem, index) => ({
    ...insertedItem,
    encryptedRecord: encryptedItems[index],
    record: items[index]
  }))

  stateManager.insertItems(itemsToReturn)

  initializeBundlingProcess()

  return itemsToReturn
}

const update = async (oldItem, newItem) => {
  const key = await crypto.aesGcm.getKeyFromLocalStorage()
  const encryptedItem = await crypto.aesGcm.encrypt(key, newItem)

  const response = await axios({
    method: 'POST',
    url: '/api/db/update',
    params: {
      itemId: oldItem['item-id']
    },
    data: encryptedItem
  })

  const updatedItem = response.data

  const itemToReturn = {
    ...oldItem,
    ...updatedItem,
    encryptedRecord: encryptedItem,
    record: newItem
  }

  stateManager.updateItem(itemToReturn)

  initializeBundlingProcess()

  return itemToReturn
}

const batchUpdate = async (oldItems, newItems) => {
  const key = await crypto.aesGcm.getKeyFromLocalStorage()
  const encryptionPromises = newItems.map(item => crypto.aesGcm.encrypt(key, item))
  const encryptedItems = await Promise.all(encryptionPromises)

  const { buffer, byteLengths } = appendBuffers(encryptedItems)

  const updatedItemsMetadata = oldItems.map((item, index) => ({
    itemId: item['item-id'],
    byteLength: byteLengths[index]
  }))

  const response = await axios({
    method: 'POST',
    url: '/api/db/batch-update',
    params: {
      updatedItemsMetadata
    },
    data: buffer
  })

  const updatedItems = response.data

  const itemsToReturn = updatedItems.map((updatedItem, index) => {
    const itemToReturn = {
      ...oldItems[index],
      ...updatedItem,
      encryptedRecord: encryptedItems[index],
      record: newItems[index]
    }

    stateManager.updateItem(itemToReturn)

    return itemToReturn
  })

  initializeBundlingProcess()

  return itemsToReturn
}

const deleteFunction = async (item) => {
  const response = await axios({
    method: 'POST',
    url: '/api/db/delete',
    data: {
      itemId: item['item-id']
    }
  })

  const deletedItem = response.data

  const itemToReturn = {
    ...item,
    ...deletedItem
  }

  delete itemToReturn.record

  stateManager.updateItem(itemToReturn)

  initializeBundlingProcess()

  return itemToReturn
}

const batchDelete = async (items) => {
  const itemIds = items.map(item => item['item-id'])

  const response = await axios({
    method: 'POST',
    url: '/api/db/batch-delete',
    data: {
      itemIds
    }
  })

  const deletedItems = response.data

  const itemsToReturn = deletedItems.map((deletedItem, index) => {
    const itemToReturn = {
      ...items[index],
      ...deletedItem
    }

    stateManager.updateItem(itemToReturn)

    return itemToReturn
  })

  initializeBundlingProcess()

  return itemsToReturn
}

const setupClientState = async (key, transactionLog, encryptedDbState) => {
  let dbState = encryptedDbState
    ? await crypto.aesGcm.decrypt(key, encryptedDbState)
    : {
      itemsInOrderOfInsertion: [],
      itemIdsToOrderOfInsertion: {}
    }

  dbState = await stateManager.applyTransactionsToDbState(key, dbState, transactionLog)

  const { itemsInOrderOfInsertion, itemIdsToOrderOfInsertion } = dbState
  stateManager.setItems(itemsInOrderOfInsertion, itemIdsToOrderOfInsertion)

  return itemsInOrderOfInsertion
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

const query = async () => {
  const key = await crypto.aesGcm.getKeyFromLocalStorage()

  // retrieving user's transaction log
  let t0 = performance.now()
  const transactionLogResponse = await axios.get('/api/db/query/tx-log')
  console.log(`Retrieved user's transaction log in ${getSecondsSinceT0(t0)}s`)

  const transactionLog = transactionLogResponse.data
  const bundleSeqNo = Number(transactionLogResponse.headers['bundle-seq-no'])

  let encryptedDbState
  // if server sets bundle-seq-no header, that means the transaction log starts
  // with transactions with sequence number > bundle-seq-no. Thus the transactions
  // in the log need to be applied to the db state bundled at bundle-seq-no
  if (bundleSeqNo) {
    // retrieving user's encrypted db state
    t0 = performance.now()
    encryptedDbState = await queryEncryptedDbState(bundleSeqNo)
    console.log(`Retrieved user's encrypted db state in ${getSecondsSinceT0(t0)}s`)
  }

  // starting to set up client state
  t0 = performance.now()
  const itemsInOrderOfInsertion = await setupClientState(key, transactionLog, encryptedDbState)
  console.log(`Set up client side state in ${getSecondsSinceT0(t0)}s`)

  return itemsInOrderOfInsertion
}

const getLatestState = () => {
  return stateManager.getItems()
}

export default {
  insert,
  batchInsert,
  update,
  batchUpdate,
  'delete': deleteFunction,
  batchDelete,
  query,
  getLatestState
}
