import userbase from 'userbase-js'

const {
  init,
  signUp,
  signIn,
  signOut,
  updateUser,
  deleteUser,
  forgotPassword,
  openDatabase,
  getDatabases,
  insertItem,
  updateItem,
  deleteItem,
  putTransaction,
  uploadFile,
  getFile,
  getVerificationMessage,
  verifyUser,
  shareDatabase,
  modifyDatabasePermissions,
  purchaseSubscription,
  cancelSubscription,
  resumeSubscription,
  updatePaymentMethod,
} = userbase

// TypeScript Version: 2.1

// $ExpectType Promise<Session>
init({ appId: 'tid' })

// $ExpectType Promise<Session>
init({ appId: 'tid', updateUserHandler: ({ user }) => { } })

// $ExpectError
init({})

// $ExpectError
init({ appId: 'tid', updateUserHandler: 'tup' })

// $ExpectType Promise<UserResult>
signUp({ username: 'tuser', password: 'tpass' })

// $ExpectType Promise<UserResult>
signUp({ username: 'tuser', password: 'tpass', email: 'test@test.com' })

// $ExpectType Promise<UserResult>
signUp({ username: 'tuser', password: 'tpass', email: 'test@test.com', profile: {} })

// $ExpectType Promise<UserResult>
signUp({ username: 'tuser', password: 'tpass', email: 'test@test.com', profile: { tkey: 'tval' } })

// $ExpectType Promise<UserResult>
signUp({ username: 'tuser', password: 'tpass', email: 'test@test.com', profile: { tkey: 'tval' }, rememberMe: 'session' })

// $ExpectType Promise<UserResult>
signUp({ username: 'tuser', password: 'tpass', email: 'test@test.com', profile: { tkey: 'tval' }, rememberMe: 'local' })

// $ExpectType Promise<UserResult>
signUp({ username: 'tuser', password: 'tpass', email: 'test@test.com', profile: { tkey: 'tval' }, rememberMe: 'none' })

// $ExpectError
signUp({ username: 'tuser', password: 'tpass', email: 'test@test.com', profile: { tkey: {} } })

// $ExpectError
signUp({ username: 'tuser', password: 'tpass', email: 'test@test.com', rememberMe: false })

// $ExpectError
signUp({ username: 'tuser', password: 'tpass', email: 'test@test.com', rememberMe: 'tremember' })

// $ExpectError
signUp({ username: 'tuser' })

// $ExpectError
signUp({})

// $ExpectType Promise<UserResult>
signIn({ username: 'tuser', password: 'tpass' })

// $ExpectType Promise<UserResult>
signIn({ username: 'tuser', password: 'tpass', rememberMe: 'session' })

// $ExpectError
signIn({ username: 'tuser' })

// $ExpectError
signIn({ username: 'tuser', password: 'tpass', rememberMe: true })

// $ExpectType Promise<void>
signOut()

// $ExpectError
signOut('tuser')

// $ExpectType Promise<void>
updateUser({})

// $ExpectType Promise<void>
updateUser({ username: 'tusernew' })

// $ExpectType Promise<void>
updateUser({ currentPassword: 'tpasscurrent', newPassword: 'tpassnew' })

// $ExpectType Promise<void>
updateUser({ email: 'testnew@test.com' })

// $ExpectType Promise<void>
updateUser({ email: null })

// $ExpectType Promise<void>
updateUser({ profile: { tkey: 'tval' } })

// $ExpectType Promise<void>
updateUser({ profile: null })

// $ExpectError
updateUser({ profile: 'invalid' })

// $ExpectType Promise<void>
deleteUser()

// $ExpectType Promise<void>
forgotPassword({ username: 'tuser' })

// $ExpectError
forgotPassword({})

// $ExpectType Promise<void>
openDatabase({ databaseName: 'tdb', changeHandler: (items) => { } })

// $ExpectType Promise<void>
openDatabase({ databaseId: 'tid', changeHandler: (items) => { } })

