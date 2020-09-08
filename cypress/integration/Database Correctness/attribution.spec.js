import { getRandomString, getStringOfByteLength, wait, readBlobAsText } from '../../support/utils'

const beforeEachHook = function () {
  cy.visit('./cypress/integration/index.html').then(async function (win) {
    expect(win).to.have.property('userbase')
    const userbase = win.userbase
    this.currentTest.userbase = userbase
    this.currentTest.win = win
    this.currentTest.startTime = new Date().toISOString()

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

describe('Attribution Tests', function () {
  const databaseName = 'test-db'
  const BUNDLE_SIZE = 50 * 1024 // from src/userbase-server/ws.js

  beforeEach(function () { beforeEachHook() })

  describe('Documents I inserted', function () {
    it('Correctly sets createdBy', async function () {
      const creator = await signUp(this.test.userbase)
      await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

      const testItem = 'hello world!'
      await this.test.userbase.insertItem({ databaseName, item: testItem })

      let changeHandlerCallCount = 0
      const changeHandler = (items) => {
        expect(items[0].createdBy.timestamp >= this.test.startTime).to.be.true
        expect(items[0].createdBy.timestamp <= new Date().toISOString()).to.be.true
        expect(items[0].createdBy.username).to.equal(creator.username)
        expect('updatedBy' in items[0]).to.be.false
        expect('fileUploadedBy' in items[0]).to.be.false
        expect(items[0].item).to.deep.equal(testItem)
        changeHandlerCallCount += 1
      }

      await this.test.userbase.openDatabase({ databaseName, changeHandler })

      expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Correctly sets updatedBy', async function () {
      const creator = await signUp(this.test.userbase)
      const itemId = 'test-item'
      const testItem = 'hello world!'
      const updatedTestItem = 'see you later world!'

      let changeHandlerCallCount = 0
      const changeHandler = (items) => {
        expect(items[0].createdBy.timestamp >= this.test.startTime).to.be.true
        expect(items[0].createdBy.timestamp <= new Date().toISOString()).to.be.true
        expect(items[0].createdBy.username).to.equal(creator.username)
        if (changeHandlerCallCount > 0) {
          expect(items[0].updatedBy.timestamp > items[0].createdBy.timestamp).to.be.true
          expect(items[0].updatedBy.timestamp <= new Date().toISOString()).to.be.true
          expect(items[0].updatedBy.username).to.equal(creator.username)
        } else {
          expect('updatedBy' in items[0]).to.be.false
        }
        expect('fileUploadedBy' in items[0]).to.be.false
        changeHandlerCallCount += 1
      }

      await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

      await this.test.userbase.insertItem({ databaseName, itemId, item: testItem })

      await this.test.userbase.openDatabase({ databaseName, changeHandler })

      await wait(5) // to ensure that the updated item has a later timestamp

      await this.test.userbase.updateItem({ databaseName, itemId, item: updatedTestItem })

      expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Correctly sets fileUploadedBy', async function () {
      const creator = await signUp(this.test.userbase)
      const itemId = 'test-item'
      const testItem = 'hello world!'
      const testFileName = 'test-file-name.txt'
      const testFileType = 'text/plain'
      const testFile = new this.test.win.File([1], testFileName, { type: testFileType })

      let changeHandlerCallCount = 0
      const changeHandler = (items) => {
        expect(items[0].createdBy.timestamp >= this.test.startTime).to.be.true
        expect(items[0].createdBy.timestamp <= new Date().toISOString()).to.be.true
        expect(items[0].createdBy.username).to.equal(creator.username)
        if (changeHandlerCallCount > 0) {
          expect(items[0].fileUploadedBy.timestamp > items[0].createdBy.timestamp).to.be.true
          expect(items[0].fileUploadedBy.timestamp <= new Date().toISOString()).to.be.true
          expect(items[0].fileUploadedBy.username).to.equal(creator.username)
        } else {
          expect('fileUploadedBy' in items[0]).to.be.false
        }
        expect('updatedBy' in items[0]).to.be.false
        changeHandlerCallCount += 1
      }

      await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

      await this.test.userbase.insertItem({ databaseName, itemId, item: testItem })

      await this.test.userbase.openDatabase({ databaseName, changeHandler })

      await wait(5) // to ensure that the updated item has a later timestamp

      await this.test.userbase.uploadFile({ databaseName, itemId, file: testFile })

      expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Correctly sets attribution for multi-operation transactions', async function () {
      const creator = await signUp(this.test.userbase)
      const NUM_ITEMS = 5
      const operations = []
      for (let i = 0; i < NUM_ITEMS; i++) {
        const item = i.toString()
        const itemId = item
        operations.push({ command: 'Insert', item, itemId })
      }

      let changeHandlerCallCount = 0
      const changeHandler = (items) => {
        for (let i = 0; i < NUM_ITEMS; ++i) {
          expect(items[i].createdBy.timestamp >= this.test.startTime).to.be.true
          expect(items[i].createdBy.timestamp <= new Date().toISOString()).to.be.true
          expect(items[i].createdBy.timestamp).to.equal(items[0].createdBy.timestamp)
          expect(items[i].createdBy.username).to.equal(creator.username)
          expect('updatedBy' in items[i]).to.be.false
          expect('fileUploadedBy' in items[i]).to.be.false
        }
        changeHandlerCallCount += 1
      }

      await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

      await this.test.userbase.putTransaction({ databaseName, operations })

      await this.test.userbase.openDatabase({ databaseName, changeHandler })

      expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

      // clean up
      await this.test.userbase.deleteUser()
    })
  })

  describe('Documents others inserted', function () {
    it('Attribution is correctly handled in multi-user environment', async function () {
      const friend = await signUp(this.test.userbase)
      const { verificationMessage } = await this.test.userbase.getVerificationMessage()
      await this.test.userbase.signOut()

      const creator = await signUp(this.test.userbase)
      await this.test.userbase.verifyUser({ verificationMessage })
      await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

      await this.test.userbase.shareDatabase({ databaseName, username: friend.username, readOnly: false })

      // creator inserts an item
      const item = 'hello world!'
      await this.test.userbase.insertItem({ databaseName, item, itemId: '0' })
      await this.test.userbase.signOut()

      // friend does a few things:
      // * inserts a second item
      // * does a transaction which inserts a third item, and updates the first TWO items
      // * changes usernames
      await this.test.userbase.signIn({ username: friend.username, password: friend.password, rememberMe: 'none' })

      const { databases: [{ databaseId }] } = await this.test.userbase.getDatabases()

      await this.test.userbase.openDatabase({ databaseId, changeHandler: () => { } })

      await this.test.userbase.insertItem({ databaseId, item, itemId: '1' })
      await this.test.userbase.putTransaction({
        databaseId, operations: [
          { command: 'Insert', item, itemId: '2' },
          { command: 'Update', item, itemId: '0' },
          { command: 'Update', item, itemId: '1' },
        ]
      })

      const updatedUsername = 'test-user-' + getRandomString()
      await this.test.userbase.updateUser({ username: updatedUsername })

      await this.test.userbase.signOut()

      await this.test.userbase.signIn({ username: creator.username, password: creator.password, rememberMe: 'none' })

      let changeHandlerCallCount = 0
      const changeHandler = function (items) {
        expect(items[0].createdBy.username).to.equal(creator.username)
        expect(items[0].updatedBy.username).to.equal(updatedUsername)
        expect(items[1].createdBy.username).to.equal(updatedUsername)
        expect(items[1].updatedBy.username).to.equal(updatedUsername)
        expect(items[2].createdBy.username).to.equal(updatedUsername)
        expect('updatedBy' in items[2]).to.be.false

        changeHandlerCallCount += 1
      }

      await this.test.userbase.openDatabase({ databaseName, changeHandler })

      expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

      // clean up
      await this.test.userbase.deleteUser()
      await this.test.userbase.signIn({ username: updatedUsername, password: friend.password, rememberMe: 'none' })
      await this.test.userbase.deleteUser()
    })

    it('Sets userDeleted to true', async function () {
      const friend = await signUp(this.test.userbase)
      const { verificationMessage } = await this.test.userbase.getVerificationMessage()
      await this.test.userbase.signOut()

      const creator = await signUp(this.test.userbase)
      await this.test.userbase.verifyUser({ verificationMessage })
      await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

      await this.test.userbase.shareDatabase({ databaseName, username: friend.username, readOnly: false })

      // creator inserts an item
      const item = 'hello world!'
      await this.test.userbase.insertItem({ databaseName, item, itemId: '0' })
      await this.test.userbase.signOut()

      // friend does a few things:
      // * inserts a second item
      // * does a transaction which inserts a third item, and updates the first TWO items
      // * DELETES user
      await this.test.userbase.signIn({ username: friend.username, password: friend.password, rememberMe: 'none' })

      const { databases: [{ databaseId }] } = await this.test.userbase.getDatabases()

      await this.test.userbase.openDatabase({ databaseId, changeHandler: () => { } })

      await this.test.userbase.insertItem({ databaseId, item, itemId: '1' })
      await this.test.userbase.putTransaction({
        databaseId, operations: [
          { command: 'Insert', item, itemId: '2' },
          { command: 'Update', item, itemId: '0' },
          { command: 'Update', item, itemId: '1' },
        ]
      })

      await this.test.userbase.deleteUser()

      await this.test.userbase.signIn({ username: creator.username, password: creator.password, rememberMe: 'none' })

      let changeHandlerCallCount = 0
      const changeHandler = function (items) {
        expect(items[0].createdBy.username).to.equal(creator.username)
        expect('username' in items[0].updatedBy).to.be.false
        expect(items[0].updatedBy.userDeleted).to.be.true

        expect('username' in items[1].createdBy).to.be.false
        expect(items[1].createdBy.userDeleted).to.be.true
        expect('username' in items[1].updatedBy).to.be.false
        expect(items[1].updatedBy.userDeleted).to.be.true

        expect('username' in items[2].createdBy).to.be.false
        expect(items[2].createdBy.userDeleted).to.be.true
        expect('updatedBy' in items[2]).to.be.false

        changeHandlerCallCount += 1
      }

      await this.test.userbase.openDatabase({ databaseName, changeHandler })

      expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

      // clean up
      await this.test.userbase.deleteUser()
    })

    // must check the server to verify reading bundle from S3 and not DDB
    it('Attribution is preserved after bundling', async function () {
      const friend = await signUp(this.test.userbase)
      const { verificationMessage } = await this.test.userbase.getVerificationMessage()
      await this.test.userbase.signOut()

      // creator makes db with one item
      const creator = await signUp(this.test.userbase)
      await this.test.userbase.verifyUser({ verificationMessage })
      await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })
      await this.test.userbase.insertItem({ databaseName, item: 'first-item', itemId: 'first-item-id' })
      await this.test.userbase.shareDatabase({ databaseName, username: friend.username, readOnly: false })
      await this.test.userbase.signOut()

      // friend inserts a bunch of items to trigger a bundle
      await this.test.userbase.signIn({ username: friend.username, password: friend.password, rememberMe: 'none' })
      const { databases: [{ databaseId }] } = await this.test.userbase.getDatabases()

      const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
      const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
      expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

      const largeString = getStringOfByteLength(ITEM_SIZE)
      const operations = []
      for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
        operations.push({ command: 'Insert', item: largeString, itemId: i.toString() })
      }

      await this.test.userbase.openDatabase({ databaseId, changeHandler: () => { } })
      await this.test.userbase.putTransaction({ databaseId, operations })

      // give the friend sufficient time to finish the bundle
      const THREE_SECONDS = 3 * 1000
      await wait(THREE_SECONDS)

      // switch back to creator and check attribution
      await this.test.userbase.signOut()
      await this.test.userbase.signIn({ username: creator.username, password: creator.password, rememberMe: 'none' })

      let changeHandlerCallCount = 0
      let successful

      const changeHandler = function (items) {
        console.log(items.map(i => i.createdBy.username))
        changeHandlerCallCount += 1

        expect(items, 'array passed to changeHandler').to.have.lengthOf(numItemsNeededToTriggerBundle + 1)

        const firstItem = items[0]
        const { createdBy } = firstItem
        expect(createdBy).to.be.an('object').that.has.all.keys('username', 'timestamp')
        expect(createdBy.username).to.equal(creator.username)

        for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
          const insertedItem = items[i + 1]
          const { createdBy } = insertedItem
          expect(createdBy).to.be.an('object').that.has.all.keys('username', 'timestamp')
          expect(createdBy.username).to.equal(friend.username)
        }

        successful = true
      }

      await this.test.userbase.openDatabase({ databaseName, changeHandler })

      expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)
      expect(successful, 'successful state').to.be.true

      await this.test.userbase.deleteUser()
      await this.test.userbase.signIn({ username: friend.username, password: friend.password, rememberMe: 'none' })
      await this.test.userbase.deleteUser()
    })
  })
})
