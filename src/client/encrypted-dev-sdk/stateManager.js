let state

function EncryptedDevSdk() {
  this.items = {}
}

EncryptedDevSdk.prototype.setItems = function (items) { this.items = items }
EncryptedDevSdk.prototype.setItem = function (item) { this.items[item['item-id']] = item }
EncryptedDevSdk.prototype.getItems = function () { return this.items }

EncryptedDevSdk.prototype.clearState = function () { state = new EncryptedDevSdk() }

export default () => {
  if (state) return state
  state = new EncryptedDevSdk()
  return state
}