// $ExpectType Promise<void>
openDatabase({ shareToken: 'tst', changeHandler: (items) => { } })

// $ExpectError
openDatabase({ databaseName: 'tdb' })

// $ExpectError
openDatabase({})

// $ExpectError
openDatabase({ databaseName: 'tdb', databaseId: 'tid', changeHandler: (items) => { } })

// $ExpectError
openDatabase({ databaseId: 'tid', shareToken: 'tst', changeHandler: (items) => { } })

// $ExpectError
openDatabase({ databaseName: 'tdb', shareToken: 'st', changeHandler: (items) => { } })

// $ExpectError
openDatabase({ databaseName: 'tdb', databaseId: 'tid', shareToken: 'st', changeHandler: (items) => { } })

// $ExpectType Promise<DatabasesResult>
getDatabases()

// $ExpectType Promise<DatabasesResult>
getDatabases({ databaseName: 'tdb' })

// $ExpectType Promise<DatabasesResult>
getDatabases({ databaseId: 'tid' })

// $ExpectError
getDatabases({});

// $ExpectType Promise<void>
insertItem({ databaseName: 'tdb', item: { name: 'tname' } })

// $ExpectType Promise<void>
insertItem({ databaseName: 'tdb', item: { name: 'tname' }, itemId: 'tid' })

// $ExpectType Promise<void>
insertItem({ databaseName: 'tdb', item: { name: 'tname' }, writeAccess: { users: [{ username: 'tuser' }] } })

// $ExpectType Promise<void>
insertItem({ databaseName: 'tdb', item: { name: 'tname' }, writeAccess: { onlyCreator: true } })

// $ExpectError
insertItem({ databaseName: 'tdb', item: { name: 'tname' }, itemId: 1 })

// $ExpectError
insertItem({ item: { name: 'tname' } })

// $ExpectType Promise<void>
updateItem({ databaseName: 'tdb', item: { name: 'tname' }, itemId: 'tid' })

// $ExpectType Promise<void>
updateItem({ databaseName: 'tdb', item: { name: 'tname' }, itemId: 'tid', writeAccess: { onlyCreator: true } })

// $ExpectType Promise<void>
updateItem({ databaseName: 'tdb', item: { name: 'tname' }, itemId: 'tid', writeAccess: false })

// $ExpectError
updateItem({ databaseName: 'tdb', item: { name: 'tname' } })

// $ExpectError
updateItem({ item: { name: 'tname' }, itemId: 'tid' })

// $ExpectType Promise<void>
deleteItem({ databaseName: 'tdb', itemId: 'tid' })

// $ExpectType Promise<void>
deleteItem({ databaseId: 'tid', itemId: 'tid' })

// $ExpectError
deleteItem({ databaseName: 'tdb', itemId: 1 })

// $ExpectError
deleteItem({ itemId: 'tid' })

// $ExpectType Promise<void>
putTransaction({
  databaseName: 'tdb',
  operations: [
    { command: 'Insert', item: { name: 'tname' } },
    { command: 'Update', item: { name: 'tname' }, itemId: 'tid' },
    { command: 'Delete', itemId: 'tid' },
    { command: 'Insert', item: { name: 'tname' }, writeAccess: { onlyCreator: true } },
    { command: 'Update', item: { name: 'tname' }, itemId: 'tid', writeAccess: false },
  ]
})

// $ExpectError
putTransaction({ databaseName: 'tdb' })

// $ExpectError
putTransaction({ databaseName: 'tdb', operations: [{ command: 'Insert' }] })

// $ExpectError
putTransaction({ databaseName: 'tdb', operations: [{ command: 'Update', item: { name: 'tname' } }] })

// $ExpectError
putTransaction({ databaseName: 'tdb', operations: [{ command: 'Delete' }] })

// $ExpectError
putTransaction({
  operations: [
    { command: 'Insert', item: { name: 'tname' } },
    { command: 'Update', item: { name: 'tname' }, itemId: 'tid' },
    { command: 'Delete', itemId: 'tid' }
  ]
})

