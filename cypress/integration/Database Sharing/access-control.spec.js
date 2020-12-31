import { getRandomString, getStringOfByteLength, wait } from '../../support/utils'
const BUNDLE_SIZE = 50 * 1024 // from src/userbase-server/ws.js

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

  describe('Write access', function () {

    describe('Sucess Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Item creator can update item', async function () {
        const user = await signUp(this.test.userbase)

        // insert, then update item with write access into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { onlyCreator: true }

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          if (changeHandlerCallCount) {
            expect(items, 'array passed to changeHandler').to.be.a('array')

            const expectedItem = {
              itemId: testItemId,
              item: testItem + (changeHandlerCallCount === 1 ? '' : '!'),
              writeAccess,
              createdBy: { username: user.username, timestamp: items[0].createdBy.timestamp },
            }
            if (changeHandlerCallCount === 2) expectedItem.updatedBy = { username: user.username, timestamp: items[0].updatedBy.timestamp }
            expect(items, 'array passed to changeHandler').to.deep.equal([expectedItem])
          }

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId, writeAccess })
        await this.test.userbase.updateItem({ databaseName, item: testItem + '!', itemId: testItemId })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(3)

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Item creator can set write access via updateItem', async function () {
        const user = await signUp(this.test.userbase)

        // insert, then update item with write access into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { onlyCreator: true }

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          if (changeHandlerCallCount) {
            expect(items, 'array passed to changeHandler').to.be.a('array')

            const expectedItem = {
              itemId: testItemId,
              item: testItem + (changeHandlerCallCount === 1 ? '' : '!'),
              createdBy: { username: user.username, timestamp: items[0].createdBy.timestamp },
            }
            if (changeHandlerCallCount === 2) {
              expectedItem.writeAccess = writeAccess
              expectedItem.updatedBy = { username: user.username, timestamp: items[0].updatedBy.timestamp }
            }
            expect(items, 'array passed to changeHandler').to.deep.equal([expectedItem])
          }

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })
        await this.test.userbase.updateItem({ databaseName, item: testItem + '!', itemId: testItemId, writeAccess })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(3)

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Item creator can set write access via transaction', async function () {
        const user = await signUp(this.test.userbase)

        // insert, then update item with write access into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { onlyCreator: true }

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          if (changeHandlerCallCount) {
            expect(items, 'array passed to changeHandler').to.be.a('array')

            const expectedItem = {
              itemId: testItemId,
              item: testItem + (changeHandlerCallCount === 1 ? '' : '!'),
              createdBy: { username: user.username, timestamp: items[0].createdBy.timestamp },
            }
            if (changeHandlerCallCount === 2) {
              expectedItem.writeAccess = writeAccess
              expectedItem.updatedBy = { username: user.username, timestamp: items[0].updatedBy.timestamp }
            }
            expect(items, 'array passed to changeHandler').to.deep.equal([expectedItem])
          }

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })
        await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Update', item: testItem + '!', itemId: testItemId, writeAccess }] })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(3)

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Give recipient write access', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)

        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { users: [{ username: recipient.username }] }

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')

          if (changeHandlerCallCount) {
            const expectedItem = {
              itemId: testItemId,
              item: testItem,
              writeAccess,
              createdBy: { username: sender.username, timestamp: items[0].createdBy.timestamp },
            }
            expect(items, 'array passed to changeHandler').to.deep.equal([expectedItem])
          }

          changeHandlerCallCount += 1
        }

        // insert with write access into database
        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId, writeAccess })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Give recipient write access via transaction', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)

        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { users: [{ username: recipient.username }] }

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')

          if (changeHandlerCallCount) {
            const expectedItem = {
              itemId: testItemId,
              item: testItem,
              writeAccess,
              createdBy: { username: sender.username, timestamp: items[0].createdBy.timestamp },
            }
            expect(items, 'array passed to changeHandler').to.deep.equal([expectedItem])
          }

          changeHandlerCallCount += 1
        }

        // insert with write access into database
        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Insert', item: testItem, itemId: testItemId, writeAccess }] })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Recipient can update item', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // insert, then update item with write access into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { users: [{ username: recipient.username }] }
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId, writeAccess })

        // sender gets database share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })

        await this.test.userbase.signOut()

        // recipient signs in and checks if can update the item
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')

          const expectedItem = {
            itemId: testItemId,
            item: testItem + (changeHandlerCallCount === 0 ? '' : '!'),
            writeAccess,
            createdBy: { username: sender.username, timestamp: items[0].createdBy.timestamp },
          }
          if (changeHandlerCallCount === 1) expectedItem.updatedBy = { username: recipient.username, timestamp: items[0].updatedBy.timestamp }
          expect(items, 'array passed to changeHandler').to.deep.equal([expectedItem])

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ shareToken, changeHandler })
        await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Recipient can update item after being given write access via transaction', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // insert, then update item with write access into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { users: [{ username: recipient.username }] }
        await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Insert', item: testItem, itemId: testItemId, writeAccess }] })

        // sender gets database share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })

        await this.test.userbase.signOut()

        // recipient signs in and checks if can update the item
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')

          const expectedItem = {
            itemId: testItemId,
            item: testItem + (changeHandlerCallCount === 0 ? '' : '!'),
            writeAccess,
            createdBy: { username: sender.username, timestamp: items[0].createdBy.timestamp },
          }
          if (changeHandlerCallCount === 1) expectedItem.updatedBy = { username: recipient.username, timestamp: items[0].updatedBy.timestamp }
          expect(items, 'array passed to changeHandler').to.deep.equal([expectedItem])

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ shareToken, changeHandler })
        await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Both item creator and recipient can update item', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // insert, then update item with write access into database
        const testItem = 'hello world'
        const testItemId = 'test-id'
        const writeAccess = { users: [{ username: recipient.username }] }
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId, writeAccess })
        await this.test.userbase.updateItem({ databaseName, item: testItem + '!', itemId: testItemId })

        // sender gets database share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })

        await this.test.userbase.signOut()

        // recipient signs in and checks if can update the item
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')

          const expectedItem = {
            itemId: testItemId,
            item: testItem + (changeHandlerCallCount === 0 ? '!' : '!!'),
            writeAccess,
            createdBy: { username: sender.username, timestamp: items[0].createdBy.timestamp },
            updatedBy: changeHandlerCallCount === 0
              ? { username: sender.username, timestamp: items[0].updatedBy.timestamp }
              : { username: recipient.username, timestamp: items[0].updatedBy.timestamp },
          }
          expect(items, 'array passed to changeHandler').to.deep.equal([expectedItem])

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ shareToken, changeHandler })
        await this.test.userbase.updateItem({ shareToken, item: testItem + '!!', itemId: testItemId })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Item creator can remove write access setting', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // insert, then update item with write access into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { onlyCreator: true }
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId, writeAccess })
        await this.test.userbase.updateItem({ databaseName, item: testItem, itemId: testItemId, writeAccess: null })

        // sender gets database share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })
        await this.test.userbase.signOut()

        // recipient signs up and checks if can update the item
        const recipient = await signUp(this.test.userbase)

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')

          const expectedItem = {
            itemId: testItemId,
            item: testItem + (changeHandlerCallCount === 0 ? '' : '!'),
            createdBy: { username: sender.username, timestamp: items[0].createdBy.timestamp },
            updatedBy: changeHandlerCallCount === 0
              ? { username: sender.username, timestamp: items[0].updatedBy.timestamp }
              : { username: recipient.username, timestamp: items[0].updatedBy.timestamp },
          }
          expect(items, 'array passed to changeHandler').to.deep.equal([expectedItem])

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ shareToken, changeHandler })
        await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Item creator can remove write access inside a transaction', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // insert, then update item with write access into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { onlyCreator: true }
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId, writeAccess })
        await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Update', item: testItem, itemId: testItemId, writeAccess: null }] })

        // sender gets database share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })
        await this.test.userbase.signOut()

        // recipient signs up and checks if can update the item
        const recipient = await signUp(this.test.userbase)

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')

          const expectedItem = {
            itemId: testItemId,
            item: testItem + (changeHandlerCallCount === 0 ? '' : '!'),
            createdBy: { username: sender.username, timestamp: items[0].createdBy.timestamp },
            updatedBy: changeHandlerCallCount === 0
              ? { username: sender.username, timestamp: items[0].updatedBy.timestamp }
              : { username: recipient.username, timestamp: items[0].updatedBy.timestamp },
          }
          expect(items, 'array passed to changeHandler').to.deep.equal([expectedItem])

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ shareToken, changeHandler })
        await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Database owner can modify item', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender gets database share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })
        await this.test.userbase.signOut()

        // recipient signs up and inserts with write access to only allow self to update
        const recipient = await signUp(this.test.userbase)
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { onlyCreator: true }

        await this.test.userbase.openDatabase({ shareToken, changeHandler: () => { } })
        await this.test.userbase.insertItem({ shareToken, item: testItem, itemId: testItemId, writeAccess })
        await this.test.userbase.signOut()

        // sender signs back in and modifes the item
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')

          const expectedItem = {
            itemId: testItemId,
            item: testItem + (changeHandlerCallCount === 0 ? '' : '!'),
            writeAccess,
            createdBy: { username: recipient.username, timestamp: items[0].createdBy.timestamp },
          }
          if (changeHandlerCallCount === 1) expectedItem.updatedBy = { username: sender.username, timestamp: items[0].updatedBy.timestamp }
          expect(items, 'array passed to changeHandler').to.deep.equal([expectedItem])

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.updateItem({ databaseName, item: testItem + '!', itemId: testItemId })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Database owner can remove write access', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender gets database share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })
        await this.test.userbase.signOut()

        // recipient signs up and inserts with write access to only allow self to update
        const recipient = await signUp(this.test.userbase)
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { onlyCreator: true }

        await this.test.userbase.openDatabase({ shareToken, changeHandler: () => { } })
        await this.test.userbase.insertItem({ shareToken, item: testItem, itemId: testItemId, writeAccess })
        await this.test.userbase.signOut()

        // sender signs back in and modifes the item
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')

          const expectedItem = {
            itemId: testItemId,
            item: testItem,
            writeAccess,
            createdBy: { username: recipient.username, timestamp: items[0].createdBy.timestamp },
          }
          if (changeHandlerCallCount === 1) {
            expectedItem.updatedBy = { username: sender.username, timestamp: items[0].updatedBy.timestamp }
            delete expectedItem.writeAccess
          }
          expect(items, 'array passed to changeHandler').to.deep.equal([expectedItem])

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.updateItem({ databaseName, item: testItem, itemId: testItemId, writeAccess: null })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Database owner can remove write access inside a transaction', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // sender gets database share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })
        await this.test.userbase.signOut()

        // recipient signs up and inserts with write access to only allow self to update
        const recipient = await signUp(this.test.userbase)
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { onlyCreator: true }

        await this.test.userbase.openDatabase({ shareToken, changeHandler: () => { } })
        await this.test.userbase.insertItem({ shareToken, item: testItem, itemId: testItemId, writeAccess })
        await this.test.userbase.signOut()

        // sender signs back in and modifes the item
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')

          const expectedItem = {
            itemId: testItemId,
            item: testItem,
            writeAccess,
            createdBy: { username: recipient.username, timestamp: items[0].createdBy.timestamp },
          }
          if (changeHandlerCallCount === 1) {
            expectedItem.updatedBy = { username: sender.username, timestamp: items[0].updatedBy.timestamp }
            delete expectedItem.writeAccess
          }
          expect(items, 'array passed to changeHandler').to.deep.equal([expectedItem])

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Update', item: testItem, itemId: testItemId, writeAccess: null }] })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Write access onlyCreator setting remains after bundling', async function () {
        const user = await signUp(this.test.userbase)

        // insert, then update item with write access into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { onlyCreator: true }

        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)
        const operations = []
        for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
          operations.push({ command: 'Insert', item: largeString, itemId: i.toString() })
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId, writeAccess })
        await this.test.userbase.putTransaction({ databaseName, operations })

        // give client sufficient time to finish the bundle
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        await this.test.userbase.signOut()

        await this.test.userbase.signIn({ username: user.username, password: user.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array').with.lengthOf(numItemsNeededToTriggerBundle + 1)

          for (let i = 0; i < items.length; i++) {
            const item = items[i]
            if (i === 0) {
              expect(item, 'first item').to.deep.equal({
                itemId: testItemId,
                item: testItem,
                writeAccess,
                createdBy: { username: user.username, timestamp: items[i].createdBy.timestamp },
              })
            } else {
              expect(item, 'other items').to.deep.equal({
                itemId: operations[i - 1].itemId,
                item: largeString,
                createdBy: { username: user.username, timestamp: items[i].createdBy.timestamp },
              })
            }
          }

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Write access users setting remains after bundling', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const user = await signUp(this.test.userbase)

        // insert, then update item with write access into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { users: [{ username: recipient.username }] }

        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)
        const operations = []
        for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
          operations.push({ command: 'Insert', item: largeString, itemId: i.toString() })
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId, writeAccess })
        await this.test.userbase.putTransaction({ databaseName, operations })

        // give client sufficient time to finish the bundle
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        await this.test.userbase.signOut()

        await this.test.userbase.signIn({ username: user.username, password: user.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array').with.lengthOf(numItemsNeededToTriggerBundle + 1)

          for (let i = 0; i < items.length; i++) {
            const item = items[i]
            if (i === 0) {
              expect(item, 'first item').to.deep.equal({
                itemId: testItemId,
                item: testItem,
                writeAccess,
                createdBy: { username: user.username, timestamp: items[i].createdBy.timestamp },
              })
            } else {
              expect(item, 'other items').to.deep.equal({
                itemId: operations[i - 1].itemId,
                item: largeString,
                createdBy: { username: user.username, timestamp: items[i].createdBy.timestamp },
              })
            }
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

      it('Write access users setting remains after bundling and changing name', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const user = await signUp(this.test.userbase)

        // insert, then update item with write access into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { users: [{ username: recipient.username }] }

        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)
        const operations = []
        for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
          operations.push({ command: 'Insert', item: largeString, itemId: i.toString() })
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId, writeAccess })
        await this.test.userbase.putTransaction({ databaseName, operations })

        // give client sufficient time to finish the bundle
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        await this.test.userbase.signOut()

        // update recipient's username
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })
        const newUsername = 'test-user-' + getRandomString()
        await this.test.userbase.updateUser({ username: newUsername })
        recipient.username = newUsername
        await this.test.userbase.signOut()

        // sign back in and check that write access correctly reflects new username
        await this.test.userbase.signIn({ username: user.username, password: user.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array').with.lengthOf(numItemsNeededToTriggerBundle + 1)

          for (let i = 0; i < items.length; i++) {
            const item = items[i]
            if (i === 0) {
              expect(item, 'first item').to.deep.equal({
                itemId: testItemId,
                item: testItem,
                writeAccess: { users: [{ username: recipient.username }] },
                createdBy: { username: user.username, timestamp: items[i].createdBy.timestamp },
              })
            } else {
              expect(item, 'other items').to.deep.equal({
                itemId: operations[i - 1].itemId,
                item: largeString,
                createdBy: { username: user.username, timestamp: items[i].createdBy.timestamp },
              })
            }
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

      it('Transaction Unauthorized - only the item creator can modify the item', async function () {
        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // insert with write access set to onlyCreator
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { onlyCreator: true }
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId, writeAccess })

        // sender gets database share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })
        await this.test.userbase.signOut()

        // recipient signs in and checks if can modify the item
        await signUp(this.test.userbase)

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')
          expect(items, 'array passed to changeHandler').to.deep.equal([{
            itemId: testItemId,
            item: testItem,
            writeAccess,
            createdBy: { username: sender.username, timestamp: items[0].createdBy.timestamp },
          }])

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ shareToken, changeHandler })

        try {
          await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'updateItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId, writeAccess })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'updateItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.deleteItem({ shareToken, itemId: testItemId })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'deleteItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.uploadFile({ shareToken, itemId: testItemId, file: new this.test.win.File([1], 'test.txt') })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'uploadFile' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.putTransaction({ shareToken, operations: [{ command: 'Update', item: testItem + '!', itemId: testItemId }] })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'Update' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.putTransaction({ shareToken, operations: [{ command: 'Delete', itemId: testItemId }] })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'Delete' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Transaction Unauthorized - user explicitly not given permission', async function () {
        const unusedUser = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // insert, then update item with write access into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { users: [{ username: unusedUser.username }] }
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId, writeAccess })

        // sender gets database share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })
        await this.test.userbase.signOut()

        // recipient signs in and checks if can update the item
        await signUp(this.test.userbase)

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')
          expect(items, 'array passed to changeHandler').to.deep.equal([{
            itemId: testItemId,
            item: testItem,
            writeAccess,
            createdBy: { username: sender.username, timestamp: items[0].createdBy.timestamp },
          }])

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ shareToken, changeHandler })

        try {
          await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'updateItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId, writeAccess })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'updateItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.deleteItem({ shareToken, itemId: testItemId })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'deleteItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.uploadFile({ shareToken, itemId: testItemId, file: new this.test.win.File([1], 'test.txt') })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'uploadFile' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.putTransaction({ shareToken, operations: [{ command: 'Update', item: testItem + '!', itemId: testItemId }] })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'Update' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.putTransaction({ shareToken, operations: [{ command: 'Delete', itemId: testItemId }] })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'Delete' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: unusedUser.username, password: unusedUser.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it("Transaction Unauthorized - item creator removes user's write access", async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // insert with write access granted to recipient, and then remove access
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { users: [{ username: recipient.username }] }
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId, writeAccess })
        await this.test.userbase.updateItem({ databaseName, item: testItem, itemId: testItemId, writeAccess: { onlyCreator: true } })

        // sender gets database share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })
        await this.test.userbase.signOut()

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')
          expect(items, 'array passed to changeHandler').to.deep.equal([{
            itemId: testItemId,
            item: testItem,
            writeAccess: { onlyCreator: true },
            createdBy: { username: sender.username, timestamp: items[0].createdBy.timestamp },
            updatedBy: { username: sender.username, timestamp: items[0].updatedBy.timestamp },
          }])

          changeHandlerCallCount += 1
        }

        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })
        await this.test.userbase.openDatabase({ shareToken, changeHandler })

        try {
          await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'updateItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId, writeAccess })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'updateItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.deleteItem({ shareToken, itemId: testItemId })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'deleteItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.uploadFile({ shareToken, itemId: testItemId, file: new this.test.win.File([1], 'test.txt') })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'uploadFile' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.putTransaction({ shareToken, operations: [{ command: 'Update', item: testItem + '!', itemId: testItemId }] })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'Update' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.putTransaction({ shareToken, operations: [{ command: 'Delete', itemId: testItemId }] })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'Delete' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it("Transaction Unauthorized - item creator removes user's write access via transaction", async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // insert with write access granted to recipient, and then remove access
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { users: [{ username: recipient.username }] }
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId, writeAccess })
        await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Update', item: testItem, itemId: testItemId, writeAccess: { onlyCreator: true } }] })

        // sender gets database share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })
        await this.test.userbase.signOut()

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')
          expect(items, 'array passed to changeHandler').to.deep.equal([{
            itemId: testItemId,
            item: testItem,
            writeAccess: { onlyCreator: true },
            createdBy: { username: sender.username, timestamp: items[0].createdBy.timestamp },
            updatedBy: { username: sender.username, timestamp: items[0].updatedBy.timestamp },
          }])

          changeHandlerCallCount += 1
        }

        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })
        await this.test.userbase.openDatabase({ shareToken, changeHandler })

        try {
          await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'updateItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId, writeAccess })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'updateItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.deleteItem({ shareToken, itemId: testItemId })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'deleteItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.uploadFile({ shareToken, itemId: testItemId, file: new this.test.win.File([1], 'test.txt') })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'uploadFile' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.putTransaction({ shareToken, operations: [{ command: 'Update', item: testItem + '!', itemId: testItemId }] })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'Update' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.putTransaction({ shareToken, operations: [{ command: 'Delete', itemId: testItemId }] })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'Delete' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Transaction Unauthorized - database owner removes write access', async function () {
        const userA = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const userB = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const owner = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // owner gets database share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })
        await this.test.userbase.signOut()

        // userA inserts item with writeAccess
        await this.test.userbase.signIn({ username: userA.username, password: userA.password, rememberMe: 'none' })
        await this.test.userbase.openDatabase({ shareToken, changeHandler: () => { } })

        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { users: [{ username: userB.username }] }
        await this.test.userbase.insertItem({ shareToken, item: testItem, itemId: testItemId, writeAccess })
        await this.test.userbase.signOut()

        // owner signs in and changes writeAccess to onlyCreator
        await this.test.userbase.signIn({ username: owner.username, password: owner.password, rememberMe: 'none' })
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })
        await this.test.userbase.updateItem({ databaseName, item: testItem, itemId: testItemId, writeAccess: { onlyCreator: true } })
        await this.test.userbase.signOut()

        // userB shouldn't have write access
        await this.test.userbase.signIn({ username: userB.username, password: userB.password, rememberMe: 'none' })
        await this.test.userbase.openDatabase({ shareToken, changeHandler: () => { } })

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')
          expect(items, 'array passed to changeHandler').to.deep.equal([{
            itemId: testItemId,
            item: testItem,
            writeAccess: { onlyCreator: true },
            createdBy: { username: userA.username, timestamp: items[0].createdBy.timestamp },
            updatedBy: { username: owner.username, timestamp: items[0].updatedBy.timestamp },
          }])

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ shareToken, changeHandler })

        try {
          await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'updateItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.deleteItem({ shareToken, itemId: testItemId })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'deleteItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.uploadFile({ shareToken, itemId: testItemId, file: new this.test.win.File([1], 'test.txt') })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'uploadFile' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.putTransaction({ shareToken, operations: [{ command: 'Update', item: testItem + '!', itemId: testItemId }] })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'Update' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.putTransaction({ shareToken, operations: [{ command: 'Delete', itemId: testItemId }] })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'Delete' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: userA.username, password: userA.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: owner.username, password: owner.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Transaction Unauthorized - write access setting remains after bundling', async function () {
        const unusedUser = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)

        // insert with write access provided to unused user
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { users: [{ username: unusedUser.username }] }

        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId, writeAccess })

        // Trigger bundle
        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)
        const operations = []
        for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
          operations.push({ command: 'Insert', item: largeString, itemId: i.toString() })
        }
        await this.test.userbase.putTransaction({ databaseName, operations })

        // give client sufficient time to finish the bundle
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        await this.test.userbase.signOut()

        // recipient should not be able to update the item
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })
        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array').with.lengthOf(numItemsNeededToTriggerBundle + 1)

          for (let i = 0; i < items.length; i++) {
            const item = items[i]
            if (i === 0) {
              expect(item, 'first item').to.deep.equal({
                itemId: testItemId,
                item: testItem,
                writeAccess,
                createdBy: { username: sender.username, timestamp: items[i].createdBy.timestamp },
              })
            } else {
              expect(item, 'other items').to.deep.equal({
                itemId: operations[i - 1].itemId,
                item: largeString,
                createdBy: { username: sender.username, timestamp: items[i].createdBy.timestamp },
              })
            }
          }

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ shareToken, changeHandler })

        try {
          await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'updateItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId, writeAccess })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'updateItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.deleteItem({ shareToken, itemId: testItemId })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'deleteItem' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.uploadFile({ shareToken, itemId: testItemId, file: new this.test.win.File([1], 'test.txt') })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'uploadFile' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.putTransaction({ shareToken, operations: [{ command: 'Update', item: testItem + '!', itemId: testItemId }] })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'Update' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.putTransaction({ shareToken, operations: [{ command: 'Delete', itemId: testItemId }] })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('TransactionUnauthorized')
          expect(e.message, 'error message').to.be.equal("Calling 'Delete' on this item is unauthorized.")
          expect(e.status, 'error status').to.be.equal(403)
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: unusedUser.username, password: unusedUser.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('WriteAccessParamNotAllowed - only item creator or owner can set write access', async function () {
        const recipient = await signUp(this.test.userbase)
        await this.test.userbase.signOut()

        const sender = await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // insert, then update item with write access into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId })

        // sender gets database share token
        const { shareToken } = await this.test.userbase.shareDatabase({ databaseName, readOnly: false })
        await this.test.userbase.signOut()

        // recipient signs in and checks if can update the item
        await this.test.userbase.signIn({ username: recipient.username, password: recipient.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')
          expect(items, 'array passed to changeHandler').to.deep.equal([{
            itemId: testItemId,
            item: testItem,
            createdBy: { username: sender.username, timestamp: items[0].createdBy.timestamp },
          }])

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ shareToken, changeHandler })

        try {
          await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId, writeAccess: null })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('WriteAccessParamNotAllowed')
          expect(e.message, 'error message').to.be.equal(`Write access parameter not allowed. Only the item creator or database owner can change an item's write access settings.`)
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.updateItem({ shareToken, item: testItem + '!', itemId: testItemId, writeAccess: { onlyCreator: true } })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('WriteAccessParamNotAllowed')
          expect(e.message, 'error message').to.be.equal(`Write access parameter not allowed. Only the item creator or database owner can change an item's write access settings.`)
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.putTransaction({ shareToken, operations: [{ command: 'Update', item: testItem + '!', itemId: testItemId, writeAccess: null }] })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('WriteAccessParamNotAllowed')
          expect(e.message, 'error message').to.be.equal(`Write access parameter not allowed. Only the item creator or database owner can change an item's write access settings.`)
          expect(e.status, 'error status').to.be.equal(403)
        }

        try {
          await this.test.userbase.putTransaction({ shareToken, operations: [{ command: 'Update', item: testItem + '!', itemId: testItemId, writeAccess: { onlyCreator: true } }] })
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('WriteAccessParamNotAllowed')
          expect(e.message, 'error message').to.be.equal(`Write access parameter not allowed. Only the item creator or database owner can change an item's write access settings.`)
          expect(e.status, 'error status').to.be.equal(403)
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: sender.username, password: sender.password, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('User not found - does not exist', async function () {
        await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // insert, then update item with write access into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const fakeUsername = 'fake-user'
        const writeAccess = { users: [{ username: fakeUsername }] }

        try {
          await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId, writeAccess })
        } catch (e) {
          expect(e.username, 'error username').to.be.equal(fakeUsername)
          expect(e.name, 'error name').to.be.equal('UserNotFound')
          expect(e.message, 'error message').to.be.equal("User not found.")
          expect(e.status, 'error status').to.be.equal(404)
        }
        // clean up
        await this.test.userbase.deleteUser()
      })

      it('User not found - deleted', async function () {
        const deletedUser = await signUp(this.test.userbase)
        await this.test.userbase.deleteUser()

        await signUp(this.test.userbase)
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // insert, then update item with write access into database
        const testItem = 'hello world!'
        const testItemId = 'test-id'
        const writeAccess = { users: [{ username: deletedUser.username }] }

        try {
          await this.test.userbase.insertItem({ databaseName, item: testItem, itemId: testItemId, writeAccess })
        } catch (e) {
          expect(e.username, 'error username').to.be.equal(deletedUser.username)
          expect(e.name, 'error name').to.be.equal('UserNotFound')
          expect(e.message, 'error message').to.be.equal("User not found.")
          expect(e.status, 'error status').to.be.equal(404)
        }
        // clean up
        await this.test.userbase.deleteUser()
      })

    })

  })

})
