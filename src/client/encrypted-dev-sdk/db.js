import axios from 'axios'
import crypto from './Crypto'
import stateManager from './stateManager'

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
      }, function(err, product) {
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
  const response = await axios.post('/api/db/insert', encryptedItem)
  const insertedItem = response.data

  const itemToReturn = {
    ...insertedItem,
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
    data: encryptedItem
  })
  const updatedItem = response.data

  const itemToReturn = {
    ...oldItem,
    ...updatedItem,
    record: newItem
  }

  stateManager().updateItem(itemToReturn)

  return itemToReturn
}

const deleteFunction = async (item) => {
  const response = await axios.post('/api/db/delete', {
    itemId: item['item-id']
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
          'sequence-no': 3,
          command: 'Insert',
          record: {
            todo: 'remember the milk'
          }
        },
        {
          'item-id': 'b09cf9c2-86bd-499c-af06-709d5c11f64b',
          'sequence-no': 5,
          command: 'Update',
          record: {
            todo: 'create the most useful app of all time',
            completed: true
          }
        },
        {
          'item-id': 'ea264f5f-027e-41cf-8852-7514c8c81369',
          'sequence-no': 2,
          command: 'Delete'
        }
      ]

    Note for future optimization consideration: the server does not
    need to respond with the user's entire transaction log. It only
    needs to send deleted items, the latest update of items,
    and all inserts.

 */
const query = async () => {
  const dbLogResponse = await axios.get('/api/db/query')

  const dbLog = dbLogResponse.data
  const key = await crypto.aesGcm.getKeyFromLocalStorage()

  const itemsInOrderOfInsertion = []
  const indexesOfItemsInOrderOfInsertionArray = {}

  const tempItemMap = {}

  const itemsWithEncryptedRecords = []
  const decryptedRecordsPromises = []

  for (let i = 0; i < dbLog.length; i++) {
    const currentOperation = dbLog[i]
    if (currentOperation.command === 'Insert') {
      const currentOperationItemId = currentOperation['item-id']
      const item = tempItemMap[currentOperationItemId] || null
      indexesOfItemsInOrderOfInsertionArray[currentOperationItemId] = itemsInOrderOfInsertion.push(item) - 1
    }

    const mostRecentOperation = dbLog[dbLog.length - 1 - i]
    const mostRecentOperationItemId = mostRecentOperation['item-id']

    const insertionIndex = indexesOfItemsInOrderOfInsertionArray[mostRecentOperationItemId]
    const mostRecentVersionOfItem = itemsInOrderOfInsertion[insertionIndex] || tempItemMap[mostRecentOperationItemId]
    const thisIsADeleteOperation = mostRecentOperation.command === 'Delete'
    const itemAlreadyMarkedForDeletion = mostRecentVersionOfItem && mostRecentVersionOfItem.command === 'Delete'

    if (!mostRecentVersionOfItem) {
      // possible don't know its insertion index yet, putting it here temporarily
      if (!insertionIndex && insertionIndex !== 0) tempItemMap[mostRecentOperationItemId] = mostRecentOperation
      else itemsInOrderOfInsertion[insertionIndex] = mostRecentOperation

      const itemRecord = mostRecentOperation.record
      if (itemRecord) {
        const encryptedRecord = itemRecord.data
        const encryptedRecordIndex = itemsWithEncryptedRecords.push(mostRecentOperationItemId) - 1
        decryptedRecordsPromises.push(crypto.aesGcm.decrypt(key, new Uint8Array(encryptedRecord)))

        if (!insertionIndex && insertionIndex !== 0) tempItemMap[mostRecentOperationItemId].record = encryptedRecordIndex
        else itemsInOrderOfInsertion[insertionIndex].record = encryptedRecordIndex
      }
    } else if (mostRecentVersionOfItem && thisIsADeleteOperation && !itemAlreadyMarkedForDeletion) {
      // this is needed because an item can be deleted at sequence no 5, but then updated at
      // sequence no 6. The client must honor the deletion
      const itemWithEncryptedRecordIndex = mostRecentVersionOfItem.record
      itemsWithEncryptedRecords.splice(itemWithEncryptedRecordIndex, 1)
      decryptedRecordsPromises.splice(itemWithEncryptedRecordIndex, 1)

      if (!insertionIndex && insertionIndex !== 0) tempItemMap[mostRecentOperationItemId] = mostRecentOperation
      else itemsInOrderOfInsertion[insertionIndex] = mostRecentOperation
    }
  }

  const decryptedRecords = await Promise.all(decryptedRecordsPromises)

  for (let i = 0; i < itemsWithEncryptedRecords.length; i++) {
    const itemId = itemsWithEncryptedRecords[i]
    const indexInOrderOfInsertionArray = indexesOfItemsInOrderOfInsertionArray[itemId]
    itemsInOrderOfInsertion[indexInOrderOfInsertionArray].record = decryptedRecords[i]
  }

  stateManager().setItems(itemsInOrderOfInsertion, indexesOfItemsInOrderOfInsertionArray)

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
