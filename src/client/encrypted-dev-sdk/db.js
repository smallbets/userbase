import axios from 'axios'
import crypto from './Crypto'

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
  return axios.post('/api/db/insert', encryptedItem)
}

const update = async () => {
  console.log('Called update in client')
}

const deleteFunction = async () => {
  console.log('Called delete in client')
}

const query = async () => {
  const itemsResponse = await axios.get('/api/db/query')

  const items = itemsResponse.data
  const key = await crypto.aesGcm.getKeyFromLocalStorage()

  const decryptedRecordsPromises = items.map((item) => {
    const itemRecord = item.record.data
    return crypto.aesGcm.decrypt(key, new Uint8Array(itemRecord))
  })

  const decryptedRecords = await Promise.all(decryptedRecordsPromises)

  return decryptedRecords.map((decryptedRecord, index) => ({
    ...items[index],
    record: decryptedRecord
  }))
}

export default {
  insert,
  update,
  'delete': deleteFunction,
  query
}
