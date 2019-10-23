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
  init: auth.init,
  importKey: auth.importKey,

  createOrOpenDatabase: db.createOrOpenDatabase,

  insert: db.insert,
  update: db.update,
  delete: db.delete,
  batch: db.batch
}
