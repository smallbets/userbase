import axios from 'axios'
import Worker from './worker.js'
import crypto from './Crypto'
import stateManager from './stateManager'
import { appendBuffers, stringToArrayBuffer } from './Crypto/utils'
import { getSecondsSinceT0 } from './utils'

const initalizeWebWorker = () => {
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
    data: encryptedItem
  })

  const insertedItem = response.data
  if (response.headers['init-bundle-process']) initalizeWebWorker()


  const itemToReturn = {
    ...insertedItem,
    encryptedRecord: encryptedItem,
    record: item
  }

  stateManager.insertItem(itemToReturn)
  return itemToReturn
}

const batchInsert = async (items) => {
  const key = await crypto.aesGcm.getKeyFromLocalStorage()
  const encryptionPromises = items.map(item => crypto.aesGcm.encrypt(key, item))
  const encryptedItems = await Promise.all(encryptionPromises)

  const { buffer, byteLengths } = appendBuffers(encryptedItems)

  const response = await axios({
    method: 'POST',
    url: '/api/db/batch-insert',
    params: {
      byteLengths
    },
    data: buffer
  })

  const insertedItems = response.data
  if (response.headers['init-bundle-process']) initalizeWebWorker()

  const itemsToReturn = insertedItems.map((insertedItem, index) => ({
    ...insertedItem,
    encryptedRecord: encryptedItems[index],
    record: items[index]
  }))

  stateManager.insertItems(itemsToReturn)

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
  if (response.headers['init-bundle-process']) initalizeWebWorker()

  const itemToReturn = {
    ...oldItem,
    ...updatedItem,
    encryptedRecord: encryptedItem,
    record: newItem
  }

  stateManager.updateItem(itemToReturn)

  return itemToReturn
}

const batchUpdate = async (oldItems, newItems) => {
  const key = await crypto.aesGcm.getKeyFromLocalStorage()
  const encryptionPromises = newItems.map(item => crypto.aesGcm.encrypt(key, item))
  const encryptedItems = await Promise.all(encryptionPromises)

  const { buffer, byteLengths } = appendBuffers(encryptedItems)

  const updatedRecordsMetadata = oldItems.map((item, index) => ({
    'item-id': item['item-id'],
    byteLength: byteLengths[index]
  }))

  const response = await axios({
    method: 'POST',
    url: '/api/db/batch-update',
    params: {
      updatedRecordsMetadata
    },
    data: buffer
  })

  const updatedItems = response.data
  if (response.headers['init-bundle-process']) initalizeWebWorker()

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
  if (response.headers['init-bundle-process']) initalizeWebWorker()

  const itemToReturn = {
    ...item,
    ...deletedItem
  }

  delete itemToReturn.record

  stateManager.updateItem(itemToReturn)

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
  if (response.headers['init-bundle-process']) initalizeWebWorker()

  const itemsToReturn = deletedItems.map((deletedItem, index) => {
    const itemToReturn = {
      ...items[index],
      ...deletedItem
    }

    stateManager.updateItem(itemToReturn)

    return itemToReturn
  })

  return itemsToReturn
}

const query = async () => {
  const key = await crypto.aesGcm.getKeyFromLocalStorage()

  let t0 = performance.now()
  const dbResponse = await axios.get('/api/db/query')
  if (process.env.NODE_ENV == 'development') {
    console.log(`Retrieved user's db in ${getSecondsSinceT0(t0)}s`)
  }

  t0 = performance.now()
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

  if (process.env.NODE_ENV == 'development') {
    console.log(`Set up client side state in ${getSecondsSinceT0(t0)}s`)
  }

  const { itemsInOrderOfInsertion, itemIdsToOrderOfInsertion } = dbState
  stateManager.setItems(itemsInOrderOfInsertion, itemIdsToOrderOfInsertion)

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
