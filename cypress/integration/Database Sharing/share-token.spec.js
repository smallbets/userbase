import { getRandomString, getOperationsThatTriggerBundle, wait } from '../../support/utils'

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

  describe('Share Database by retrieving share token', function () {

    describe('Sucess Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Default', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender gets share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName })

        // sender inserts item into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })
        await this.test.userbase.signOut()

        // recipient signs up and checks if can read the database with shareToken
        await signUp(this.test.userbase)

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

        await this.test.userbase.openDatabase({ shareToken, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Share own database by databaseId', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // get database's id
        const { databases: [{ databaseId }] } = await this.test.userbase.getDatabases()

        // sender gets share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseId })

        // sender inserts item into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })
        await this.test.userbase.signOut()

        // recipient signs up and checks if can read the database with shareToken
        await signUp(this.test.userbase)

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

        await this.test.userbase.openDatabase({ shareToken, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('readOnly false', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender gets share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })
        await this.test.userbase.signOut()

        // recipient signs up and checks if can insert into the database
        const recipient = await signUp(this.test.userbase)

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

        await this.test.userbase.openDatabase({ shareToken, changeHandler: recipientChangeHandler })

        // recipient inserts item into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ shareToken, item: testItem, itemId: testItemId })

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

      it('Calling twice with same permissions overwrites share token', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender gets 2 share tokens, only 2nd works
        const firstShareToken = await this.test.userbase.shareDatabase({ databaseName })
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName })
        expect(firstShareToken.shareToken, 'diff share tokens').to.not.eq(shareToken)

        // sender inserts item into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })
        await this.test.userbase.signOut()

        // recipient signs up and checks if can read the database
        await signUp(this.test.userbase)

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

        await this.test.userbase.openDatabase({ shareToken, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // first share token should not work
        try {
          await this.test.userbase.openDatabase({ shareToken: firstShareToken.shareToken, changeHandler })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ShareTokenNotFound')
          expect(e.message, 'error message').to.be.equal('Share token not found. Perhaps the database owner has generated a new share token.')
          expect(e.status, 'error status').to.be.equal(404)
        }

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Calling twice with different permissions', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender gets 2 share tokens, a read only, and write
        const readOnlyToken = await this.test.userbase.shareDatabase({ databaseName })
        const writeToken = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })
        expect(readOnlyToken.shareToken, 'diff share tokens').to.not.eq(writeToken.shareToken)

        // sender inserts item into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })
        await this.test.userbase.signOut()

        // recipient signs up and checks if can read readOnly database, and write to write database
        const recipient = await signUp(this.test.userbase)

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

        await this.test.userbase.openDatabase({ shareToken: readOnlyToken.shareToken, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // sign out and sign back in to open with second token
        await this.test.userbase.signOut()
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        const updatedTestItem = 'Hello, world!'

        let secondChandlerCallCount = 0
        const secondChandler = function (items) {
          if (secondChandlerCallCount === 1) {
            expect(items, 'array passed to changeHandler').to.be.a('array')
            expect(items, 'array passed to changeHandler').to.deep.equal([{
              itemId: testItemId,
              item: updatedTestItem,
              createdBy: { username: sender.username, timestamp: items[0].createdBy.timestamp },
              updatedBy: { username: recipient.username, timestamp: items[0].updatedBy.timestamp }
            }])
          }

          secondChandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ shareToken: writeToken.shareToken, changeHandler: secondChandler })
        await this.test.userbase.updateItem({ shareToken: writeToken.shareToken, item: updatedTestItem, itemId: testItemId })

        expect(secondChandlerCallCount, 'second changeHandler called correct number of times').to.equal(2)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Calling twice with same permissions overwrites share token, but does not affect existing share token with separte permissions', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender gets 3 share tokens, a write token, and 2 read-only tokens. Write token and 2nd read-only should work
        const writeToken = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })

        const firstReadOnlyShareToken = await this.test.userbase.shareDatabase({ databaseName })
        const secondReadOnlyShareToken = await this.test.userbase.shareDatabase({ databaseName })
        expect(firstReadOnlyShareToken.shareToken, 'diff share tokens').to.not.eq(secondReadOnlyShareToken.shareToken)

        // sender inserts item into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })
        await this.test.userbase.signOut()

        // recipient signs up and checks if can read the database
        const recipient = await signUp(this.test.userbase)

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

        await this.test.userbase.openDatabase({ shareToken: secondReadOnlyShareToken.shareToken, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // sign out and sign back in to try with other tokens
        await this.test.userbase.signOut()
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        // first read-only share token should not work
        try {
          await this.test.userbase.openDatabase({ shareToken: firstReadOnlyShareToken.shareToken, changeHandler })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ShareTokenNotFound')
          expect(e.message, 'error message').to.be.equal('Share token not found. Perhaps the database owner has generated a new share token.')
          expect(e.status, 'error status').to.be.equal(404)
        }

        // write token should work
        const updatedTestItem = 'Hello, world!'

        let secondChandlerCallCount = 0
        const secondChandler = function (items) {
          if (secondChandlerCallCount === 1) {
            expect(items, 'array passed to changeHandler').to.be.a('array')
            expect(items, 'array passed to changeHandler').to.deep.equal([{
              itemId: testItemId,
              item: updatedTestItem,
              createdBy: { username: sender.username, timestamp: items[0].createdBy.timestamp },
              updatedBy: { username: recipient.username, timestamp: items[0].updatedBy.timestamp }
            }])
          }

          secondChandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ shareToken: writeToken.shareToken, changeHandler: secondChandler })
        await this.test.userbase.updateItem({ shareToken: writeToken.shareToken, item: updatedTestItem, itemId: testItemId })

        expect(secondChandlerCallCount, 'second changeHandler called correct number of times').to.equal(2)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Sharing without opening first', async function () {
        const recipient = await signUp(this.test.userbase)
        const { verificationMessage } = await this.test.userbase.getVerificationMessage()
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.verifyUser({ verificationMessage })
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender inserts item into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })

        // sign out, sign back in
        await this.test.userbase.signOut()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })

        // sender shares database without opening first
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName })
        await this.test.userbase.signOut()

        // recipient signs in and checks if can read the database
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

        await this.test.userbase.openDatabase({ shareToken, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Share by databaseId without opening first', async function () {
        const recipient = await signUp(this.test.userbase)
        const { verificationMessage } = await this.test.userbase.getVerificationMessage()
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.verifyUser({ verificationMessage })
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender inserts item into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })

        // get database's id
        const { databases: [{ databaseId }] } = await this.test.userbase.getDatabases()

        // sign out, sign back in
        await this.test.userbase.signOut()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })

        // sender shares database with recipient without opening
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseId })
        await this.test.userbase.signOut()

        // recipient signs in and checks if can read the database
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

        await this.test.userbase.openDatabase({ shareToken, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Owner bundles database, then recipient reads from database', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })
        const operations = getOperationsThatTriggerBundle()
        await this.test.userbase.putTransaction({ databaseName, operations })

        console.log('Give client time to finish bundle...')
        await wait(5000)

        // sender gets share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName })
        await this.test.userbase.signOut()

        // recipient signs in and checks if can read the database
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array').to.have.lengthOf(operations.length)

          for (let i = 0; i < items.length; i++) {
            const { item, itemId } = operations[i]
            expect(items[i], 'item passed to change handler').to.deep.equal({
              itemId,
              item,
              createdBy: { username: sender.username, timestamp: items[i].createdBy.timestamp }
            })
          }

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ shareToken, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Recipient bundles database, then owner reads from database', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with recipient
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })
        await this.test.userbase.signOut()

        // recipient signs in and checks if can read the database
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        await this.test.userbase.openDatabase({ shareToken, changeHandler: () => { } })
        const operations = getOperationsThatTriggerBundle()
        await this.test.userbase.putTransaction({ shareToken, operations })

        console.log('Give client time to finish bundle...')
        await wait(5000)
        await this.test.userbase.signOut()

        // sender signs back in and reads
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array').to.have.lengthOf(operations.length)

          for (let i = 0; i < items.length; i++) {
            const { item, itemId } = operations[i]
            expect(items[i], 'item passed to change handler').to.deep.equal({
              itemId,
              item,
              createdBy: { username: recipient.username, timestamp: items[i].createdBy.timestamp }
            })
          }

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })


    })

    describe('Failure Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Database is read only', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })

        // sender gets share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName })
        await this.test.userbase.signOut()

        // recipient signs up and checks if can insert into the database
        await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ shareToken, changeHandler: () => { } })

        const expectedError = (e) => {
          expect(e.name, 'error name').to.be.equal('DatabaseIsReadOnly')
          expect(e.message, 'error message').to.be.equal('Database is read only. Must have permission to write to database.')
          expect(e.status, 'error status').to.be.equal(403)
        }

        // recipient tries to insert, update, delete, putTransaction, uploadFile into database
        try {
          await this.test.userbase.insertItem({ shareToken, item: testItem })
          throw new Error('Should have failed')
        } catch (e) {
          expectedError(e)
        }

        try {
          await this.test.userbase.updateItem({ shareToken, item: testItem, itemId: testItemId })
          throw new Error('Should have failed')
        } catch (e) {
          expectedError(e)
        }

        try {
          await this.test.userbase.deleteItem({ shareToken, item: testItem, itemId: testItemId })
          throw new Error('Should have failed')
        } catch (e) {
          expectedError(e)
        }

        try {
          await this.test.userbase.putTransaction({ shareToken, operations: [{ command: 'Delete', itemId: testItemId }] })
          throw new Error('Should have failed')
        } catch (e) {
          expectedError(e)
        }

        try {
          const testFileName = 'test-file-name.txt'
          const testFileType = 'text/plain'
          const testFile = new this.test.win.File([1], testFileName, { type: testFileType })
          await this.test.userbase.uploadFile({ shareToken, file: testFile, itemId: testItemId })
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
        const recipient = await signUp(this.test.userbase)
        const { verificationMessage } = await this.test.userbase.getVerificationMessage()
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.verifyUser({ verificationMessage })
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender shares database with recipient
        await this.test.userbase.shareDatabase({ databaseName, username: recipient.username })
        await this.test.userbase.signOut()

        // recipient signs in and checks if can get a new share token
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        // recipient must find the database's databaseId using getDatabases() result
        const { databases } = await this.test.userbase.getDatabases()
        const db = databases[0]
        const { databaseId } = db

        try {
          await this.test.userbase.shareDatabase({ databaseId })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ResharingNotAllowed')
          expect(e.message, 'error message').to.be.equal('Resharing not allowed. Only the owner can generate a share token.')
          expect(e.status, 'error status').to.be.equal(403)
        }

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Share token invalid', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.openDatabase({ shareToken: 'a', changeHandler: () => { } })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ShareTokenInvalid')
          expect(e.message, 'error message').to.be.equal('Share token invalid.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Share token not allowed - passing share token to shareDatabase', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender gets share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName })
        await this.test.userbase.signOut()

        // recipient signs up and tries to reshare share token
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.shareDatabase({ shareToken })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ShareTokenNotAllowed')
          expect(e.message, 'error message').to.be.equal('Share token not allowed.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Share token not allowed - passing database name and share token to shareDatabase', async function () {
        await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.shareDatabase({ databaseName, shareToken: '' })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ShareTokenNotAllowed')
          expect(e.message, 'error message').to.be.equal('Share token not allowed.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Share token not allowed - passing database ID and share token to shareDatabase', async function () {
        await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // get database's id
        const { databases: [{ databaseId }] } = await this.test.userbase.getDatabases()

        try {
          await this.test.userbase.shareDatabase({ databaseId, shareToken: '' })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ShareTokenNotAllowed')
          expect(e.message, 'error message').to.be.equal('Share token not allowed.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Owner opening with share token not allowed', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender gets share token, then tries to open with it
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName })
        await this.test.userbase.signOut()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })

        // sender tries to share database with self
        try {
          await this.test.userbase.openDatabase({ shareToken, changeHandler: () => { } })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ShareTokenNotAllowedForOwnDatabase')
          expect(e.message, 'error message').to.be.equal("Tried to open the user's own database using its shareToken rather than its databaseName. The shareToken should only be used to open databases shared from other users.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Database not found - does not exist', async function () {
        // sign up sender
        await signUp(this.test.userbase)

        // sender tries to share non-existent database
        try {
          await this.test.userbase.shareDatabase({ databaseName })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('DatabaseNotFound')
          expect(e.message, 'error message').to.be.equal('Database not found. Find available databases using getDatabases().')
          expect(e.status, 'error status').to.be.equal(404)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Database name missing', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.shareDatabase({})
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
          await this.test.userbase.shareDatabase({ databaseName: 1 })
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
          await this.test.userbase.shareDatabase({ databaseName: '' })
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
          await this.test.userbase.shareDatabase({ databaseName: 'a'.repeat(101) })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameTooLong')
          expect(e.message, 'error message').to.equal('Database name cannot be more than 100 characters.')
          expect(e.status, 'error status').to.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Database name restricted', async function () {
        const verifiedUsersDatabaseName = '__userbase_verified_users'

        await signUp(this.test.userbase)

        try {
          await this.test.userbase.shareDatabase({ databaseName: verifiedUsersDatabaseName })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameRestricted')
          expect(e.message, 'error message').to.equal(`Database name '${verifiedUsersDatabaseName}' is restricted. It is used internally by userbase-js.`)
          expect(e.status, 'error status').to.equal(403)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Database id not allowed', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.shareDatabase({ databaseId: 'abc', databaseName })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('DatabaseIdNotAllowed')
          expect(e.message, 'error message').to.be.equal('Database id not allowed. Cannot provide both databaseName and databaseId, can only provide one.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Database id must be string', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.shareDatabase({ databaseId: 1 })
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
          await this.test.userbase.shareDatabase({ databaseId: '' })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('DatabaseIdCannotBeBlank')
          expect(e.message, 'error message').to.be.equal('Database id cannot be blank.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Database id invalid length', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.shareDatabase({ databaseId: 'abc' })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('DatabaseIdInvalidLength')
          expect(e.message, 'error message').to.be.equal('Database id invalid length. Must be 36 characters.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Read Only must be boolean', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.shareDatabase({ databaseName, readOnly: 'not boolean' })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ReadOnlyMustBeBoolean')
          expect(e.message, 'error message').to.be.equal('Read only value must be a boolean.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Resharing allowed param not allowed', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.shareDatabase({ databaseName, resharingAllowed: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ResharingAllowedParamNotAllowed')
          expect(e.message, 'error message').to.be.equal('Resharing allowed parameter not allowed when retrieving a share token.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Require verified param not necessary', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.shareDatabase({ databaseName, requireVerified: true })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('RequireVerifiedParamNotNecessary')
          expect(e.message, 'error message').to.be.equal('Require verified parameter not necessary when sharing database without a username.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('User not signed in', async function () {
        try {
          await this.test.userbase.shareDatabase({ databaseName })
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
