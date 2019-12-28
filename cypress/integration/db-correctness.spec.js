const getRandomString = () => Math.random().toString().substring(2)
const getStringOfByteLength = (byteLength) => {
  const BYTES_IN_STRING = 2
  return 'a'.repeat(byteLength / BYTES_IN_STRING)
}

const wait = (ms) => new Promise(resolve => {
  setTimeout(() => resolve(), ms)
})

describe('DB Correctness Tests', function () {
  beforeEach(function () {
    cy.visit('./cypress/integration/index.html').then(async function (win) {
      expect(win).to.have.property('userbase')
      const userbase = win.userbase
      this.currentTest.userbase = userbase

      const { appId, endpoint } = Cypress.env()
      userbase.init({ appId, endpoint })

      const randomUser = 'test-user-' + getRandomString()
      const password = getRandomString()
      const email = null
      const profile = null
      const showKeyHandler = () => { }
      const rememberMe = false
      const backUpKey = true

      await userbase.signUp(randomUser, password, email, profile, showKeyHandler, rememberMe, backUpKey)

      this.currentTest.username = randomUser
      this.currentTest.password = password
    })
  })

  it('Open Database', async function () {
    const dbName = 'test-db'

    const spyChangeHandler = {
      changeHandler: function (items) {
        expect(items).to.be.an('array')
        expect(items).to.be.empty
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)

    expect(spy.callCount).to.equal(1)
  })

  it('Insert 1 Item', async function () {
    const dbName = 'test-db'
    const itemToInsert = {
      key1: 'Test',
      key2: 123
    }

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 2) {
          expect(items).to.have.lengthOf(1)

          const insertedItem = items[0]
          expect(insertedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

          const { item, itemId } = insertedItem
          expect(item).to.deep.equal(itemToInsert)
          expect(itemId).to.be.a('string')
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await this.test.userbase.insertItem(dbName, itemToInsert)

    expect(spy.callCount).to.equal(2)
  })

  it('Insert 1 Item with Item ID provided', async function () {
    const dbName = 'test-db'

    const testItemId = 'test-id'
    const itemToInsert = {
      key1: 'Test',
      key2: 123
    }

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 2) {
          expect(items).to.have.lengthOf(1)

          const insertedItem = items[0]
          expect(insertedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

          const { item, itemId } = insertedItem
          expect(item).to.deep.equal(itemToInsert)
          expect(itemId).to.equal(testItemId)
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await this.test.userbase.insertItem(dbName, itemToInsert, testItemId)

    expect(spy.callCount).to.equal(2)
  })

  it('Update 1 Item', async function () {
    const dbName = 'test-db'
    const testItemId = 'test-id'
    const itemToInsert = {
      key1: 'Test',
      key2: 123
    }

    const itemToUpdate = {
      updatedKey: 'TestTest',
      updatedKey2: 456
    }

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 3) {
          expect(items).to.have.lengthOf(1)

          const updatedItem = items[0]
          expect(updatedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

          const { item, itemId } = updatedItem
          expect(item).to.deep.equal(itemToUpdate)
          expect(itemId).to.equal(testItemId)
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await this.test.userbase.insertItem(dbName, itemToInsert, testItemId)
    await this.test.userbase.updateItem(dbName, itemToUpdate, testItemId)

    expect(spy.callCount).to.equal(3)
  })

  it('Delete 1 Item', async function () {
    const dbName = 'test-db'
    const testItemId = 'test-id'
    const itemToInsert = {
      key1: 'Test',
      key2: 123
    }

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 3) {
          expect(items).to.be.empty
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await this.test.userbase.insertItem(dbName, itemToInsert, testItemId)
    await this.test.userbase.deleteItem(dbName, testItemId)

    expect(spy.callCount).to.equal(3)
  })

  it('Inserting a duplicate item should fail', async function () {
    const dbName = 'test-db'
    const testItemId = 'test-id'
    const itemToInsert = {
      key1: 'Test',
      key2: 123
    }

    const duplicateItem = {
      failKey1: 'Fail'
    }

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 3) {
          expect(items).to.have.lengthOf(1)

          const insertedItem = items[0]
          expect(insertedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

          const { item, itemId } = insertedItem
          expect(item).to.deep.equal(itemToInsert)
          expect(itemId).to.equal(testItemId)
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await this.test.userbase.insertItem(dbName, itemToInsert, testItemId)

    try {
      await this.test.userbase.insertItem(dbName, duplicateItem, testItemId)
      throw 'Should have failed'
    } catch (e) {
      expect(e.name).to.be.equal('ItemAlreadyExists')
      expect(e.message).to.be.equal('Item with the same id already exists.')
      expect(e.status).to.be.equal(409)
    }

    expect(spy.callCount).to.equal(3)
  })

  it('Updating & Deleting a non-existent item should fail', async function () {
    const dbName = 'test-db'
    const testItemId = 'test-id'
    const itemToFailUpdate = {
      failKey1: 'Fail'
    }

    const spyChangeHandler = {
      changeHandler: function () { }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)

    try {
      await this.test.userbase.updateItem(dbName, itemToFailUpdate, testItemId)
      throw 'Should have failed'
    } catch (e) {
      expect(e.name).to.be.equal('ItemDoesNotExist')
      expect(e.message).to.be.equal('Item with the provided id does not exist.')
      expect(e.status).to.be.equal(404)
    }

    expect(spy.callCount, 'changeHandler is not called if item does not exist').to.equal(1)

    try {
      await this.test.userbase.deleteItem(dbName, testItemId)
      throw 'Should have failed'
    } catch (e) {
      expect(e.name).to.be.equal('ItemDoesNotExist')
      expect(e.message).to.be.equal('Item with the provided id does not exist.')
      expect(e.status).to.be.equal(404)
    }

    expect(spy.callCount, 'changeHandler is not called if item does not exist').to.equal(1)
  })

  it('Updating & Deleting a deleted item should fail', async function () {
    const dbName = 'test-db'
    const testItemId = 'test-id'
    const itemToInsert = {
      key1: 'Test',
      key2: 123
    }

    const itemToFailUpdate = {
      failKey1: 'Fail'
    }

    const spyChangeHandler = {
      changeHandler: function () { }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await this.test.userbase.insertItem(dbName, itemToInsert, testItemId)
    await this.test.userbase.deleteItem(dbName, testItemId)

    try {
      await this.test.userbase.updateItem(dbName, itemToFailUpdate, testItemId)
      throw 'Should have failed'
    } catch (e) {
      expect(e.name).to.be.equal('ItemDoesNotExist')
      expect(e.message).to.be.equal('Item with the provided id does not exist.')
      expect(e.status).to.be.equal(404)
    }

    expect(spy.callCount, 'changeHandler is not called if item does not exist').to.equal(3)

    try {
      await this.test.userbase.deleteItem(dbName, testItemId)
      throw 'Should have failed'
    } catch (e) {
      expect(e.name).to.be.equal('ItemDoesNotExist')
      expect(e.message).to.be.equal('Item with the provided id does not exist.')
      expect(e.status).to.be.equal(404)
    }

    expect(spy.callCount, 'changeHandler is not called if item does not exist').to.equal(3)
  })

  it('Insert the same item after deleting the item', async function () {
    const dbName = 'test-db'
    const testItemId = 'test-id'
    const itemToInsert = {
      key1: 'Test',
      key2: 123
    }

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 4) {
          expect(items).to.have.lengthOf(1)

          const insertedItem = items[0]
          expect(insertedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

          const { item, itemId } = insertedItem
          expect(item).to.deep.equal(itemToInsert)
          expect(itemId).to.equal(testItemId)
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await this.test.userbase.insertItem(dbName, itemToInsert, testItemId)
    await this.test.userbase.deleteItem(dbName, testItemId)
    await this.test.userbase.insertItem(dbName, itemToInsert, testItemId)

    expect(spy.callCount).to.equal(4)
  })

  it('3 sequential Inserts, then 3 sequential Updates, then 3 sequential Deletes', async function () {
    const numSequentialOperations = 3

    const dbName = 'test-db'

    const spyChangeHandler = {
      changeHandler: function (items) {

        if (spy.callCount === 1 + numSequentialOperations) {
          // all inserts are complete

          expect(items).to.have.lengthOf(numSequentialOperations)

          for (let i = 0; i < numSequentialOperations; i++) {
            const insertedItem = items[i]
            expect(insertedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

            const { item, itemId } = insertedItem
            expect(item).to.equal(i.toString())
            expect(itemId).to.equal(i.toString())
          }
        } else if (spy.callCount === 1 + (numSequentialOperations * 2)) {
          // all updates are complete

          expect(items).to.have.lengthOf(numSequentialOperations)

          for (let i = 0; i < numSequentialOperations; i++) {
            const insertedItem = items[i]
            expect(insertedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

            const { item, itemId } = insertedItem
            expect(item).to.equal((i + numSequentialOperations).toString())
            expect(itemId).to.equal(i.toString())
          }
        } else if (spy.callCount === 1 + (numSequentialOperations * 3)) {
          // all deletes are complete
          expect(items).to.be.empty
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)

    for (let i = 0; i < numSequentialOperations; i++) {
      const item = i.toString()
      const itemId = item
      await this.test.userbase.insertItem(dbName, item, itemId)
    }

    for (let i = 0; i < numSequentialOperations; i++) {
      const item = (i + numSequentialOperations).toString()
      const itemId = i.toString()
      await this.test.userbase.updateItem(dbName, item, itemId)
    }

    for (let i = 0; i < numSequentialOperations; i++) {
      const itemId = i.toString()
      await this.test.userbase.deleteItem(dbName, itemId)
    }

    expect(spy.callCount).to.equal(1 + (numSequentialOperations * 3))
  })

  it('Insert large item', async function () {
    const dbName = 'test-db'

    const NINE_KB = 9 * 1024
    const largeString = getStringOfByteLength(NINE_KB)

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 2) {
          expect(items).to.have.lengthOf(1)

          const insertedItem = items[0]
          expect(insertedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

          const { item, itemId } = insertedItem
          expect(item).to.equal(largeString)
          expect(itemId).to.be.a('string')
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await this.test.userbase.insertItem(dbName, largeString)

    expect(spy.callCount).to.equal(2)
  })

  it('Insert large item, then insert small item', async function () {
    const dbName = 'test-db'

    const NINE_KB = 9 * 1024
    const largeString = getStringOfByteLength(NINE_KB)

    const smallItem = {
      testKey: 'test'
    }

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 3) {
          expect(items).to.have.lengthOf(2)

          const insertedLargeItem = items[0]
          expect(insertedLargeItem).to.be.an('object').that.has.all.keys('item', 'itemId')
          expect(insertedLargeItem.item).to.equal(largeString)
          expect(insertedLargeItem.itemId).to.be.a('string')

          const insertedSmallItem = items[1]
          expect(insertedSmallItem).to.be.an('object').that.has.all.keys('item', 'itemId')
          expect(insertedSmallItem.item).to.deep.equal(smallItem)
          expect(insertedSmallItem.itemId).to.be.a('string')
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await this.test.userbase.insertItem(dbName, largeString)
    await this.test.userbase.insertItem(dbName, smallItem)

    expect(spy.callCount).to.equal(3)
  })

  it('Insert 1 Item in a transaction', async function () {
    const dbName = 'test-db'
    const itemToInsert = {
      key1: 'Test',
      key2: 123
    }

    const operations = [
      { command: 'Insert', item: itemToInsert }
    ]

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 2) {
          expect(items).to.have.lengthOf(1)

          const insertedItem = items[0]
          expect(insertedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

          const { item, itemId } = insertedItem
          expect(item).to.deep.equal(itemToInsert)
          expect(itemId).to.be.a('string')
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await this.test.userbase.transaction(dbName, operations)

    expect(spy.callCount).to.equal(2)
  })

  it('Insert 10 Items in a transaction', async function () {
    const NUM_ITEMS = 10

    const dbName = 'test-db'
    const operations = []
    for (let i = 0; i < NUM_ITEMS; i++) {
      const item = i.toString()
      const id = item
      operations.push({ command: 'Insert', item, id })
    }

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 2) {
          expect(items).to.have.lengthOf(NUM_ITEMS)

          for (let i = 0; i < NUM_ITEMS; i++) {
            const insertedItem = items[i]
            expect(insertedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

            const { item, itemId } = insertedItem
            expect(item).to.equal(i.toString())
            expect(itemId).to.equal(i.toString())
          }
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await this.test.userbase.transaction(dbName, operations)

    expect(spy.callCount).to.equal(2)
  })

  it('Update 10 Items in a transaction', async function () {
    const NUM_ITEMS = 10

    const dbName = 'test-db'
    const insertOperations = []
    for (let i = 0; i < NUM_ITEMS; i++) {
      const item = i.toString()
      const id = item
      insertOperations.push({ command: 'Insert', item, id })
    }

    const updateOperations = []
    for (let i = 0; i < NUM_ITEMS; i++) {
      const item = (i + NUM_ITEMS).toString()
      const id = i.toString()
      updateOperations.push({ command: 'Update', item, id })
    }

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 3) {
          expect(items).to.have.lengthOf(NUM_ITEMS)

          for (let i = 0; i < NUM_ITEMS; i++) {
            const updatedItem = items[i]
            expect(updatedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

            const { item, itemId } = updatedItem
            expect(item).to.equal((i + NUM_ITEMS).toString())
            expect(itemId).to.equal(i.toString())
          }
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await this.test.userbase.transaction(dbName, insertOperations)
    await this.test.userbase.transaction(dbName, updateOperations)

    expect(spy.callCount).to.equal(3)
  })

  it('10 Inserts in a transaction, then 10 Updates in a transaction, then 5 Deletes in a transaction', async function () {
    const dbName = 'test-db'

    const NUM_ITEMS = 10
    const NUM_DELETES = 5
    expect(NUM_DELETES).to.be.lessThan(NUM_ITEMS)

    const insertOperations = []
    for (let i = 0; i < NUM_ITEMS; i++) {
      const item = i.toString()
      const id = item
      insertOperations.push({ command: 'Insert', item, id })
    }

    const updateOperations = []
    for (let i = 0; i < NUM_ITEMS; i++) {
      const item = (i + NUM_ITEMS).toString()
      const id = i.toString()
      updateOperations.push({ command: 'Update', item, id })
    }

    const deleteOperations = []
    for (let i = 0; i < NUM_DELETES; i++) {
      const id = i.toString()
      deleteOperations.push({ command: 'Delete', id })
    }

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 4) {
          const totalItemsExpected = NUM_ITEMS - NUM_DELETES
          expect(items).to.have.lengthOf(totalItemsExpected)

          for (let i = 0; i < totalItemsExpected; i++) {
            const actualItem = items[i]
            expect(actualItem).to.be.an('object').that.has.all.keys('item', 'itemId')

            const { item, itemId } = actualItem
            expect(item).to.equal((i + NUM_ITEMS + NUM_DELETES).toString())
            expect(itemId).to.equal((i + NUM_DELETES).toString())
          }
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)

    await this.test.userbase.transaction(dbName, insertOperations)
    await this.test.userbase.transaction(dbName, updateOperations)
    await this.test.userbase.transaction(dbName, deleteOperations)

    expect(spy.callCount).to.equal(4)
  })

  it('2 sequential Inserts, then transaction with 1 Insert, 1 Update, and 1 Delete', async function () {
    const dbName = 'test-db'

    const itemId1 = 'test-item1'
    const item1ToInsert = {
      key1: 'insert1'
    }

    const itemId2 = 'test-item2'
    const item2ToInsert = {
      key2: 'insert2'
    }
    const item2ToUpdate = {
      updatedKey2: 'update2'
    }

    const itemId3 = 'test-item3'
    const item3ToInsert = {
      key3: 'insert3'
    }

    const operations = [
      { command: 'Insert', item: item3ToInsert, id: itemId3 },
      { command: 'Update', item: item2ToUpdate, id: itemId2 },
      { command: 'Delete', id: itemId1 },
    ]

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 4) {
          expect(items).to.have.lengthOf(2)

          const item2 = items[0]
          expect(item2).to.be.an('object').that.has.all.keys('item', 'itemId')
          expect(item2.itemId).to.equal(itemId2)
          expect(item2.item).to.deep.equal(item2ToUpdate)

          const item3 = items[1]
          expect(item3).to.be.an('object').that.has.all.keys('item', 'itemId')
          expect(item3.itemId).to.equal(itemId3)
          expect(item3.item).to.deep.equal(item3ToInsert)
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)

    await this.test.userbase.insertItem(dbName, item1ToInsert, itemId1)
    await this.test.userbase.insertItem(dbName, item2ToInsert, itemId2)
    await this.test.userbase.transaction(dbName, operations)

    expect(spy.callCount).to.equal(4)
  })

  // must check the server logs to verify bundling occurs
  it('Bundle transaction log with a large Userbase transaction', async function () {
    const dbName = 'test-db'

    const BUNDLE_SIZE = 50 * 1024 // from src/userbase-server/ws.js

    const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
    const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
    expect(numItemsNeededToTriggerBundle).to.be.lte(10) // max operations allowed in tx

    const largeString = getStringOfByteLength(ITEM_SIZE)
    const operations = []
    for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
      operations.push({ command: 'Insert', item: largeString, id: i.toString() })
    }

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 2) {
          expect(items).to.have.lengthOf(numItemsNeededToTriggerBundle)

          for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
            const insertedItem = items[i]
            expect(insertedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

            const { item, itemId } = insertedItem
            expect(item).to.equal(largeString)
            expect(itemId).to.equal(i.toString())
          }
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await this.test.userbase.transaction(dbName, operations)

    expect(spy.callCount).to.equal(2)
  })

  // must check the server to verify reading bundle from S3 and not DDB
  it('Read from bundled transaction log', async function () {
    const dbName = 'test-db'

    const BUNDLE_SIZE = 50 * 1024 // from src/userbase-server/ws.js

    const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
    const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
    expect(numItemsNeededToTriggerBundle).to.be.lte(10) // max operations allowed in tx

    const largeString = getStringOfByteLength(ITEM_SIZE)
    const operations = []
    for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
      operations.push({ command: 'Insert', item: largeString, id: i.toString() })
    }

    await this.test.userbase.openDatabase(dbName, () => { })
    await this.test.userbase.transaction(dbName, operations)

    // give client sufficient time to finish the bundle
    const THREE_SECONDS = 3 * 1000
    await wait(THREE_SECONDS)

    await this.test.userbase.signOut()
    await this.test.userbase.signIn(this.test.username, this.test.password)

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 1) {
          expect(items).to.have.lengthOf(numItemsNeededToTriggerBundle)

          for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
            const insertedItem = items[i]
            expect(insertedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

            const { item, itemId } = insertedItem
            expect(item).to.equal(largeString)
            expect(itemId).to.equal(i.toString())
          }
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    expect(spy.callCount).to.equal(1)
  })

  // must check the server logs to verify bundling occurs
  it('Bundle transaction log with regular inserts', async function () {
    const dbName = 'test-db'

    const BUNDLE_SIZE = 50 * 1024 // from src/userbase-server/ws.js

    const ITEM_SIZE = 5 * 1024
    const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
    const largeString = getStringOfByteLength(ITEM_SIZE)

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 1 + numItemsNeededToTriggerBundle) {
          expect(items).to.have.lengthOf(numItemsNeededToTriggerBundle)

          for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
            const insertedItem = items[i]
            expect(insertedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

            const { item, itemId } = insertedItem
            expect(item).to.equal(largeString)
            expect(itemId).to.equal(i.toString())
          }
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)

    for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
      const item = largeString
      const itemId = i.toString()
      await this.test.userbase.insertItem(dbName, item, itemId)
    }

    expect(spy.callCount).to.equal(1 + numItemsNeededToTriggerBundle)
  })

  // must check the server logs to verify bundling occurs
  it('Read from bundled transaction log with regular inserts', async function () {
    const dbName = 'test-db'

    const BUNDLE_SIZE = 50 * 1024 // from src/userbase-server/ws.js

    const ITEM_SIZE = 5 * 1024
    const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
    const largeString = getStringOfByteLength(ITEM_SIZE)

    await this.test.userbase.openDatabase(dbName, () => { })

    for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
      const item = largeString
      const itemId = i.toString()
      await this.test.userbase.insertItem(dbName, item, itemId)
    }

    // give client sufficient time to finish the bundle
    const THREE_SECONDS = 3 * 1000
    await wait(THREE_SECONDS)

    await this.test.userbase.signOut()
    await this.test.userbase.signIn(this.test.username, this.test.password)

    const spyChangeHandler = {
      changeHandler: function (items) {
        if (spy.callCount === 1) {
          expect(items).to.have.lengthOf(numItemsNeededToTriggerBundle)

          for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
            const insertedItem = items[i]
            expect(insertedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

            const { item, itemId } = insertedItem
            expect(item).to.equal(largeString)
            expect(itemId).to.equal(i.toString())
          }
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)

    expect(spy.callCount).to.equal(1)
  })

  it('10 concurrent Inserts - Test A - State is correct after all inserts finish', async function () {
    const dbName = 'test-db'

    const numConcurrentOperations = 10
    const insertedItems = {}

    let succesfullyInsertedAllItems = false

    const spyChangeHandler = {
      changeHandler: function (items) {

        // items can all be inserted successfully before the change handler gets
        // called on the final insert because the server will send batches of
        // transactions to the client at a time. This test makes sure the client
        // has the expected state after all inserts finish

        if (items.length === numConcurrentOperations && !succesfullyInsertedAllItems) {
          for (let i = 0; i < numConcurrentOperations; i++) {
            const insertedItem = items[i]
            expect(insertedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

            const { item, itemId } = insertedItem
            expect(item).to.equal(itemId)

            // order of inserted items not guaranteed, but every insert should only be
            // inserted a single time
            expect(insertedItems[itemId]).to.be.false
            insertedItems[itemId] = true
          }

          for (let insertedItem of Object.values(insertedItems)) {
            expect(insertedItem).to.be.true
          }

          succesfullyInsertedAllItems = true
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)

    const inserts = []
    for (let i = 0; i < numConcurrentOperations; i++) {
      const item = i.toString()
      const itemId = item
      insertedItems[itemId] = false
      inserts.push(this.test.userbase.insertItem(dbName, item, itemId))
    }
    await Promise.all(inserts)

    expect(spy.callCount).to.be.lte(1 + numConcurrentOperations)
    expect(succesfullyInsertedAllItems).to.be.true
  })

  it('10 concurrent Inserts - Test B - State is correct after change handler is called for all inserts', async function () {
    const dbName = 'test-db'

    const numConcurrentOperations = 10
    const insertedItems = {}

    let spyChangeHandler

    // All inserts can return successfully before final insert calls change handler. However,
    // we are sure the final insert WILL call the change handler. This promise makes sure
    // the state is what's expected after the change handler is called for ALL inserts
    const finalInsertCalledChangeHandler = new Promise((resolve, reject) => {
      spyChangeHandler = {
        changeHandler: function (items) {
          if (spy.callCount === 1 + numConcurrentOperations) {
            expect(items).to.have.lengthOf(numConcurrentOperations)

            for (let i = 0; i < numConcurrentOperations; i++) {
              const insertedItem = items[i]
              expect(insertedItem).to.be.an('object').that.has.all.keys('item', 'itemId')

              const { item, itemId } = insertedItem
              expect(item).to.equal(itemId)

              // order of inserted items not guaranteed, but every insert should only be
              // inserted a single time
              expect(insertedItems[itemId]).to.be.false
              insertedItems[itemId] = true
            }

            for (let insertedItem of Object.values(insertedItems)) {
              expect(insertedItem).to.be.true
            }

            resolve()
          }
        }
      }

      const TEN_SECONDS = 10 * 1000
      setTimeout(() => reject('Timeout waiting for final insert'), TEN_SECONDS)
    })
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await this.test.userbase.openDatabase(dbName, spyChangeHandler.changeHandler)

    const inserts = []
    for (let i = 0; i < numConcurrentOperations; i++) {
      const item = i.toString()
      const itemId = item
      insertedItems[itemId] = false
      inserts.push(this.test.userbase.insertItem(dbName, item, itemId))
    }
    await Promise.all(inserts)

    await finalInsertCalledChangeHandler

    expect(spy.callCount).to.be.equal(1 + numConcurrentOperations)
  })

})
