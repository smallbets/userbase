import uuidv4 from 'uuid/v4'
import server from './server'
import Worker from './worker.js'
import auth from './auth'
import crypto from './Crypto'
import stateManager from './stateManager'
import { appendBuffers } from './Crypto/utils'
import { getSecondsSinceT0 } from './utils'

/**

    Webworker runs to determine if user's transaction log size
    is above the limit and bundles it to S3 if so. This is
    called after every write to the server.

 */
const initializeBundlingProcess = async (key) => {
  const worker = new Worker()
  if (!key) key = await auth.getKeyFromLocalStorage() // can't read local storage from worker
  worker.postMessage(key)
}

/**

    Takes an item as input, encrypts the item client-side,
    then sends the encrypted item to the database for storage.

    Example call:

      const milk = await db.insert({ todo: 'remember the milk' })

      console.log(milk)
      // Output:
      //
      //    {
      //      item-id {String} - client side generated GUID for item
      //      record {object} - decrypted object provided by the user
      //      ciphertext {ArrayBuffer} - encrypted record
      //    }
      //

 */
const insert = async (item) => {
  const key = await auth.getKeyFromLocalStorage()
  const encryptedItem = await crypto.aesGcm.encrypt(key, item)

  const itemId = uuidv4()

  const sequenceNo = await server.db.insert(itemId, encryptedItem)

  const result = stateManager.insertItem(itemId, sequenceNo, item)

  initializeBundlingProcess(key)

  return {
    ...result,
    ciphertext: encryptedItem
  }
}

const batchInsert = async (items) => {
  const key = await auth.getKeyFromLocalStorage()
  const encryptionPromises = items.map(item => crypto.aesGcm.encrypt(key, item))
  const encryptedItems = await Promise.all(encryptionPromises)

  const { buffer, byteLengths } = appendBuffers(encryptedItems)

  const itemsMetadata = items.map((item, i) => ({
    itemId: uuidv4(),
    byteLength: byteLengths[i]
  }))

  const sequenceNos = await server.db.batchInsert(itemsMetadata, buffer)

  const itemsToReturn = sequenceNos.map((sequenceNo, i) => {
    const itemId = itemsMetadata[i].itemId
    const record = items[i]

    const result = stateManager.insertItem(itemId, sequenceNo, record)

    return {
      ...result,
      ciphertext: encryptedItems[i]
    }
  })

  initializeBundlingProcess(key)

  return itemsToReturn
}

/**

    Takes the old item and new item as input, encrypts the new
    item client-side, then sends the encrypted item along
    with the item id to the database for storage.

    Example call:

      const orangeJuice = await db.update(milk, { todo: 'remember the orange juice' })

      console.log(orangeJuice)
      // Output:
      //
      //    {
      //      item-id {String} - client side generated GUID for item
      //      ciphertext {ArrayBuffer}
      //    }
      //

 */
const update = async (oldItem, newItem) => {
  const key = await auth.getKeyFromLocalStorage()
  const encryptedItem = await crypto.aesGcm.encrypt(key, newItem)

  const itemId = oldItem['item-id']

  const sequenceNo = await server.db.update(itemId, encryptedItem)

  const result = stateManager.updateItem(itemId, sequenceNo, newItem)

  initializeBundlingProcess(key)

  return {
    ...result,
    ciphertext: encryptedItem
  }
}

const batchUpdate = async (oldItems, newItems) => {
  const key = await auth.getKeyFromLocalStorage()
  const encryptionPromises = newItems.map(item => crypto.aesGcm.encrypt(key, item))
  const encryptedItems = await Promise.all(encryptionPromises)

  const { buffer, byteLengths } = appendBuffers(encryptedItems)

  const updatedItemsMetadata = oldItems.map((item, index) => ({
    itemId: item['item-id'],
    byteLength: byteLengths[index]
  }))

  const sequenceNos = await server.db.batchUpdate(updatedItemsMetadata, buffer)

  const itemsToReturn = sequenceNos.map((sequenceNo, i) => {
    const itemId = updatedItemsMetadata[i].itemId
    const record = newItems[i]

    const result = stateManager.updateItem(itemId, sequenceNo, record)

    return {
      ...result,
      ciphertext: encryptedItems[i]
    }
  })

  initializeBundlingProcess(key)

  return itemsToReturn
}

/**

    Deletes the provided item. Returns true if successful.

    Example call:

      await db.delete(orangeJuice)

 */
