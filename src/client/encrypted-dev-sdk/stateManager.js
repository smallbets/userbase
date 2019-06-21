import crypto from './Crypto'

let state

function EncryptedDevSdk() {
  this.items = []
  this.itemIdsToIndexes = {}
}

EncryptedDevSdk.prototype.setItems = function (items, itemIdsToIndexes) {
  this.items = items
  this.itemIdsToIndexes = itemIdsToIndexes
}

/**

    Insert item where its sequence number is highest.

    You can't assume that this will be called every time the latest item is inserted,
    therefore it might need to insert it somewhere close to the back rather than the
    very back of the array.

    For example, a user calls:

      Promise.all([
        db.insert(todo1),
        db.insert(todo2),
        db.insert(todo3)
      ])

    It's possible the database may insert in this order: todo2, todo3, todo1

    However the client will call this insertItem function in this order: todo1, todo2, todo3

    Thus, each time this function is called, it uses the item's given sequence number
    to insert it in the correct place in the array.

*/
EncryptedDevSdk.prototype.insertItem = function (item) {
  let i = this.items.length - 1
  while (i >= 0 && item['sequence-no'] < i) {
    const itemThatWillBeMoved = this.items[i]
    const itemIdThatWillBeMoved = itemThatWillBeMoved['item-id']
    this.itemIdsToIndexes[itemIdThatWillBeMoved] = this.itemIdsToIndexes[itemIdThatWillBeMoved] + 1
    i--
  }

  const indexToInsertItem = i + 1
  const deleteCount = 0
  this.items.splice(indexToInsertItem, deleteCount, item)
  this.itemIdsToIndexes[item['item-id']] = indexToInsertItem
}

EncryptedDevSdk.prototype.insertItems = function (newItems) {
  let i = this.items.length - 1
  while (i >= 0 && newItems[0]['sequence-no'] < i) {
    const itemThatWillBeMoved = this.items[i]
    const itemIdThatWillBeMoved = itemThatWillBeMoved['item-id']
    this.itemIdsToIndexes[itemIdThatWillBeMoved] = this.itemIdsToIndexes[itemIdThatWillBeMoved] + newItems.length
    i--
  }

  const indexToInsertItems = i + 1
  const deleteCount = 0
  this.items.splice(indexToInsertItems, deleteCount, ...newItems)
  for (let i = 0; i < newItems.length; i++) {
    this.itemIdsToIndexes[newItems[i]['item-id']] = indexToInsertItems + i
  }
}

EncryptedDevSdk.prototype.updateItem = function (item) {
  const index = this.itemIdsToIndexes[item['item-id']]
  const currentItem = this.items[index]
  if (item['sequence-no'] > currentItem['sequence-no'] && currentItem.command !== 'Delete') {
    this.items[index] = item
  }
}

EncryptedDevSdk.prototype.getItems = function () { return this.items }
EncryptedDevSdk.prototype.getItemIdsToIndexes = function () { return this.itemIdsToIndexes }

EncryptedDevSdk.prototype.clearState = function () { state = new EncryptedDevSdk() }

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
EncryptedDevSdk.prototype.buildDbStateFromTransactionLog = async function (transactionLog, key) {
  const itemsInOrderOfInsertion = []
  const itemIdsToOrderOfInsertion = {}

  const mostRecentStateOfItems = {}

  const itemsWithEncryptedRecords = []
  const decryptedRecordsPromises = []

  for (let i = 0; i < transactionLog.length; i++) {
    // iterate forwards picking up the items in the order they were first inserted
    const currentOperation = transactionLog[i]
    if (currentOperation.command === 'Insert') {
      const currentOperationItemId = currentOperation['item-id']
      const item = mostRecentStateOfItems[currentOperationItemId] || null
      itemIdsToOrderOfInsertion[currentOperationItemId] = itemsInOrderOfInsertion.push(item) - 1
    }

    // iterate backwards picking up the most recent state of the item
    const mostRecentOperation = transactionLog[transactionLog.length - 1 - i]
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

  return { itemsInOrderOfInsertion, itemIdsToOrderOfInsertion }
}


export default () => {
  if (state) return state
  state = new EncryptedDevSdk()
  return state
}
