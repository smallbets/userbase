import { getRandomString } from '../../support/utils'

const beforeEachHook = function () {
  cy.visit('./cypress/integration/index.html').then(async function (win) {
    expect(win).to.have.property('userbase')
    const userbase = win.userbase
    this.currentTest.userbase = userbase
    this.currentTest.win = win

    const { appId, endpoint } = Cypress.env()
    win._userbaseEndpoint = endpoint
    userbase.init({ appId })
  })
}

const signUp = async (userbase) => {
  const username = 'test-user-' + getRandomString()
  const password = getRandomString()

  await userbase.signUp({
    username,
    password,
    rememberMe: 'none'
  })

  return { username, password }
}

describe('DB Sharing Tests', function () {
  const databaseName = 'test-db'

  describe('Modify Database Permissions', function () {

    describe('Sucess Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('readOnly from true to false', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with recipient with readOnly true, then modifies to readOnly false
        await this.test.userbase.shareDatabase({ databaseName, username: recipient.username, requireVerified: false, readOnly: true })
        await this.test.userbase.modifyDatabasePermissions({ databaseName, username: recipient.username, readOnly: false })
        await this.test.userbase.signOut()

        // recipient signs in and checks if can insert into the database
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        // recipient must find the database's databaseId using getDatabases() result
        const { databases } = await this.test.userbase.getDatabases()
        const db = databases[0]
        const { databaseId } = db

        let recipientChangeHandlerCallCount = 0
        const recipientChangeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')

          if (recipientChangeHandlerCallCount === 0) {
            expect(items, 'array passed to changeHandler').to.deep.equal([])
          } else {
            expect(items, 'array passed to changeHandler').to.deep.equal([{
              itemId: testItemId,
              item: testItem,
              createdBy: { username: recipient.username, timestamp: items[0].createdBy.timestamp }
            }])
          }

          recipientChangeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ databaseId, changeHandler: recipientChangeHandler })

        // recipient inserts item into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseId, item: testItem, itemId: testItemId })

        expect(recipientChangeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)

        await this.test.userbase.deleteUser()

        // sender should be able to read the item too
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })

        let senderChangeHandlerCallCount = 0
        const senderChangeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')
          expect(items, 'array passed to changeHandler').to.deep.equal([{
            itemId: testItemId,
            item: testItem,
            createdBy: { username: recipient.username, timestamp: items[0].createdBy.timestamp }
          }])

          senderChangeHandlerCallCount += 1
        }
        await this.test.userbase.openDatabase({ databaseName, changeHandler: senderChangeHandler })

        expect(senderChangeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('readOnly from false to true', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender inserts item into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })

        // sender shares database with recipient with readOnly true, then modifies to readOnly false
        await this.test.userbase.shareDatabase({ databaseName, username: recipient.username, requireVerified: false, readOnly: false })
        await this.test.userbase.modifyDatabasePermissions({ databaseName, username: recipient.username, readOnly: true })
        await this.test.userbase.signOut()

        // recipient signs in and makes sure can't insert into the database
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        // recipient must find the database's databaseId using getDatabases() result
        const { databases } = await this.test.userbase.getDatabases()
        const db = databases[0]
        const { databaseId } = db

        await this.test.userbase.openDatabase({ databaseId, changeHandler: () => { } })

        const expectedError = (e) => {
          expect(e.name, 'error name').to.be.equal('DatabaseIsReadOnly')
          expect(e.message, 'error message').to.be.equal('Database is read only. Must have permission to write to database.')
          expect(e.status, 'error status').to.be.equal(403)
        }

        // recipient tries to insert, update, delete, putTransaction into database
        try {
          await this.test.userbase.insertItem({ databaseId, item: testItem })
          throw new Error('Should have failed')
        } catch (e) {
          expectedError(e)
        }

        try {
          await this.test.userbase.updateItem({ databaseId, item: testItem, itemId: testItemId })
          throw new Error('Should have failed')
        } catch (e) {
          expectedError(e)
        }

        try {
          await this.test.userbase.deleteItem({ databaseId, item: testItem, itemId: testItemId })
          throw new Error('Should have failed')
        } catch (e) {
          expectedError(e)
        }

        try {
          await this.test.userbase.putTransaction({ databaseId, operations: [{ command: 'Insert', item: testItem, itemId: testItemId }] })
          throw new Error('Should have failed')
        } catch (e) {
          expectedError(e)
        }

        await this.test.userbase.deleteUser()

        // sender should be able to read the item too
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })

        let senderChangeHandlerCallCount = 0
        const senderChangeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')
          expect(items, 'array passed to changeHandler').to.deep.equal([{
            item: testItem,
            itemId: testItemId,
            createdBy: { username: sender.username, timestamp: items[0].createdBy.timestamp }
          }])

          senderChangeHandlerCallCount += 1
        }
        await this.test.userbase.openDatabase({ databaseName, changeHandler: senderChangeHandler })

        expect(senderChangeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('resharingAllowed from false to true', async function () {
        const firstRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const secondRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })

        // sender shares database with firstRecipient
        await this.test.userbase.shareDatabase({ databaseName, username: firstRecipient.username, requireVerified: false, resharingAllowed: false })
        await this.test.userbase.modifyDatabasePermissions({ databaseName, username: firstRecipient.username, resharingAllowed: true })
        await this.test.userbase.signOut()

        // recipient signs in and shares database with secondRecipient
        await this.test.userbase.signIn({ username: firstRecipient.username, password: firstRecipient.password, rememberMe: 'none' })

        // firstRecipient must find the database's databaseId using getDatabases() result
        const { databases } = await this.test.userbase.getDatabases()
        const db = databases[0]
        const { databaseId } = db

        // firstRecipient shares database with secondRecipient
        await this.test.userbase.shareDatabase({ databaseId, username: secondRecipient.username, requireVerified: false })
        await this.test.userbase.signOut()

        // secondRecipient should be able to open the database
        await this.test.userbase.signIn({ username: secondRecipient.username, password: secondRecipient.password, rememberMe: 'none' })

        // call getDatabases() so that database key gets set
        await this.test.userbase.getDatabases()

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')
          expect(items, 'array passed to changeHandler').to.deep.equal([{
            itemId: testItemId,
            item: testItem,
            createdBy: { username: sender.username, timestamp: items[0].createdBy.timestamp }
          }])

          changeHandlerCallCount += 1
        }
        await this.test.userbase.openDatabase({ databaseId, changeHandler })
        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: firstRecipient.username, password: firstRecipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('resharingAllowed from true to false', async function () {
        const firstRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const secondRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with firstRecipient
        await this.test.userbase.shareDatabase({ databaseName, username: firstRecipient.username, requireVerified: false, resharingAllowed: true })
        await this.test.userbase.modifyDatabasePermissions({ databaseName, username: firstRecipient.username, resharingAllowed: false })
        await this.test.userbase.signOut()

        // recipient signs in and shares database with secondRecipient
        await this.test.userbase.signIn({ username: firstRecipient.username, password: firstRecipient.password, rememberMe: 'none' })

        // firstRecipient must find the database's databaseId using getDatabases() result
        const { databases } = await this.test.userbase.getDatabases()
        const db = databases[0]
        const { databaseId } = db

        // firstRecipient tries to share database with secondRecipient
        try {
          await this.test.userbase.shareDatabase({ databaseId, username: secondRecipient.username, requireVerified: false })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ResharingNotAllowed')
          expect(e.message, 'error message').to.be.equal('Resharing not allowed. Must have permission to reshare the database with another user.')
          expect(e.status, 'error status').to.be.equal(403)
        }

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: secondRecipient.username, password: secondRecipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('revoke', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with recipient with readOnly true, then modifies to readOnly false
        await this.test.userbase.shareDatabase({ databaseName, username: recipient.username, requireVerified: false, readOnly: true })
        await this.test.userbase.modifyDatabasePermissions({ databaseName, username: recipient.username, revoke: true })

        // sender should not have any users with access to database
        const databasesResult = await this.test.userbase.getDatabases()
        expect(databasesResult.databases[0].users, 'databases users array').to.deep.equal([])

        await this.test.userbase.signOut()

        // recipient signs in and should not see database in response to getDatabases()
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })
        const { databases } = await this.test.userbase.getDatabases()
        expect(databases, 'databases array').to.deep.equal([])

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

    })

    describe('Failure Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Modifying own permissions not allowed', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseName, username: sender.username, readOnly: false })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ModifyingOwnPermissionsNotAllowed')
          expect(e.message, 'error message').to.be.equal("Modifying own database permissions not allowed. Must modify another user's permissions.")
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Modifying owner permissions not allowed', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with recipient with full permissions
        await this.test.userbase.shareDatabase({ databaseName, username: recipient.username, requireVerified: false, resharingAllowed: true, readOnly: false })
        await this.test.userbase.signOut()

        // recipient signs in and attempts to modify owner permissions
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        // recipient must find the database's databaseId using getDatabases() result
        const { databases } = await this.test.userbase.getDatabases()
        const db = databases[0]
        const { databaseId } = db

        try {
          // secondRecipient does not have permission to modify firstRecipient's permissions
          await this.test.userbase.modifyDatabasePermissions({ databaseId, username: sender.username, readOnly: false })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ModifyingOwnerPermissionsNotAllowed')
          expect(e.message, 'error message').to.be.equal("Modifying the owner of a database's permissions is not allowed.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Modifying other users permissions not allowed', async function () {
        const firstRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const secondRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })

        // sender shares database with firstRecipient
        await this.test.userbase.shareDatabase({ databaseName, username: firstRecipient.username, requireVerified: false, resharingAllowed: true })
        await this.test.userbase.signOut()

        // firstRecipient signs in and shares database with secondRecipient with resharingAllowed set to false
        await this.test.userbase.signIn({ username: firstRecipient.username, password: firstRecipient.password, rememberMe: 'none' })

        // firstRecipient must find the database's databaseId using getDatabases() result
        const { databases } = await this.test.userbase.getDatabases()
        const db = databases[0]
        const { databaseId } = db

        // firstRecipient shares database with secondRecipient
        await this.test.userbase.shareDatabase({ databaseId, username: secondRecipient.username, requireVerified: false, resharingAllowed: false })
        await this.test.userbase.signOut()

        // secondRecipient should not be able to modify firstRecipient's permissions
        await this.test.userbase.signIn({ username: secondRecipient.username, password: secondRecipient.password, rememberMe: 'none' })

        // call getDatabases() so that database key gets set
        await this.test.userbase.getDatabases()

        try {
          // secondRecipient does not have permission to modify firstRecipient's permissions
          await this.test.userbase.modifyDatabasePermissions({ databaseId, username: firstRecipient.username, readOnly: false })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ModifyingPermissionsNotAllowed')
          expect(e.message, 'error message').to.be.equal("Modifying another user's permissions is not allowed. Must have permission to reshare the database with another user.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: firstRecipient.username, password: firstRecipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Cannot grant write access', async function () {
        const firstRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const secondRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })

        // sender shares database with firstRecipient
        await this.test.userbase.shareDatabase({ databaseName, username: firstRecipient.username, requireVerified: false, resharingAllowed: true, readOnly: true })
        await this.test.userbase.signOut()

        // firstRecipient signs in and shares database with secondRecipient with resharingAllowed set to true and readOnly true
        await this.test.userbase.signIn({ username: firstRecipient.username, password: firstRecipient.password, rememberMe: 'none' })

        // firstRecipient must find the database's databaseId using getDatabases() result
        const { databases } = await this.test.userbase.getDatabases()
        const db = databases[0]
        const { databaseId } = db

        // firstRecipient shares database with secondRecipient
        await this.test.userbase.shareDatabase({ databaseId, username: secondRecipient.username, requireVerified: false, resharingAllowed: true, readOnly: true })
        await this.test.userbase.signOut()

        // secondRecipient should not be able to grant write access to firstRecipient
        await this.test.userbase.signIn({ username: secondRecipient.username, password: secondRecipient.password, rememberMe: 'none' })

        // call getDatabases() so that database key gets set
        await this.test.userbase.getDatabases()

        try {
          // secondRecipient does not have permission to grant firstRecipient write access
          await this.test.userbase.modifyDatabasePermissions({ databaseId, username: firstRecipient.username, readOnly: false })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('GrantingWriteAccessNotAllowed')
          expect(e.message, 'error message').to.be.equal('Granting write access not allowed. Must have permission to write to the database to grant write access to another user.')
          expect(e.status, 'error status').to.be.equal(403)
        }

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: firstRecipient.username, password: firstRecipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('User not found', async function () {
        await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender tries to modify non-existent user permissions
        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseName, username: 'fake-user', revoke: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('UserNotFound')
          expect(e.message, 'error message').to.be.equal('User not found.')
          expect(e.status, 'error status').to.be.equal(404)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Params must be object', async function () {
        try {
          await this.test.userbase.modifyDatabasePermissions()
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ParamsMustBeObject')
          expect(e.message, 'error message').to.be.equal('Parameters passed to function must be placed inside an object.')
          expect(e.status, 'error status').to.be.equal(400)
        }
      })

      it('Params missing', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseName, username: 'abc' })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ParamsMissing')
          expect(e.message, 'error message').to.be.equal('Parameters expected are missing.')
          expect(e.status, 'error status').to.be.equal(400)
        }
      })

      it('Database name missing', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ username: 'fake-user', revoke: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('DatabaseNameMissing')
          expect(e.message, 'error message').to.be.equal('Database name missing.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Database name must be string', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseName: 1, username: 'fake-user', revoke: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('DatabaseNameMustBeString')
          expect(e.message, 'error message').to.be.equal('Database name must be a string.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Database name cannot be blank', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseName: '', username: 'fake-user', revoke: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('DatabaseNameCannotBeBlank')
          expect(e.message, 'error message').to.be.equal('Database name cannot be blank.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Database name too long', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseName: 'a'.repeat(51), username: 'fake-user', revoke: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameTooLong')
          expect(e.message, 'error message').to.equal('Database name cannot be more than 50 characters.')
          expect(e.status, 'error status').to.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Database name restricted', async function () {
        const verifiedUsersDatabaseName = '__userbase_verified_users'

        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseName: verifiedUsersDatabaseName, username: 'fake-user', revoke: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameRestricted')
          expect(e.message, 'error message').to.equal(`Database name '${verifiedUsersDatabaseName}' is restricted. It is used internally by userbase-js.`)
          expect(e.status, 'error status').to.equal(403)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Database id must be string', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseId: 1, username: 'fake-user', revoke: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseIdMustBeString')
          expect(e.message, 'error message').to.equal('Database id must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Database id cannot be blank', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseId: '', username: 'fake-user', revoke: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('DatabaseIdCannotBeBlank')
          expect(e.message, 'error message').to.be.equal('Database id cannot be blank.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Database id not allowed', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseId: 'abc', databaseName, username: 'fake-user', revoke: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('DatabaseIdNotAllowed')
          expect(e.message, 'error message').to.be.equal('Database id not allowed. Cannot provide both databaseName and databaseId, can only provide one.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Database id invalid length', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseId: 'abc', username: 'fake-user', revoke: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('DatabaseIdInvalidLength')
          expect(e.message, 'error message').to.be.equal('Database id invalid length. Must be 36 characters.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Username missing', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseName, revoke: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('UsernameMissing')
          expect(e.message, 'error message').to.be.equal('Username missing.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Username cannot be blank', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseName, username: '', revoke: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('UsernameCannotBeBlank')
          expect(e.message, 'error message').to.be.equal('Username cannot be blank.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Username must be string', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseName, username: 1, revoke: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('UsernameMustBeString')
          expect(e.message, 'error message').to.be.equal('Username must be a string.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Read only must be boolean', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseName, username: 'fake-user', readOnly: 'not boolean' })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ReadOnlyMustBeBoolean')
          expect(e.message, 'error message').to.be.equal('Read only value must be a boolean.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Read only param not allowed', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseName, username: 'fake-user', revoke: true, readOnly: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ReadOnlyParamNotAllowed')
          expect(e.message, 'error message').to.be.equal('Read only parameter not allowed when revoking access to a database.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Resharing allowed must be boolean', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseName, username: 'fake-user', resharingAllowed: 'not boolean' })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ResharingAllowedMustBeBoolean')
          expect(e.message, 'error message').to.be.equal('Resharing allowed value must be a boolean.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Resharing allowed param not allowed', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseName, username: 'fake-user', revoke: true, resharingAllowed: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ResharingAllowedParamNotAllowed')
          expect(e.message, 'error message').to.be.equal('Resharing allowed parameter not allowed when revoking access to a database.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Revoke must be boolean', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.modifyDatabasePermissions({ databaseName, username: 'fake-user', revoke: 'not boolean' })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('RevokeMustBeBoolean')
          expect(e.message, 'error message').to.be.equal('Revoke value must be a boolean.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('User not signed in', async function () {
        try {
          await this.test.userbase.getVerificationMessage()
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('UserNotSignedIn')
          expect(e.message, 'error message').to.be.equal('Not signed in.')
          expect(e.status, 'error status').to.be.equal(400)
        }
      })

    })

  })

})
