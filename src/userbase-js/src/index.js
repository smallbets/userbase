import auth from './auth'
import db from './db'
import payments from './payments'

export default {
  init: auth.init,

  signUp: auth.signUp,
  signIn: auth.signIn,
  signOut: auth.signOut,
  updateUser: auth.updateUser,
  deleteUser: auth.deleteUser,
  forgotPassword: auth.forgotPassword,

  openDatabase: db.openDatabase,

  insertItem: db.insertItem,
  updateItem: db.updateItem,
  deleteItem: db.deleteItem,
  putTransaction: db.putTransaction,

  uploadFile: db.uploadFile,
  getFile: db.getFile,

  getDatabases: db.getDatabases,
  shareDatabase: db.shareDatabase,
  modifyDatabasePermissions: db.modifyDatabasePermissions,
  getVerificationMessage: db.getVerificationMessage,
  verifyUser: db.verifyUser,

  purchaseSubscription: payments.purchaseSubscription,
  cancelSubscription: payments.cancelSubscription,
  resumeSubscription: payments.resumeSubscription,
  updatePaymentMethod: payments.updatePaymentMethod,
}
