import userbase from 'userbase-js'

const {
  init,
  signUp,
  signIn,
  signOut,
  updateUser,
  deleteUser,
  openDatabase,
  insertItem,
  updateItem,
  buildTransaction
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

// $ExpectError
signUp({ username: 'tuser', password: 'tpass', email: 'test@test.com', profile: { tkey: {} } })

// $ExpectError
signUp({ username: 'tuser' })

// $ExpectError
signUp({})

// $ExpectType Promise<UserResult>
signIn({ username: 'tuser', password: 'tpass' })

// $ExpectType Promise<UserResult>
signIn({ username: 'tuser', password: 'tpass', rememberMe: true })

// $ExpectError
signIn({ username: 'tuser' })

// $ExpectType Promise<void>
signOut()

// $ExpectError
signOut('tuser')

// $ExpectType Promise<void>
updateUser({})

// $ExpectType Promise<void>
updateUser({ username: 'tusernew' })

// $ExpectType Promise<void>
updateUser({ password: 'tpassnew' })

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
openDatabase({ databaseName: 'tdb', changeHandler: (items) => { } })

// $ExpectError
openDatabase({ databaseName: 'tdb' })

// $ExpectType Promise<void>
insertItem({ databaseName: 'tdb', item: { name: 'tname' } })

// $ExpectType Promise<void>
insertItem({ databaseName: 'tdb', item: { name: 'tname' }, id: 'tid' })

// $ExpectError
insertItem({ databaseName: 'tdb', item: { name: 'tname' }, id: 1 })

// $ExpectType Promise<void>
updateItem({ databaseName: 'tdb', item: { name: 'tname' }, id: 'tid' })

// $ExpectError
updateItem({ databaseName: 'tdb', item: { name: 'tname' } })

// $ExpectType Promise<void>
buildTransaction({
  databaseName: 'tdb',
  operations: [
    { command: 'Insert', item: { name: 'tname' } },
    { command: 'Update', item: { name: 'tname' }, id: 'tid' },
    { command: 'Delete', id: 'tid' }
  ]
})

// $ExpectError
buildTransaction({ databaseName: 'tdb' })

// $ExpectError
buildTransaction({ databaseName: 'tdb', operations: [{ command: 'Insert' }] })

// $ExpectError
buildTransaction({ databaseName: 'tdb', operations: [{ command: 'Update', item: { name: 'tname' } }] })

// $ExpectError
buildTransaction({ databaseName: 'tdb', operations: [{ command: 'Delete' }] })
