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

  describe('Share Database', function () {

    describe('Sucess Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Default', async function () {
        const recipient = await signUp(this.test.userbase)
        const { verificationMessage } = await this.test.userbase.getVerificationMessage()
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.verifyUser({ verificationMessage })
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with recipient
        await this.test.userbase.shareDatabase({ databaseName, username: recipient.username })

        // sender inserts item into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })
        await this.test.userbase.signOut()

        // recipient signs in and checks if can read the database
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        // recipient must find the database's databaseId using getDatabases() result
        const { databases } = await this.test.userbase.getDatabases()
        const db = databases[0]
        const { databaseId } = db

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
      })

      it('Share own database by databaseId', async function () {
        const recipient = await signUp(this.test.userbase)
        const { verificationMessage } = await this.test.userbase.getVerificationMessage()
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.verifyUser({ verificationMessage })
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // get database's id
        const { databases: [{ databaseId }] } = await this.test.userbase.getDatabases()

        // sender shares database with recipient
        await this.test.userbase.shareDatabase({ databaseId, username: recipient.username })

        // sender inserts item into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })
        await this.test.userbase.signOut()

        // recipient signs in and checks if can read the database
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        // getDatabases() must be run before opening a database by its databaseId
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
      })

      it('Default with requireVerified false', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with recipient
        await this.test.userbase.shareDatabase({ databaseName, username: recipient.username, requireVerified: false })

        // sender inserts item into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })
        await this.test.userbase.signOut()

        // recipient signs in and checks if can read the database
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        // recipient must find the database's databaseId using getDatabases() result
        const { databases } = await this.test.userbase.getDatabases()
        const db = databases[0]
        const { databaseId } = db

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
      })

      it('readOnly false', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with recipient
        await this.test.userbase.shareDatabase({ databaseName, username: recipient.username, requireVerified: false, readOnly: false })
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
            createdBy: { userDeleted: true, timestamp: items[0].createdBy.timestamp }
          }])

          senderChangeHandlerCallCount += 1
        }
        await this.test.userbase.openDatabase({ databaseName, changeHandler: senderChangeHandler })

        expect(senderChangeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('resharingAllowed true', async function () {
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

        // firstRecipient signs in and shares database with secondRecipient
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

      it('Idempotence', async function () {
        const recipient = await signUp(this.test.userbase)
        const { verificationMessage } = await this.test.userbase.getVerificationMessage()
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.verifyUser({ verificationMessage })
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with recipient
        await this.test.userbase.shareDatabase({ databaseName, username: recipient.username })
        await this.test.userbase.shareDatabase({ databaseName, username: recipient.username })

        // sender inserts item into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })
        await this.test.userbase.signOut()

        // recipient signs in and checks if can read the database
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        // recipient must find the database's databaseId using getDatabases() result
        const { databases } = await this.test.userbase.getDatabases()
        const db = databases[0]
        const { databaseId } = db

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
      })

      it('Sharing with a user who already has access', async function () {
        const recipient = await signUp(this.test.userbase)
        const { verificationMessage } = await this.test.userbase.getVerificationMessage()
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.verifyUser({ verificationMessage })
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with recipient
        await this.test.userbase.shareDatabase({ databaseName, username: recipient.username })

        // sender inserts item into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })
        await this.test.userbase.signOut()

        // recipient signs in and checks if can read the database
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        // recipient must find the database's databaseId using getDatabases() result
        const { databases } = await this.test.userbase.getDatabases()
        const db = databases[0]
        const { databaseId } = db

        // sender tries to share with recipient again
        await this.test.userbase.signOut()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.shareDatabase({ databaseName, username: recipient.username })
        await this.test.userbase.signOut()

        // should have made no difference
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

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
      })

      it('Both users can see that the other has access', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with recipient
        await this.test.userbase.shareDatabase({ databaseName, username: recipient.username, requireVerified: false })
        await this.test.userbase.signOut()

        // recipient signs in and checks to make sure can see the database was sent by sender
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })
        const { databases } = await this.test.userbase.getDatabases()
        const recipientDatabase = databases[0]
        const { databaseId } = recipientDatabase

        expect(recipientDatabase, 'recipient databases').to.deep.equal({
          databaseName,
          databaseId,
          isOwner: false,
          receivedFromUsername: sender.username,
          readOnly: true,
          resharingAllowed: false,
          users: [{
            username: sender.username,
            isOwner: true,
            readOnly: false,
            resharingAllowed: true,
          }]
        })

        await this.test.userbase.signOut()

        // sender signs back in to make sure recipient has access
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        const senderDatabases = await this.test.userbase.getDatabases()
        const senderDatabase = senderDatabases.databases[0]

        expect(senderDatabase, 'sender databases').to.deep.equal({
          databaseName,
          databaseId,
          isOwner: true,
          readOnly: false,
          resharingAllowed: true,
          users: [{
            username: recipient.username,
            receivedFromUsername: sender.username,
            isOwner: false,
            readOnly: true,
            resharingAllowed: false,
          }]
        })

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Sender deletes self', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with recipient then deletes self
        await this.test.userbase.shareDatabase({ databaseName, username: recipient.username, requireVerified: false })
        await this.test.userbase.deleteUser()

        // recipient signs in and should not be able to see the database
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })
        const { databases } = await this.test.userbase.getDatabases()

        expect(databases, 'databases array ').to.have.lengthOf(0)

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('First recipient deletes self after sharing with a second recipient', async function () {
        const firstRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const secondRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with firstRecipient
        await this.test.userbase.shareDatabase({ databaseName, username: firstRecipient.username, requireVerified: false, resharingAllowed: true })
        await this.test.userbase.signOut()

        // firstRecipient signs in and shares database with secondRecipient
        await this.test.userbase.signIn({ username: firstRecipient.username, password: firstRecipient.password, rememberMe: 'none' })

        // firstRecipient must find the database's databaseId using getDatabases() result
        const { databases } = await this.test.userbase.getDatabases()
        const db = databases[0]
        const { databaseId } = db

        // firstRecipient shares database with secondRecipient and deletes self
        await this.test.userbase.shareDatabase({ databaseId, username: secondRecipient.username, requireVerified: false })
        await this.test.userbase.deleteUser()

        // secondRecipient should be able to see the database
        await this.test.userbase.signIn({ username: secondRecipient.username, password: secondRecipient.password, rememberMe: 'none' })

        // call getDatabases() to make sure firstRecipient does not show up in result
        const secondDatabasesResult = await this.test.userbase.getDatabases()

        expect(secondDatabasesResult, 'second recipient databases').to.deep.equal({
          databases: [{
            databaseName,
            databaseId,
            isOwner: false,
            readOnly: true,
            resharingAllowed: false,
            users: [{
              username: sender.username,
              isOwner: true,
              readOnly: false,
              resharingAllowed: true,
            }]
          }]
        })

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('First recipient deletes self after sharing with a second recipient (testing verification process)', async function () {
        const firstRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const secondRecipient = await signUp(this.test.userbase)
        const { verificationMessage } = await this.test.userbase.getVerificationMessage()
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.verifyUser({ verificationMessage })
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with firstRecipient
        await this.test.userbase.shareDatabase({ databaseName, username: firstRecipient.username, requireVerified: false, resharingAllowed: true })
        await this.test.userbase.signOut()

        // firstRecipient signs in and shares database with secondRecipient
        await this.test.userbase.signIn({ username: firstRecipient.username, password: firstRecipient.password, rememberMe: 'none' })

        // firstRecipient must find the database's databaseId using getDatabases() result
        const { databases } = await this.test.userbase.getDatabases()
        const db = databases[0]
        const { databaseId } = db

        // firstRecipient shares database with secondRecipient and deletes self
        await this.test.userbase.shareDatabase({ databaseId, username: secondRecipient.username, requireVerified: false })
        await this.test.userbase.deleteUser()

        // secondRecipient accepts access to database
        await this.test.userbase.signIn({ username: secondRecipient.username, password: secondRecipient.password, rememberMe: 'none' })
        await this.test.userbase.getDatabases()
        await this.test.userbase.signOut()

        // secondRecipient should be verified by sender
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        const senderDatabasesResult = await this.test.userbase.getDatabases()

        expect(senderDatabasesResult, 'sender databases').to.deep.equal({
          databases: [{
            databaseName,
            databaseId,
            isOwner: true,
            readOnly: false,
            resharingAllowed: true,
            users: [{
              username: secondRecipient.username,
              verified: true,
              isOwner: false,
              readOnly: true,
              resharingAllowed: false,
            }]
          }]
        })

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: secondRecipient.username, password: secondRecipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

    })

    describe('Failure Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('User not verified', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        // sign up sender
        await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender tries to share database with recipient
        try {
          await this.test.userbase.shareDatabase({ databaseName, username: recipient.username })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('UserNotVerified')
          expect(e.message, 'error message').to.be.equal('User not verified. Either verify user before sharing database, or set requireVerified to false.')
          expect(e.status, 'error status').to.be.equal(403)
        }

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('User must be reverified', async function () {
        const recipient = await signUp(this.test.userbase)
        const { verificationMessage } = await this.test.userbase.getVerificationMessage()

        // change username, verification message should be different
        const updatedUsername = recipient.username + '-updated'
        await this.test.userbase.updateUser({ username: updatedUsername })
        await this.test.userbase.signOut()

        // sign up sender
        await signUp(this.test.userbase)

        // verify user with old verificationMessage
        await this.test.userbase.verifyUser({ verificationMessage })
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender tries to share database with recipient
        try {
          await this.test.userbase.shareDatabase({ databaseName, username: updatedUsername })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('UserMustBeReverified')
          expect(e.message, 'error message').to.be.equal('User must be reverified.')
          expect(e.status, 'error status').to.be.equal(403)
        }

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: updatedUsername, password: recipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Database is read only', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })

        // sender shares database with recipient
        await this.test.userbase.shareDatabase({ databaseName, username: recipient.username, requireVerified: false })
        await this.test.userbase.signOut()

        // recipient signs in and checks if can insert into the database
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

        // recipient tries to insert, update, delete, putTransaction, uploadFile into database
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

        try {
          const testFileName = 'test-file-name.txt'
          const testFileType = 'text/plain'
          const testFile = new this.test.win.File([1], testFileName, { type: testFileType })
          await this.test.userbase.uploadFile({ databaseId, file: testFile, itemId: testItemId })
          throw new Error('Should have failed')
        } catch (e) {
          expectedError(e)
        }

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Resharing not allowed', async function () {
        const firstRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const secondRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with firstRecipient
        await this.test.userbase.shareDatabase({ databaseName, username: firstRecipient.username, requireVerified: false })
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

      it('Resharing with write access not allowed', async function () {
        const firstRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const secondRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with firstRecipient
        await this.test.userbase.shareDatabase({ databaseName, username: firstRecipient.username, requireVerified: false, resharingAllowed: true })
        await this.test.userbase.signOut()

        // recipient signs in and shares database with secondRecipient
        await this.test.userbase.signIn({ username: firstRecipient.username, password: firstRecipient.password, rememberMe: 'none' })

        // firstRecipient must find the database's databaseId using getDatabases() result
        const { databases } = await this.test.userbase.getDatabases()
        const db = databases[0]
        const { databaseId } = db

        // firstRecipient tries to share database with secondRecipient
        try {
          await this.test.userbase.shareDatabase({ databaseId, username: secondRecipient.username, requireVerified: false, readOnly: false })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ResharingWithWriteAccessNotAllowed')
          expect(e.message, 'error message').to.be.equal('Resharing with write access not allowed. Must have permission to write to the database to reshare the database with write access another user.')
          expect(e.status, 'error status').to.be.equal(403)
        }

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: secondRecipient.username, password: secondRecipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Sharing with self not allowed', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender tries to share database with self
        try {
          await this.test.userbase.shareDatabase({ databaseName, username: sender.username, requireVerified: false })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('SharingWithSelfNotAllowed')
          expect(e.message, 'error message').to.be.equal('Sharing database with self is not allowed. Must share database with another user.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('User not found', async function () {
        await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender tries to share database with non-existent user
        try {
          await this.test.userbase.shareDatabase({ databaseName, username: 'fake-user', requireVerified: false })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('UserNotFound')
          expect(e.message, 'error message').to.be.equal('User not found.')
          expect(e.status, 'error status').to.be.equal(404)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Database not found - does not exist', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        // sign up sender
        await signUp(this.test.userbase)

        // sender tries to share non-existent database
        try {
          await this.test.userbase.shareDatabase({ databaseName, username: recipient.username, requireVerified: false })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('DatabaseNotFound')
          expect(e.message, 'error message').to.be.equal('Database not found. Find available databases using getDatabases().')
          expect(e.status, 'error status').to.be.equal(404)
        }

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Database not found - recipient tries to open before calling getDatabases()', async function () {
        const firstRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const secondRecipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with firstRecipient
        await this.test.userbase.shareDatabase({ databaseName, username: firstRecipient.username, requireVerified: false, resharingAllowed: true })
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

        // secondRecipient will not be able to open database because needs to call getDatabases() first
        await this.test.userbase.signIn({ username: secondRecipient.username, password: secondRecipient.password, rememberMe: 'none' })

        try {
          await this.test.userbase.openDatabase({ databaseId, changeHandler: () => { } })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('DatabaseNotFound')
          expect(e.message, 'error message').to.be.equal('Database not found. Find available databases using getDatabases().')
          expect(e.status, 'error status').to.be.equal(404)
        }

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: firstRecipient.username, password: firstRecipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Params must be object', async function () {
        try {
          await this.test.userbase.shareDatabase()
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ParamsMustBeObject')
          expect(e.message, 'error message').to.be.equal('Parameters passed to function must be placed inside an object.')
          expect(e.status, 'error status').to.be.equal(400)
        }
      })

      it('Database name missing', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.shareDatabase({ username: 'fake-user' })
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
          await this.test.userbase.shareDatabase({ databaseName: 1, username: 'fake-user' })
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
          await this.test.userbase.shareDatabase({ databaseName: '', username: 'fake-user' })
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
          await this.test.userbase.shareDatabase({ databaseName: 'a'.repeat(51), username: 'fake-user' })
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
          await this.test.userbase.shareDatabase({ databaseName: verifiedUsersDatabaseName, username: 'fake-user' })
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
          await this.test.userbase.shareDatabase({ databaseId: 1, username: 'fake-user' })
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
          await this.test.userbase.shareDatabase({ databaseId: '', username: 'fake-user' })
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
          await this.test.userbase.shareDatabase({ databaseId: 'abc', databaseName, username: 'fake-user' })
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
          await this.test.userbase.shareDatabase({ databaseId: 'abc', username: 'fake-user' })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('DatabaseIdInvalidLength')
          expect(e.message, 'error message').to.be.equal('Database id invalid length. Must be 36 characters.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it("Database id cannot be used to open the user's own database", async function () {
        await signUp(this.test.userbase)

        await this.test.userbase.openDatabase({ databaseName: 'db1', changeHandler: () => { } })

        const { databases } = await this.test.userbase.getDatabases()
        const db = databases[0]
        const { databaseId } = db

        try {
          await this.test.userbase.openDatabase({ databaseId, changeHandler: () => { } })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseIdNotAllowedForOwnDatabase')
          expect(e.message, 'error message').to.match(/Tried to open the user's own database using its databaseId/)
          expect(e.status, 'error status').to.be.equal(403)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Username missing', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.shareDatabase({ databaseName })
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
          await this.test.userbase.shareDatabase({ databaseName, username: '' })
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
          await this.test.userbase.shareDatabase({ databaseName, username: 1 })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('UsernameMustBeString')
          expect(e.message, 'error message').to.be.equal('Username must be a string.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Read Only must be boolean', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.shareDatabase({ databaseName, username: 'fake-user', readOnly: 'not boolean' })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ReadOnlyMustBeBoolean')
          expect(e.message, 'error message').to.be.equal('Read only value must be a boolean.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Resharing allowed must be boolean', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.shareDatabase({ databaseName, username: 'fake-user', resharingAllowed: 'not boolean' })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ResharingAllowedMustBeBoolean')
          expect(e.message, 'error message').to.be.equal('Resharing allowed value must be a boolean.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Require verified must be boolean', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.shareDatabase({ databaseName, username: 'fake-user', requireVerified: 'not boolean' })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('RequireVerifiedMustBeBoolean')
          expect(e.message, 'error message').to.be.equal('Require verified value must be a boolean.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('User not signed in', async function () {
        try {
          await this.test.userbase.shareDatabase({ databaseName, username: 'fake-user' })
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
