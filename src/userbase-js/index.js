import config from './config'
import auth from './auth'
import db from './db'

if (!global._babelPolyfill) {
  require('babel-polyfill')
}

export default {
  configure: config.configure,

  signUp: auth.signUp,
  signIn: auth.signIn,
  signOut: auth.signOut,
  forgotPassword: auth.forgotPassword,

  getLastUsedUsername: auth.getLastUsedUsername,
  signInWithSession: auth.signInWithSession,

  openDatabase: db.openDatabase,

  insert: db.insert,
  update: db.update,
  delete: db.delete,
  transaction: db.transaction
}
