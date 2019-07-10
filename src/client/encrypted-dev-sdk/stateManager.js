import crypto from './Crypto'

function StateManager() {
  this.itemsInOrderOfInsertion = []
  this.itemIdsToIndexes = {}
}

StateManager.prototype.setItems = function (itemsInOrderOfInsertion, itemIdsToIndexes) {
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
StateManager.prototype.insertItem = function (item) {
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

StateManager.prototype.insertItems = function (newItems) {
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

StateManager.prototype.updateItem = function (item) {
  const index = this.itemIdsToIndexes[item['item-id']]
  const currentItem = this.itemsInOrderOfInsertion[index]
  if (item['sequence-no'] > currentItem['sequence-no']) {
    this.itemsInOrderOfInsertion[index] = item
  }
}

StateManager.prototype.deleteItem = function (item) {
  const index = this.itemIdsToIndexes[item['item-id']]
  this.itemsInOrderOfInsertion[index] = undefined
}

StateManager.prototype.getItems = function () { return this.itemsInOrderOfInsertion }
StateManager.prototype.getItemIdsToIndexes = function () { return this.itemIdsToIndexes }

StateManager.prototype.clearState = function () { state = new StateManager() }

const filterDeletedItems = function (unfilteredItemsInOrderOfInsertion) {
  const itemsInOrderOfInsertion = []
  const itemIdsToOrderOfInsertion = {}

  for (let i = 0; i < unfilteredItemsInOrderOfInsertion.length; i++) {
    const item = unfilteredItemsInOrderOfInsertion[i]
    const itemId = item['item-id']

    if (item.command !== 'Delete') {
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
      'sequence-no': item['sequence-no'],
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

    Returns the latest state of all items in the db in the order they
    were originally inserted.

    If an item has been updated, the most recent version of the item
    is included in the state.

    If an item has been deleted, it's possible that it will still
    show up in the result as an undefined element.

    If the filterAllDeletedItems flag is set to true, then no deleted
    items will be returned.

    For example, after the following sequence of actions:

      const milk = await db.insert({ todo: 'remember the milk' })
      const orangeJuice = await db.insert({ todo: 'buy orange juice' })
      await db.insert({ todo: 'create the most useful app of all time' })
      await db.delete(orangeJuice)
      await db.update(milk, { todo: milk.record.todo, completed: true })

    Without setting the filterAllDeletedItems to true, the response would
    look like this:

      [
        {
          'item-id: '50bf2e6e-9776-441e-8215-08966581fcec',
          'sequence-no': 4,
          record: {
            todo: 'remember the milk',
            completed: true
          }
        },
        undefined, // the deleted orange juice
        {
          'item-id': 'b09cf9c2-86bd-499c-af06-709d5c11f64b',
          'sequence-no': 2,
          record: {
            todo: 'create the most useful app of all time'
          }
        }
      ]

    With setting the filterAllDeletedItems flag to true, the response would
    look like this:

      [
        {
          'item-id: '50bf2e6e-9776-441e-8215-08966581fcec',
          'sequence-no': 4,
          record: {
            todo: 'remember the milk',
            completed: true
          }
        },
        {
          'item-id': 'b09cf9c2-86bd-499c-af06-709d5c11f64b',
          'sequence-no': 2,
          record: {
            todo: 'create the most useful app of all time'
          }
        }
      ]

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
