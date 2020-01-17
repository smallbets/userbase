import auth from './auth'
import db from './db'

export default {
  init: auth.init,

  signUp: auth.signUp,
  signIn: auth.signIn,
  signOut: auth.signOut,
  updateUser: auth.updateUser,
  deleteUser: auth.deleteUser,
  getLastUsedUsername: auth.getLastUsedUsername,

  openDatabase: db.openDatabase,

  insertItem: db.insertItem,
  updateItem: db.updateItem,
  deleteItem: db.deleteItem,
  transaction: db.transaction
}
