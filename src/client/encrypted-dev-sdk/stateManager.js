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
    therefore it might need to insert it somwhere close to the back rather than the
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
  while (i >= 0 && item['sequence-no'] < this.items[i]['sequence-no']) {
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

EncryptedDevSdk.prototype.updateItem = function (item) {
  const index = this.itemIdsToIndexes[item['item-id']]
  const currentItem = this.items[index]
  if (item['sequence-no'] > currentItem['sequence-no'] && currentItem.command !== 'Delete') {
    this.items[index] = item
  }
}

EncryptedDevSdk.prototype.getItems = function () { return this.items }

EncryptedDevSdk.prototype.clearState = function () { state = new EncryptedDevSdk() }

export default () => {
  if (state) return state
  state = new EncryptedDevSdk()
  return state
}