const deleteFunction = async (item) => {
  const itemId = item['item-id']

  const sequenceNo = await server.db.delete(itemId)

  stateManager.deleteItem(itemId, sequenceNo)

  initializeBundlingProcess()

  return true
}

const batchDelete = async (items) => {
  const itemIds = items.map(item => item['item-id'])

  const sequenceNos = await server.db.batchDelete(itemIds)

  sequenceNos.forEach((sequenceNo, i) => {
    const itemId = itemIds[i]

    stateManager.deleteItem(itemId, sequenceNo)
  })

  initializeBundlingProcess()

  return true
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

const getMapFunctionThatUsesIterator = (arr) => {
  return function (cb, thisArg) {
    const result = []
    let index = 0
    cb.bind(thisArg)
    for (const a of arr) {
      result.push(cb(a, index, arr))
      index++
    }
    return result
  }
}

const getIteratorToSkipDeletedItems = (itemsInOrderOfInsertion) => {
  return function () {
    return {
      current: 0,
      last: itemsInOrderOfInsertion.length - 1,

      next() {
        let item = itemsInOrderOfInsertion[this.current]
        let itemIsDeleted = !item

        while (itemIsDeleted && this.current < this.last) {
          this.current++
          item = itemsInOrderOfInsertion[this.current]
          itemIsDeleted = !item
        }

        if (this.current < this.last || (this.current === this.last && !itemIsDeleted)) {
          this.current++
          return { done: false, value: item }
        } else {
          return { done: true }
        }
      }
    }
  }
}

const setIteratorsToSkipDeletedItems = (itemsInOrderOfInsertion) => {
  itemsInOrderOfInsertion[Symbol.iterator] = getIteratorToSkipDeletedItems(itemsInOrderOfInsertion)

  // hacky solution to overwrite native map function. All other native Array functions
  // remain unaffected
  itemsInOrderOfInsertion.map = getMapFunctionThatUsesIterator(itemsInOrderOfInsertion)
}

/**

    Returns the latest state of all items in the db in the order they
    were originally inserted.

    If an item has been updated, the most recent version of the item
    is included in the state.

    If an item has been deleted, it's possible that it will still
    show up in the result as an undefined element.

    For example, after the following sequence of actions:

      const milk = await db.insert({ todo: 'remember the milk' })
      const orangeJuice = await db.insert({ todo: 'buy orange juice' })
      await db.insert({ todo: 'create the most useful app of all time' })
      await db.delete(orangeJuice)
      await db.update(milk, { todo: milk.record.todo, completed: true })

    The response would look like this:

      [
        {
          'item-id: '50bf2e6e-9776-441e-8215-08966581fcec',
          record: {
            todo: 'remember the milk',
            completed: true
          }
        },
        undefined, // the deleted orange juice
        {
          'item-id': 'b09cf9c2-86bd-499c-af06-709d5c11f64b',
          record: {
            todo: 'create the most useful app of all time'
          }
        }
      ]

  */
const query = async () => {
  const key = await auth.getKeyFromLocalStorage()

  // retrieving user's transaction log
  let t0 = performance.now()
  const { transactionLog, bundleSeqNo } = await server.db.queryTransactionLog()
  console.log(`Retrieved user's transaction log in ${getSecondsSinceT0(t0)}s`)

  let encryptedDbState
  // if server sets bundle-seq-no header, that means the transaction log starts
  // with transactions with sequence number > bundle-seq-no. Thus the transactions
  // in the log need to be applied to the db state bundled at bundle-seq-no
  if (bundleSeqNo) {
    // retrieving user's encrypted db state
    t0 = performance.now()
    encryptedDbState = await server.db.queryEncryptedDbState(bundleSeqNo)
    console.log(`Retrieved user's encrypted db state in ${getSecondsSinceT0(t0)}s`)
  }

  // starting to set up client state
  t0 = performance.now()
  const itemsInOrderOfInsertion = await setupClientState(key, transactionLog, encryptedDbState)
  console.log(`Set up client side state in ${getSecondsSinceT0(t0)}s`)

  setIteratorsToSkipDeletedItems(itemsInOrderOfInsertion)

  return itemsInOrderOfInsertion
}

/**

    Gets the items in order of insertion from memory. If a client
    is using 2 devices to access the application and inserts a new item
    from another device, this function will not return the newly inserted item.
    For that, use the query() function.

 */
const getLatestState = () => {
  const itemsInOrderOfInsertion = stateManager.getItems()

  setIteratorsToSkipDeletedItems(itemsInOrderOfInsertion)

  return itemsInOrderOfInsertion
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
