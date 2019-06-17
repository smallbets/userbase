import axios from 'axios'
import crypto from './Crypto'
import stateManager from './stateManager'

const TIMEOUT = 5 * 1000

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
    timeout: TIMEOUT,
    data: encryptedItem
  })
  const insertedItem = response.data

  const itemToReturn = {
    ...insertedItem,
    encryptedRecord: encryptedItem,
    record: item
  }

  stateManager().insertItem(itemToReturn)

  return itemToReturn
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
    timeout: TIMEOUT,
    data: encryptedItem
  })
  const updatedItem = response.data

  const itemToReturn = {
    ...oldItem,
    ...updatedItem,
    encryptedRecord: encryptedItem,
    record: newItem
  }

  stateManager().updateItem(itemToReturn)

  return itemToReturn
}

const deleteFunction = async (item) => {
  const response = await axios({
    method: 'POST',
    url: '/api/db/delete',
    timeout: TIMEOUT,
    data: {
      itemId: item['item-id']
    }
  })
  const deletedItem = response.data

  const itemToReturn = {
    ...item,
    ...deletedItem,
    command: 'Delete'
  }

  delete itemToReturn.record

  stateManager().updateItem(itemToReturn)

  return itemToReturn
}

/**

    Returns the latest state of all items in the db in the order they
    were originally inserted.

    If an item has been updated, the most recent version of the item
    is included in the state.

    If an item has been deleted, its original record is not included
    in the state.

    An example response would look like this:

      [
        {
          'item-id: '50bf2e6e-9776-441e-8215-08966581fcec',
          'sequence-no': 0,
          command: 'Insert',
          record: {
            todo: 'remember the milk'
          }
        },
        {
          'item-id': 'b09cf9c2-86bd-499c-af06-709d5c11f64b',
          'sequence-no': 4,
          command: 'Update',
          record: {
            todo: 'create the most useful app of all time',
            completed: true
          }
        },
        {
          'item-id': 'ea264f5f-027e-41cf-8852-7514c8c81369',
          'sequence-no': 3,
          command: 'Delete'
        }
      ]

    Note for future optimization consideration: the server does not
    need to respond with the user's entire transaction log. It only
    needs to send deleted items, the latest update of items,
    and all inserts.

 */
const query = async () => {
  let t0 = performance.now()
  const dbLogResponse = await axios.get('/api/db/query')
  let t1 = performance.now()

  const dbLog = dbLogResponse.data
  if (process.env.NODE_ENV == 'development') {
    const timeToRunQueryServerSide = `${((t1 - t0) / 1000).toFixed(2)}`
    console.log(`Found ${dbLog.length} items in transaction log in ${timeToRunQueryServerSide}s`)
  }

  const key = await crypto.aesGcm.getKeyFromLocalStorage()

  const itemsInOrderOfInsertion = []
  const itemIdsToOrderOfInsertion = {}

  const mostRecentStateOfItems = {}

  const itemsWithEncryptedRecords = []
  const decryptedRecordsPromises = []

  t0 = performance.now()
  for (let i = 0; i < dbLog.length; i++) {
    // iterate forwards picking up the items in the order they were first inserted
    const currentOperation = dbLog[i]
    if (currentOperation.command === 'Insert') {
      const currentOperationItemId = currentOperation['item-id']
      const item = mostRecentStateOfItems[currentOperationItemId] || null
      itemIdsToOrderOfInsertion[currentOperationItemId] = itemsInOrderOfInsertion.push(item) - 1
    }

    // iterate backwards picking up the most recent state of the item
    const mostRecentOperation = dbLog[dbLog.length - 1 - i]
    const mostRecentOperationItemId = mostRecentOperation['item-id']

    const insertionIndex = itemIdsToOrderOfInsertion[mostRecentOperationItemId]
    const mostRecentVersionOfItem = itemsInOrderOfInsertion[insertionIndex] || mostRecentStateOfItems[mostRecentOperationItemId]
    const thisIsADeleteOperation = mostRecentOperation.command === 'Delete'
    const itemAlreadyMarkedForDeletion = mostRecentVersionOfItem && mostRecentVersionOfItem.command === 'Delete'

    if (!mostRecentVersionOfItem) {
      if (!insertionIndex && insertionIndex !== 0) {
        // possible we don't know when the item was first inserted yet because have not encountered
        // its insertion while iterating forward yet. Putting its most recent state in this object
        // so it will be picked up when iterating forward
        mostRecentStateOfItems[mostRecentOperationItemId] = mostRecentOperation
      } else {
        itemsInOrderOfInsertion[insertionIndex] = mostRecentOperation
      }

      const itemRecord = mostRecentOperation.record
      if (itemRecord) {
        const encryptedRecord = itemRecord.data
        const encryptedRecordIndex = itemsWithEncryptedRecords.push(mostRecentOperationItemId) - 1
        decryptedRecordsPromises.push(crypto.aesGcm.decrypt(key, new Uint8Array(encryptedRecord)))

        if (!insertionIndex && insertionIndex !== 0) {
          mostRecentStateOfItems[mostRecentOperationItemId].record = encryptedRecordIndex
        } else {
          itemsInOrderOfInsertion[insertionIndex].record = encryptedRecordIndex
        }
      }
    } else if (mostRecentVersionOfItem && thisIsADeleteOperation && !itemAlreadyMarkedForDeletion) {
      // this is needed because an item can be deleted at sequence no 5, but then updated at
      // sequence no 6. The client must honor the deletion
      const itemWithEncryptedRecordIndex = mostRecentVersionOfItem.record
      itemsWithEncryptedRecords.splice(itemWithEncryptedRecordIndex, 1)
      decryptedRecordsPromises.splice(itemWithEncryptedRecordIndex, 1)

      if (!insertionIndex && insertionIndex !== 0) {
        mostRecentStateOfItems[mostRecentOperationItemId] = mostRecentOperation
      } else {
        itemsInOrderOfInsertion[insertionIndex] = mostRecentOperation
      }
    }
  }

  const decryptedRecords = await Promise.all(decryptedRecordsPromises)

  for (let i = 0; i < itemsWithEncryptedRecords.length; i++) {
    const itemId = itemsWithEncryptedRecords[i]
    const indexInOrderOfInsertionArray = itemIdsToOrderOfInsertion[itemId]
    itemsInOrderOfInsertion[indexInOrderOfInsertionArray].record = decryptedRecords[i]
  }

  t1 = performance.now()
  if (process.env.NODE_ENV == 'development') {
    const timeToSetUpStateClientSide = `${((t1 - t0) / 1000).toFixed(2)}`
    console.log(`Set up client side state in ${timeToSetUpStateClientSide}s`)
  }

  stateManager().setItems(itemsInOrderOfInsertion, itemIdsToOrderOfInsertion)

  return itemsInOrderOfInsertion
}

const getLatestState = () => {
  return stateManager().getItems()
}

export default {
  insert,
  update,
  'delete': deleteFunction,
  query,
  getLatestState
}
