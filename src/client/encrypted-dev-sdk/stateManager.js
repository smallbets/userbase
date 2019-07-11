import crypto from './Crypto'

function StateManager() {
  this.itemsInOrderOfInsertion = []
  this.itemIdsToIndexes = {}

  // these are used to manage state without exposing sequence-no in itemsInOrderOfInsertion array
  this.insertionIndexToInsertSeqNoInTransactionLog = {}
  this.insertionIndexToCurrentSeqNoInTransactionLog = {}
}

StateManager.prototype.setItems = function (itemsInOrderOfInsertion, itemIdsToIndexes) {
  this.itemsInOrderOfInsertion = itemsInOrderOfInsertion
  this.itemIdsToIndexes = itemIdsToIndexes
}

StateManager.prototype.needToMoveItemWithLowerSeqNo = function (i, itemSequenceNo) {
  const sequenceNoNextItemWasInsertedAt = this.insertionIndexToInsertSeqNoInTransactionLog[i]
  const atStartOfTransactionLog = !sequenceNoNextItemWasInsertedAt
  return !atStartOfTransactionLog && itemSequenceNo < sequenceNoNextItemWasInsertedAt
}

StateManager.prototype.getItemsInsertionIndex = function (itemSequenceNo) {
  let i = this.itemsInOrderOfInsertion.length - 1

  while (this.needToMoveItemWithLowerSeqNo(i, itemSequenceNo)) {
    const itemThatWillBeMoved = this.itemsInOrderOfInsertion[i]
    const itemIdThatWillBeMoved = itemThatWillBeMoved['item-id']

    const oldInsertionIndex = this.itemIdsToIndexes[itemIdThatWillBeMoved]

    const insertSeqNoThatWillBeMoved = this.insertionIndexToInsertSeqNoInTransactionLog[oldInsertionIndex]
    const currentSeqNoThatWillBeMoved = this.insertionIndexToCurrentSeqNoInTransactionLog[oldInsertionIndex]

    const newInsertionIndex = oldInsertionIndex + 1

    this.itemIdsToIndexes[itemIdThatWillBeMoved] = newInsertionIndex
    this.insertionIndexToInsertSeqNoInTransactionLog[newInsertionIndex] = insertSeqNoThatWillBeMoved
    this.insertionIndexToCurrentSeqNoInTransactionLog[newInsertionIndex] = currentSeqNoThatWillBeMoved

    i--
  }

  return i + 1
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
StateManager.prototype.insertItem = function (itemId, sequenceNo, record) {
  // possible applyTransactionsToDbState picked the item up, don't re-insert it
  const itemAlreadyInserted = !!this.itemIdsToIndexes[itemId]
  if (itemAlreadyInserted) return

  const insertionIndex = this.getItemsInsertionIndex(sequenceNo)

  const deleteCount = 0

  const finalItem = {
    'item-id': itemId,
    record
  }
  this.itemsInOrderOfInsertion.splice(insertionIndex, deleteCount, finalItem)
  this.itemIdsToIndexes[itemId] = insertionIndex
  this.insertionIndexToInsertSeqNoInTransactionLog[insertionIndex] = sequenceNo
  this.insertionIndexToCurrentSeqNoInTransactionLog[insertionIndex] = sequenceNo

  return finalItem
}

StateManager.prototype.updateItem = function (itemId, updatedSeqNo, record) {
  const insertionIndex = this.itemIdsToIndexes[itemId]

  const currentItem = this.itemsInOrderOfInsertion[insertionIndex]
  const itemIsDeleted = !currentItem
  if (itemIsDeleted) throw new Error('Item is already deleted')

  const currentSequenceNo = this.insertionIndexToCurrentSeqNoInTransactionLog[insertionIndex]

  if (!currentSequenceNo || updatedSeqNo > currentSequenceNo) {
    const finalItem = {
      'item-id': itemId,
      record: record
    }

    this.itemsInOrderOfInsertion[insertionIndex] = finalItem
    this.insertionIndexToCurrentSeqNoInTransactionLog[insertionIndex] = updatedSeqNo

    return finalItem
  } else {
    return currentItem
  }
}

StateManager.prototype.deleteItem = function (itemId, sequenceNo) {
  const insertionIndex = this.itemIdsToIndexes[itemId]
  this.itemsInOrderOfInsertion[insertionIndex] = undefined

  this.insertionIndexToCurrentSeqNoInTransactionLog[insertionIndex] = sequenceNo
}

StateManager.prototype.getItems = function () { return this.itemsInOrderOfInsertion }
StateManager.prototype.getItemIdsToIndexes = function () { return this.itemIdsToIndexes }

StateManager.prototype.clearState = function () { state = new StateManager() }

const filterDeletedItems = function (unfilteredItemsInOrderOfInsertion) {
  const itemsInOrderOfInsertion = []
  const itemIdsToOrderOfInsertion = {}

  for (let i = 0; i < unfilteredItemsInOrderOfInsertion.length; i++) {
    const item = unfilteredItemsInOrderOfInsertion[i]
    const itemIsDeleted = !item

    if (!itemIsDeleted) {
      const itemId = item['item-id']
      itemIdsToOrderOfInsertion[itemId] = itemsInOrderOfInsertion.push(item) - 1
    }
  }

  return {
    itemsInOrderOfInsertion,
    itemIdsToOrderOfInsertion
  }
}

const setItemOrderOfInsertion = function (
  transaction,
  itemIdsToOrderOfInsertion
) {
  if (transaction.command === 'Insert') {
    const itemId = transaction['item-id']

    const thisIsNotADuplicateInsertion = !itemIdsToOrderOfInsertion[itemId]

    if (thisIsNotADuplicateInsertion) {
      itemIdsToOrderOfInsertion[itemId] = Object.keys(itemIdsToOrderOfInsertion).length
    }
  }
}

const setMostRecentStateOfNewItem = function (
  key,
  transaction,
  mostRecentStateOfNewItems,
  decryptedRecordsPromises
) {
  const itemId = transaction['item-id']
  const mostRecentStateOfItem = mostRecentStateOfNewItems[itemId]

  const thisIsADeleteTransaction = transaction.command === 'Delete'

  const alreadyMarkedForDeletion = mostRecentStateOfItem && mostRecentStateOfItem.command === 'Delete'

  if (!alreadyMarkedForDeletion) {
    if (!mostRecentStateOfItem) {
      mostRecentStateOfNewItems[itemId] = transaction

      if (!thisIsADeleteTransaction) {
        const itemRecord = transaction.record
        const encryptedRecord = itemRecord.data

        const decryptedRecordPromise = crypto.aesGcm.decrypt(key, new Uint8Array(encryptedRecord))
        const decryptedRecordIndex = decryptedRecordsPromises.push(decryptedRecordPromise) - 1

        mostRecentStateOfNewItems[itemId].decryptedRecordIndex = decryptedRecordIndex
      }
    } else if (mostRecentStateOfItem && thisIsADeleteTransaction) {
      // this is needed because an item can be deleted at sequence no 5, but then updated at
      // sequence no 6. The client must honor the deletion
      const decryptedRecordIndex = mostRecentStateOfItem.decryptedRecordIndex
      decryptedRecordsPromises.splice(decryptedRecordIndex, 1)

      mostRecentStateOfNewItems[itemId] = transaction
    }
  }
}

const getFinalItem = (itemId, mostRecentStateOfNewItems, decryptedRecords) => {
  const item = mostRecentStateOfNewItems[itemId]

  const thisItemShouldNotBeDeleted = item.command !== 'Delete'
  if (thisItemShouldNotBeDeleted) {
    // must have had this set in setMostRecentStateOfNewItem()
    const decryptedRecordIndex = item.decryptedRecordIndex

    return {
      'item-id': itemId,
      record: decryptedRecords[decryptedRecordIndex]
    }
  } else {
    return undefined
  }
}

const setDecryptedItemsInOrderOfInsertion = function (
  decryptedRecords,
  mostRecentStateOfNewItems,
  itemIdsToOrderOfInsertion,
  itemsInOrderOfInsertion
) {
  for (const itemId in mostRecentStateOfNewItems) {
    const finalItem = getFinalItem(itemId, mostRecentStateOfNewItems, decryptedRecords)

    const insertionIndex = itemIdsToOrderOfInsertion[itemId]

    itemsInOrderOfInsertion[insertionIndex] = finalItem
  }
}

/**

    Applies all transactions in the transaction log to the provided
    db state.

    Returns an object that looks like this:

      {
        itemsInOrderOfInsertion: [],
        itemIdsToOrderOfInsertion: {},
        maxSequenceNo: Integer
      }

    For example, assume the following input:

      dbState = {
        itemsInOrderOfInsertion: [{
          'item-id: '50bf2e6e-9776-441e-8215-08966581fcec',
          record: {
            todo: 'remember the milk'
          }
        }],
        itemIdsToOrderOfInsertion: {
          '50bf2e6e-9776-441e-8215-08966581fcec': 0
        },
        maxSequenceNo: 0
      }

      transactionLog = [{
        'item-id: '50bf2e6e-9776-441e-8215-08966581fcec',
        'sequence-no': 1,
        record: {
          todo: 'remember the milk',
          completed: true
        }
      }]

    The output would be:

       {
        itemsInOrderOfInsertion: [{
          'item-id: '50bf2e6e-9776-441e-8215-08966581fcec',
          record: {
            todo: 'remember the milk',
            completed: true
          }
        }],
        itemIdsToOrderOfInsertion: {
          '50bf2e6e-9776-441e-8215-08966581fcec': 0
        },
        maxSequenceNo: 1
      }

    If the filterAllDeletedItems flag is set to true, then no deleted
    items (or undefined elements) will be included in the result.

  */
StateManager.prototype.applyTransactionsToDbState = async (key, dbState, transactionLog, filterAllDeletedItems = false) => {
  const {
    itemsInOrderOfInsertion,
    itemIdsToOrderOfInsertion
  } = dbState

  const maxSequenceNo = transactionLog.length > 0
    ? transactionLog[transactionLog.length - 1]['sequence-no']
    : dbState.maxSequenceNo

  const mostRecentStateOfNewItems = {}
  const decryptedRecordsPromises = []

  for (let i = 0; i < transactionLog.length; i++) {
    // iterate forwards picking up the items in the order they were first inserted
    const currentTransaction = transactionLog[i]
    setItemOrderOfInsertion(currentTransaction, itemIdsToOrderOfInsertion)

    // iterate backwards picking up the most recent state of the item
    const mostRecentTransaction = transactionLog[transactionLog.length - 1 - i]
    setMostRecentStateOfNewItem(key, mostRecentTransaction, mostRecentStateOfNewItems, decryptedRecordsPromises)
  }

  const decryptedRecords = await Promise.all(decryptedRecordsPromises)

  setDecryptedItemsInOrderOfInsertion(
    decryptedRecords,
    mostRecentStateOfNewItems,
    itemIdsToOrderOfInsertion,
    itemsInOrderOfInsertion
  )

  const result = filterAllDeletedItems
    ? filterDeletedItems(itemsInOrderOfInsertion)
    : {
      itemsInOrderOfInsertion,
      itemIdsToOrderOfInsertion,
    }

  return {
    ...result,
    maxSequenceNo
  }
}

let state = new StateManager()
export default state
