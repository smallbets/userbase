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
  insertItem,
  updateItem,
  putTransaction
} = userbase

// TypeScript Version: 2.1

// $ExpectType Promise<Session>
init({ appId: 'tid' })

// $ExpectError
init({})

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

// $ExpectError
openDatabase({ databaseName: 'tdb' })

// $ExpectType Promise<void>
insertItem({ databaseName: 'tdb', item: { name: 'tname' } })

// $ExpectType Promise<void>
insertItem({ databaseName: 'tdb', item: { name: 'tname' }, itemId: 'tid' })

// $ExpectError
insertItem({ databaseName: 'tdb', item: { name: 'tname' }, itemId: 1 })

// $ExpectType Promise<void>
updateItem({ databaseName: 'tdb', item: { name: 'tname' }, itemId: 'tid' })

// $ExpectError
updateItem({ databaseName: 'tdb', item: { name: 'tname' } })

// $ExpectType Promise<void>
putTransaction({
  databaseName: 'tdb',
  operations: [
    { command: 'Insert', item: { name: 'tname' } },
    { command: 'Update', item: { name: 'tname' }, itemId: 'tid' },
    { command: 'Delete', itemId: 'tid' }
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
