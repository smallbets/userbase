import 'babel-polyfill'
import config from './config'
import auth from './auth'
import db from './db'

export default {
  updateConfig: config.updateConfig,

  signUp: auth.signUp,
  signIn: auth.signIn,
  signOut: auth.signOut,
  initSession: auth.initSession,
  importKey: auth.importKey,
  grantDatabaseAccess: auth.grantDatabaseAccess,

  openDatabase: db.openDatabase,
  createDatabase: db.createDatabase,
  findDatabases: db.findDatabases,

  insert: db.insert,
  update: db.update,
  delete: db.delete,
  batch: db.batch
}
