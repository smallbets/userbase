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

      Example:

        {
          'item-id': 'b09cf9c2-86bd-499c-af06-709d5c11f64b',
          'sequence-no': 1
        }
 */
const insert = async (item) => {
  const key = await crypto.aesGcm.getKeyFromLocalStorage()
  const encryptedItem = await crypto.aesGcm.encrypt(key, item)
  const response = await axios.post('/api/db/insert', encryptedItem)
  const insertedItem = response.data

  const itemToReturn = {
    ...insertedItem,
    record: item,
    command: 'Insert'
  }

  stateManager().setItem(itemToReturn)

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
    record: newItem,
    command: 'Update'
  }

  stateManager().setItem(itemToReturn)

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

  stateManager().setItem(itemToReturn)

  return itemToReturn
}

/**

    Returns the latest state of the db as an object where each key
    is an item id and each value is an item with its record decrypted.

    If an item has been updated, the most recent version of the item
    is included in the state.

    If an item has been deleted, its original record is not included
    in the state.

    An example response would look like this:

      {
        '50bf2e6e-9776-441e-8215-08966581fcec': {
          'sequence-no': 3,
          command: 'Insert',
          record: { todo: 'remember the milk' }
        },
        'b09cf9c2-86bd-499c-af06-709d5c11f64b': {
          'sequence-no': 5,
          command: 'Update',
          record: {
            todo: 'create the most useful app of all time',
            completed: true
          }
        },
        'ea264f5f-027e-41cf-8852-7514c8c81369': {
          'sequence-no': 2,
          command: 'Delete'
        }
      }

 */
const query = async () => {
  const itemsResponse = await axios.get('/api/db/query')

  const items = itemsResponse.data
  const key = await crypto.aesGcm.getKeyFromLocalStorage()

  const itemMap = {}
  const itemsWithEncryptedRecords = []
  const decryptedRecordsPromises = []

  for (let i = 0; i < items.length; i++) {
    const item = items[items.length - 1 - i] // iterate in reverse order to get most recent items first
    const itemId = item['item-id']

    const itemAlreadyExists = !!itemMap[itemId]
    const itemIsDeleted = item.command === 'Deleted'
    const itemAlreadyMarkedForDeletion = itemAlreadyExists
      && itemMap[itemId].command === 'Deleted'

    if (!itemAlreadyExists) {
      itemMap[itemId] = item

      const itemRecord = item.record
      if (itemRecord) {
        itemsWithEncryptedRecords.push(itemId)
        decryptedRecordsPromises.push(crypto.aesGcm.decrypt(key, new Uint8Array(itemRecord.data)))
        const itemWithEncryptedRecordIndex = itemsWithEncryptedRecords.length
        itemMap[itemId].record = itemWithEncryptedRecordIndex
      }
    } else if (itemAlreadyExists && itemIsDeleted && !itemAlreadyMarkedForDeletion) {
      // this is needed because an item can be deleted at sequence no 5, but then updated at
      // sequence no 6. The client must honor the deletion
      const itemWithEncryptedRecordIndex = itemMap[itemId].record
      itemsWithEncryptedRecords.splice(itemWithEncryptedRecordIndex, 1)
      decryptedRecordsPromises.splice(itemWithEncryptedRecordIndex, 1)
      itemMap[itemId] = item
    }
  }

  const decryptedRecords = await Promise.all(decryptedRecordsPromises)

  for (let i = 0; i < itemsWithEncryptedRecords.length; i++) {
    const itemId = itemsWithEncryptedRecords[i]
    itemMap[itemId].record = decryptedRecords[i]
  }

  stateManager().setItems(itemMap)

  return itemMap
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
