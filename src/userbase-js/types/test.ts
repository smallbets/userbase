import {
  init,
  signUp,
  signIn,
  signOut,
  forgotPassword,
  updateUser,
  importKey,
  getLastUsedUsername,
  openDatabase,
  insert,
  update,
  transaction
} from './'

// TypeScript Version: 2.1

// $ExpectType Promise<Session>
init({ appId: 'tid' })

// $ExpectType Promise<Session>
init({ appId: 'tid', endpoint: 'tendpoint' })

// $ExpectType Promise<Session>
init({ appId: 'tid', keyNotFoundHandler: () => {} })

// $ExpectError
init({})

// $ExpectType Promise<UserResult>
signUp('tuser', 'tpass')

// $ExpectType Promise<UserResult>
signUp('tuser', 'tpass', 'test@test.com')

// $ExpectType Promise<UserResult>
signUp('tuser', 'tpass', 'test@test.com', {})

// $ExpectType Promise<UserResult>
signUp('tuser', 'tpass', 'test@test.com', { tkey: 'tval' })

// $ExpectError
signUp('tuser', 'tpass', 'test@test.com', { tkey: {} })

// $ExpectType Promise<UserResult>
signUp('tuser', 'tpass', 'test@test.com', { tkey: 'tval' }, () => {})

// $ExpectType Promise<UserResult>
signUp('tuser', 'tpass', 'test@test.com', { tkey: 'tval' }, () => new Promise(() => {}))

// $ExpectError
signUp('tuser', 'tpass', 'test@test.com', { tkey: 'tval' }, () => Promise.resolve(0))

// $ExpectError
signUp('tuser')

// $ExpectType Promise<UserResult>
signIn('tuser', 'tpass')

// $ExpectType Promise<UserResult>
signIn('tuser', 'tpass', true)

// $ExpectError
signIn('tuser')

// $ExpectType Promise<void>
signOut()

// $ExpectError
signOut('tuser')

// $ExpectType Promise<void>
forgotPassword('tuser')

// $ExpectError
forgotPassword()

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
importKey('tkey')

// $ExpectError
importKey()

// $ExpectType string | undefined
getLastUsedUsername()

// $ExpectType Promise<void>
openDatabase('tdb', (items) => {})

// $ExpectError
openDatabase('tdb')

// $ExpectType Promise<void>
insert('tdb', { name: 'tname' })

// $ExpectType Promise<void>
insert('tdb', { name: 'tname' }, 'tid')

// $ExpectError
insert('tdb', { name: 'tname' }, 1)

// $ExpectType Promise<void>
update('tdb', { name: 'tname' }, 'tid')

// $ExpectError
update('tdb', { name: 'tname' })

// $ExpectType Promise<void>
transaction('tdb', [
  { command: 'Insert', item: { name: 'tname' }},
  { command: 'Update', item: { name: 'tname' }, id: 'tid' },
  { command: 'Delete', id: 'tid' }
])

// $ExpectError
transaction('tdb')

// $ExpectError
transaction('tdb', [{ command: 'Insert' }])

// $ExpectError
transaction('tdb', [{ command: 'Update', item: { name: 'tname' }}])

// $ExpectError
transaction('tdb', [{ command: 'Delete' }])
