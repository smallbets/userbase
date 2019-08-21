import auth from './auth'
import db from './db'
import localData from './localData'

export default {
  ...auth,
  ...localData,
  openDatabase: db.openDatabase,
  createDatabase: db.createDatabase,
  insert: db.insert,
  update: db.update,
  delete: db.delete,
  batch: db.batch
}
