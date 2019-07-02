import crypto from './Crypto'

function EncryptedDevSdk() {
  this.itemsInOrderOfInsertion = []
  this.itemIdsToIndexes = {}
}

EncryptedDevSdk.prototype.setItems = function (itemsInOrderOfInsertion, itemIdsToIndexes) {
  this.itemsInOrderOfInsertion = itemsInOrderOfInsertion
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
  let i = this.itemsInOrderOfInsertion.length - 1
  while (i >= 0 && item['sequence-no'] < i) {
    const itemThatWillBeMoved = this.itemsInOrderOfInsertion[i]
    const itemIdThatWillBeMoved = itemThatWillBeMoved['item-id']
    this.itemIdsToIndexes[itemIdThatWillBeMoved] = this.itemIdsToIndexes[itemIdThatWillBeMoved] + 1
    i--
  }

  const indexToInsertItem = i + 1
  const deleteCount = 0
  this.itemsInOrderOfInsertion.splice(indexToInsertItem, deleteCount, item)
  this.itemIdsToIndexes[item['item-id']] = indexToInsertItem
}

EncryptedDevSdk.prototype.insertItems = function (newItems) {
  let i = this.itemsInOrderOfInsertion.length - 1
  while (i >= 0 && newItems[0]['sequence-no'] < i) {
    const itemThatWillBeMoved = this.itemsInOrderOfInsertion[i]
    const itemIdThatWillBeMoved = itemThatWillBeMoved['item-id']
    this.itemIdsToIndexes[itemIdThatWillBeMoved] = this.itemIdsToIndexes[itemIdThatWillBeMoved] + newItems.length
    i--
  }

  const indexToInsertItems = i + 1
  const deleteCount = 0
  this.itemsInOrderOfInsertion.splice(indexToInsertItems, deleteCount, ...newItems)
  for (let i = 0; i < newItems.length; i++) {
    this.itemIdsToIndexes[newItems[i]['item-id']] = indexToInsertItems + i
  }
}

EncryptedDevSdk.prototype.updateItem = function (item) {
  const index = this.itemIdsToIndexes[item['item-id']]
  const currentItem = this.itemsInOrderOfInsertion[index]
  if (item['sequence-no'] > currentItem['sequence-no'] && currentItem.command !== 'Delete') {
    this.itemsInOrderOfInsertion[index] = item
  }
}

EncryptedDevSdk.prototype.getItems = function () { return this.itemsInOrderOfInsertion }
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

  */
EncryptedDevSdk.prototype.applyTransactionsToDbState = async (key, dbState, transactionLog) => {
  const {
    itemsInOrderOfInsertion,
    itemIdsToOrderOfInsertion
  } = dbState

  const mostRecentStateOfItems = {}

  const itemsWithEncryptedRecords = []
  const decryptedRecordsPromises = []

  let maxSequenceNo = dbState.maxSequenceNo

  for (let i = 0; i < transactionLog.length; i++) {
    // iterate forwards picking up the items in the order they were first inserted
    const currentTransaction = transactionLog[i]
    if (!maxSequenceNo || currentTransaction['sequence-no'] > maxSequenceNo) maxSequenceNo = currentTransaction['sequence-no']
    if (currentTransaction.command === 'Insert') {
      const currentItemId = currentTransaction['item-id']
      const item = mostRecentStateOfItems[currentItemId] || null
      itemIdsToOrderOfInsertion[currentItemId] = itemsInOrderOfInsertion.push(item) - 1
    }

    // iterate backwards picking up the most recent state of the item
    const mostRecentTransaction = transactionLog[transactionLog.length - 1 - i]
    const mostRecentItemId = mostRecentTransaction['item-id']

    const insertionIndex = itemIdsToOrderOfInsertion[mostRecentItemId]
    const mostRecentVersionOfItem = itemsInOrderOfInsertion[insertionIndex] || mostRecentStateOfItems[mostRecentItemId]
    const thisIsADeleteTransaction = mostRecentTransaction.command === 'Delete'
    const itemAlreadyMarkedForDeletion = mostRecentVersionOfItem && mostRecentVersionOfItem.command === 'Delete'

    if (!mostRecentVersionOfItem || mostRecentTransaction['sequence-no'] > mostRecentVersionOfItem['sequence-no']) {
      if (!insertionIndex && insertionIndex !== 0) {
        // possible we don't know when the item was first inserted yet because have not encountered
        // its insertion while iterating forward yet. Putting its most recent state in this object
        // so it will be picked up when iterating forward
        mostRecentStateOfItems[mostRecentItemId] = mostRecentTransaction
      } else {
        itemsInOrderOfInsertion[insertionIndex] = mostRecentTransaction
      }

      const itemRecord = mostRecentTransaction.record
      if (itemRecord) {
        const encryptedRecord = itemRecord.data
        const encryptedRecordIndex = itemsWithEncryptedRecords.push(mostRecentItemId) - 1
        decryptedRecordsPromises.push(crypto.aesGcm.decrypt(key, new Uint8Array(encryptedRecord)))

        if (!insertionIndex && insertionIndex !== 0) {
          mostRecentStateOfItems[mostRecentItemId].record = encryptedRecordIndex
        } else {
          itemsInOrderOfInsertion[insertionIndex].record = encryptedRecordIndex
        }
      }
    } else if (mostRecentVersionOfItem && thisIsADeleteTransaction && !itemAlreadyMarkedForDeletion) {
      // this is needed because an item can be deleted at sequence no 5, but then updated at
      // sequence no 6. The client must honor the deletion
      const itemWithEncryptedRecordIndex = mostRecentVersionOfItem.record
      itemsWithEncryptedRecords.splice(itemWithEncryptedRecordIndex, 1)
      decryptedRecordsPromises.splice(itemWithEncryptedRecordIndex, 1)

      if (!insertionIndex && insertionIndex !== 0) {
        mostRecentStateOfItems[mostRecentItemId] = mostRecentTransaction
      } else {
        itemsInOrderOfInsertion[insertionIndex] = mostRecentTransaction
      }
    }
  }

  const decryptedRecords = await Promise.all(decryptedRecordsPromises)

  for (let i = 0; i < itemsWithEncryptedRecords.length; i++) {
    const itemId = itemsWithEncryptedRecords[i]
    const indexInOrderOfInsertionArray = itemIdsToOrderOfInsertion[itemId]
    itemsInOrderOfInsertion[indexInOrderOfInsertionArray].record = decryptedRecords[i]
  }

  return {
    itemsInOrderOfInsertion,
    itemIdsToOrderOfInsertion,
    maxSequenceNo
  }
}

let state = new EncryptedDevSdk()
export default state
