import auth from './auth'
import db from './db'

if (!global._babelPolyfill) {
  require('babel-polyfill')
}

export default {
  init: auth.init,

  signUp: auth.signUp,
  signIn: auth.signIn,
  signOut: auth.signOut,
  forgotPassword: auth.forgotPassword,

  importKey: auth.importKey,

  getLastUsedUsername: auth.getLastUsedUsername,

  openDatabase: db.openDatabase,

  insert: db.insert,
  update: db.update,
  delete: db.delete,
  transaction: db.transaction
}