// $ExpectType Promise<void>
uploadFile({ databaseName: 'tdb', itemId: 'tid', file: new File(['tbp' as BlobPart], 'tf.txt') })

// $ExpectType Promise<void>
uploadFile({ databaseName: 'tdb', itemId: 'tid', file: new File(['tbp' as BlobPart], 'tf.txt'), progressHandler: ({ bytesTransferred }) => { } })

// $ExpectError
uploadFile({ databaseName: 'tdb', itemId: 'tid' })

// $ExpectError
uploadFile({ itemId: 'tid', file: new File(['tbp' as BlobPart], 'tf.txt') })

// $ExpectType Promise<FileResult>
getFile({ databaseName: 'tdb', fileId: 'tfid' })

// $ExpectType Promise<FileResult>
getFile({ databaseName: 'tdb', fileId: 'tfid', range: { start: 0, end: 1 } })

// $ExpectError
getFile({ databaseName: 'tdb' })

// $ExpectError
getFile({ databaseName: 'tdb', fileId: 'tfid', range: {} })

// $ExpectError
getFile({ databaseName: 'tdb', fileId: 'tfid', range: { start: 0 } })

// $ExpectError
getFile({ databaseName: 'tdb', fileId: 'tfid', range: { start: false, end: 1 } })

// $ExpectError
getFile({ fileId: 'tfid' })

// $ExpectType Promise<{ verificationMessage: string; }>
getVerificationMessage()

// $ExpectType Promise<void>
verifyUser({ verificationMessage: 'tvf' })

// $ExpectError
verifyUser()

// $ExpectType Promise<{ shareToken?: string | undefined; }>
shareDatabase({ databaseName: 'tdb', username: 'tuser' })

// $ExpectType Promise<{ shareToken?: string | undefined; }>
shareDatabase({ databaseId: 'tid', username: 'tuser' })

// $ExpectType Promise<{ shareToken?: string | undefined; }>
shareDatabase({ databaseName: 'tdb' })

// $ExpectType Promise<{ shareToken?: string | undefined; }>
shareDatabase({ databaseId: 'tdb' })

// $ExpectType Promise<{ shareToken?: string | undefined; }>
shareDatabase({ databaseId: 'tid', username: 'tuser', requireVerified: true, readOnly: true, resharingAllowed: true })

// $ExpectError
shareDatabase({ username: 'tuser' })

// $ExpectError
shareDatabase({ shareToken: 'tst' })

// $ExpectType Promise<void>
modifyDatabasePermissions({ databaseName: 'tdb', username: 'tuser' })

// $ExpectType Promise<void>
modifyDatabasePermissions({ databaseId: 'tid', username: 'tuser' })

// $ExpectType Promise<void>
modifyDatabasePermissions({ databaseId: 'tid', username: 'tuser', revoke: true })

// $ExpectError
modifyDatabasePermissions({ databaseId: 'tid' })

// $ExpectError
modifyDatabasePermissions({ username: 'tuser' })

// $ExpectType Promise<void>
purchaseSubscription({ successUrl: 'turl', cancelUrl: 'turl' })

// $ExpectType Promise<void>
purchaseSubscription({ successUrl: 'turl', cancelUrl: 'turl', priceId: 'tid' })

// $ExpectType Promise<void>
purchaseSubscription({ successUrl: 'turl', cancelUrl: 'turl', planId: 'tid' })

// $ExpectError
purchaseSubscription({ successUrl: 'turl' })

// $ExpectError
purchaseSubscription({ successUrl: 'turl', cancelUrl: 'turl', priceId: 'tid', planId: 'tid' })

// $ExpectType Promise<CancelSubscriptionResult>
cancelSubscription()

// $ExpectType Promise<void>
resumeSubscription()

// $ExpectType Promise<void>
updatePaymentMethod({ successUrl: 'turl', cancelUrl: 'turl' })

// $ExpectError
updatePaymentMethod({ cancelUrl: 'turl' })
