import { getRandomString, getStringOfByteLength, wait } from '../../support/utils'

const beforeEachHook = function () {
  cy.visit('./cypress/integration/index.html').then(async function (win) {
    expect(win).to.have.property('userbase')
    this.currentTest.win = win
    const userbase = win.userbase
    this.currentTest.userbase = userbase

    const { appId, endpoint } = Cypress.env()
    win._userbaseEndpoint = endpoint
    userbase.init({ appId })

    const randomUser = 'test-user-' + getRandomString()
    const password = getRandomString()
    const rememberMe = 'none'

    await userbase.signUp({
      username: randomUser,
      password,
      rememberMe
    })

    this.currentTest.username = randomUser
    this.currentTest.password = password
  })
}

describe('DB Correctness Tests', function () {
  const databaseName = 'test-db'

  describe('Insert/Update/Delete/Transaction', function () {

    describe('Synchronous Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Insert 1 Item', async function () {
        const itemToInsert = {
          key1: 'Test',
          key2: 123
        }

        let successful
        let changeHandlerCallCount = 0

        const changeHandler = function (items, changedItems) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 2) {
            expect(items, 'items array to have correct length').to.have.lengthOf(1)
            expect(changedItems, 'changedItems is same as items').to.deep.equal(items)

            const insertedItem = items[0]
            expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

            const { item, itemId } = insertedItem
            expect(item, 'item in items array passed to changeHandler').to.deep.equal(itemToInsert)
            expect(itemId, 'item ID of item in items array passed to changeHandler').to.be.a('string')

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: itemToInsert })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('Insert 1 Item with Item ID provided', async function () {
        const testItemId = 'test-id'
        const itemToInsert = {
          key1: 'Test',
          key2: 123
        }

        let successful
        let changeHandlerCallCount = 0

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 2) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(1)

            const insertedItem = items[0]
            expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

            const { item, itemId } = insertedItem
            expect(item, 'item in items array passed to changeHandler').to.deep.equal(itemToInsert)
            expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(testItemId)

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: itemToInsert, itemId: testItemId })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('Update 1 Item', async function () {
        const testItemId = 'test-id'
        const itemToInsert = {
          key1: 'Test',
          key2: 123
        }

        const itemToUpdate = {
          updatedKey: 'TestTest',
          updatedKey2: 456
        }

        let successful
        let changeHandlerCallCount = 0

        const changeHandler = function (items, changedItems) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 3) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(1)
            expect(changedItems, 'changedItems array passed to changeHandler').to.have.lengthOf(1)

            const updatedItem = items[0]
            expect(updatedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy', 'updatedBy')
            expect(changedItems[0], 'changed item to equal the item').to.be.an('object').that.deep.equals(updatedItem)

            const { item, itemId } = updatedItem
            expect(item, 'item in items array passed to changeHandler').to.deep.equal(itemToUpdate)
            expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(testItemId)

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: itemToInsert, itemId: testItemId })
        await this.test.userbase.updateItem({ databaseName, item: itemToUpdate, itemId: testItemId })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(3)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('Delete 1 Item', async function () {
        const testItemId = 'test-id'
        const itemToInsert = {
          key1: 'Test',
          key2: 123
        }

        let successful
        let changeHandlerCallCount = 0

        const changeHandler = function (items, changedItems) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 3) {
            expect(items, 'array passed to changeHandler').to.be.empty
            expect(changedItems, "changedItems to be an empty array").to.eql([]);
            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: itemToInsert, itemId: testItemId })
        await this.test.userbase.deleteItem({ databaseName, itemId: testItemId })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(3)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('Inserting a duplicate item should fail', async function () {
        const testItemId = 'test-id'
        const itemToInsert = {
          key1: 'Test',
          key2: 123
        }

        const duplicateItem = {
          failKey1: 'Fail'
        }

        let successful
        let changeHandlerCallCount = 0

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 2) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(1)

            const insertedItem = items[0]
            expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

            const { item, itemId } = insertedItem
            expect(item, 'item in items array passed to changeHandler').to.deep.equal(itemToInsert)
            expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(testItemId)

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: itemToInsert, itemId: testItemId })

        try {
          await this.test.userbase.insertItem({ databaseName, item: duplicateItem, itemId: testItemId })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ItemAlreadyExists')
          expect(e.message, 'error message').to.be.equal('Item with the same id already exists.')
          expect(e.status, 'error status').to.be.equal(409)
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('Updating & Deleting a non-existent item should fail', async function () {
        const testItemId = 'test-id'
        const itemToFailUpdate = {
          failKey1: 'Fail'
        }

        let changeHandlerCallCount = 0
        const changeHandler = function () {
          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        try {
          await this.test.userbase.updateItem({ databaseName, item: itemToFailUpdate, itemId: testItemId })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ItemDoesNotExist')
          expect(e.message, 'error message').to.be.equal('Item with the provided id does not exist.')
          expect(e.status, 'error status').to.be.equal(404)
        }

        expect(changeHandlerCallCount, 'changeHandler is not called if item does not exist').to.equal(1)

        try {
          await this.test.userbase.deleteItem({ databaseName, itemId: testItemId })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ItemDoesNotExist')
          expect(e.message, 'error message').to.be.equal('Item with the provided id does not exist.')
          expect(e.status, 'error status').to.be.equal(404)
        }

        expect(changeHandlerCallCount, 'changeHandler is not called if item does not exist').to.equal(1)

        await this.test.userbase.deleteUser()
      })

      it('Updating & Deleting a deleted item should fail', async function () {
        const testItemId = 'test-id'
        const itemToInsert = {
          key1: 'Test',
          key2: 123
        }

        const itemToFailUpdate = {
          failKey1: 'Fail'
        }

        let changeHandlerCallCount = 0
        const changeHandler = function () {
          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: itemToInsert, itemId: testItemId })
        await this.test.userbase.deleteItem({ databaseName, itemId: testItemId })

        try {
          await this.test.userbase.updateItem({ databaseName, item: itemToFailUpdate, itemId: testItemId })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ItemDoesNotExist')
          expect(e.message, 'error message').to.be.equal('Item with the provided id does not exist.')
          expect(e.status, 'error status').to.be.equal(404)
        }

        expect(changeHandlerCallCount, 'changeHandler is not called if item does not exist').to.equal(3)

        try {
          await this.test.userbase.deleteItem({ databaseName, itemId: testItemId })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ItemDoesNotExist')
          expect(e.message, 'error message').to.be.equal('Item with the provided id does not exist.')
          expect(e.status, 'error status').to.be.equal(404)
        }

        expect(changeHandlerCallCount, 'changeHandler is not called if item does not exist').to.equal(3)

        await this.test.userbase.deleteUser()
      })

      it('Insert the same item after deleting the item', async function () {
        const testItemId = 'test-id'
        const itemToInsert = {
          key1: 'Test',
          key2: 123
        }

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 4) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(1)

            const insertedItem = items[0]
            expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

            const { item, itemId } = insertedItem
            expect(item, 'item in items array passed to changeHandler').to.deep.equal(itemToInsert)
            expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(testItemId)

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: itemToInsert, itemId: testItemId })
        await this.test.userbase.deleteItem({ databaseName, itemId: testItemId })
        await this.test.userbase.insertItem({ databaseName, item: itemToInsert, itemId: testItemId })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(4)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('3 sequential Inserts, then 3 sequential Updates, then 3 sequential Deletes', async function () {
        const numSequentialOperations = 3

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 1 + numSequentialOperations) {
            // all inserts are complete

            expect(items, 'array passed to changeHandler').to.have.lengthOf(numSequentialOperations)

            for (let i = 0; i < numSequentialOperations; i++) {
              const insertedItem = items[i]
              expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

              const { item, itemId } = insertedItem
              expect(item, 'item in items array passed to changeHandler').to.equal(i.toString())
              expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(i.toString())
            }
          } else if (changeHandlerCallCount === 1 + (numSequentialOperations * 2)) {
            // all updates are complete

            expect(items, 'array passed to changeHandler').to.have.lengthOf(numSequentialOperations)

            for (let i = 0; i < numSequentialOperations; i++) {
              const insertedItem = items[i]
              expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy', 'updatedBy')

              const { item, itemId } = insertedItem
              expect(item, 'item in items array passed to changeHandler').to.equal((i + numSequentialOperations).toString())
              expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(i.toString())
            }
          } else if (changeHandlerCallCount === 1 + (numSequentialOperations * 3)) {
            // all deletes are complete
            expect(items, 'array passed to changeHandler').to.be.empty
            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        for (let i = 0; i < numSequentialOperations; i++) {
          const item = i.toString()
          const itemId = item
          await this.test.userbase.insertItem({ databaseName, item, itemId })
        }

        for (let i = 0; i < numSequentialOperations; i++) {
          const item = (i + numSequentialOperations).toString()
          const itemId = i.toString()
          await this.test.userbase.updateItem({ databaseName, item, itemId })
        }

        for (let i = 0; i < numSequentialOperations; i++) {
          const itemId = i.toString()
          await this.test.userbase.deleteItem({ databaseName, itemId })
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1 + (numSequentialOperations * 3))
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('Insert large item', async function () {
        const NINE_KB = 9 * 1024
        const largeString = getStringOfByteLength(NINE_KB)

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 2) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(1)

            const insertedItem = items[0]
            expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

            const { item, itemId } = insertedItem
            expect(item, 'item in items array passed to changeHandler').to.equal(largeString)
            expect(itemId, 'item ID of item in items array passed to changeHandler').to.be.a('string')

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: largeString })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('Insert large item, then insert small item', async function () {
        const NINE_KB = 9 * 1024
        const largeString = getStringOfByteLength(NINE_KB)

        const smallItem = {
          testKey: 'test'
        }

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 3) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(2)

            const insertedLargeItem = items[0]
            expect(insertedLargeItem, 'large item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')
            expect(insertedLargeItem.item, 'large item in items array passed to changeHandler').to.equal(largeString)
            expect(insertedLargeItem.itemId, 'item ID of large item in items array passed to changeHandler').to.be.a('string')

            const insertedSmallItem = items[1]
            expect(insertedSmallItem, 'small item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')
            expect(insertedSmallItem.item, 'small item in items array passed to changeHandler').to.deep.equal(smallItem)
            expect(insertedSmallItem.itemId, 'item ID of small item in items array passed to changeHandler').to.be.a('string')
            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: largeString })
        await this.test.userbase.insertItem({ databaseName, item: smallItem })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(3)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('Insert 1 Item in a transaction', async function () {
        const itemToInsert = {
          key1: 'Test',
          key2: 123
        }

        const operations = [
          { command: 'Insert', item: itemToInsert }
        ]

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 2) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(1)

            const insertedItem = items[0]
            expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

            const { item, itemId } = insertedItem
            expect(item, 'item in items array passed to changeHandler').to.deep.equal(itemToInsert)
            expect(itemId, 'item ID of item in items array passed to changeHandler').to.be.a('string')

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.putTransaction({ databaseName, operations })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('Insert 10 Items in a transaction', async function () {
        const NUM_ITEMS = 10

        const operations = []
        for (let i = 0; i < NUM_ITEMS; i++) {
          const item = i.toString()
          const itemId = item
          operations.push({ command: 'Insert', item, itemId })
        }

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items, changedItems) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 2) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(NUM_ITEMS)
            expect(changedItems, 'changedItems array passed to changeHandler').to.have.length(NUM_ITEMS)

            for (let i = 0; i < NUM_ITEMS; i++) {
              const insertedItem = items[i]
              expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

              const { item, itemId } = insertedItem
              expect(item, 'item in items array passed to changeHandler').to.equal(i.toString())
              expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(i.toString())
            }

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.putTransaction({ databaseName, operations })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('Update 10 Items in a transaction', async function () {
        const NUM_ITEMS = 10

        const insertOperations = []
        for (let i = 0; i < NUM_ITEMS; i++) {
          const item = i.toString()
          const itemId = item
          insertOperations.push({ command: 'Insert', item, itemId })
        }

        const updateOperations = []
        for (let i = 0; i < NUM_ITEMS; i++) {
          const item = (i + NUM_ITEMS).toString()
          const itemId = i.toString()
          updateOperations.push({ command: 'Update', item, itemId })
        }

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items, changedItems) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 3) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(NUM_ITEMS)
            expect(changedItems, "changedItems array passed to changeHandler").to.have.length(NUM_ITEMS)

            for (let i = 0; i < NUM_ITEMS; i++) {
              const updatedItem = items[i]
              expect(updatedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy', 'updatedBy')

              const { item, itemId } = updatedItem
              expect(item, 'item in items array passed to changeHandler').to.equal((i + NUM_ITEMS).toString())
              expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(i.toString())
            }

            successful = true
          }
        }
        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.putTransaction({ databaseName, operations: insertOperations })
        await this.test.userbase.putTransaction({ databaseName, operations: updateOperations })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(3)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('10 Inserts in a transaction, then 10 Updates in a transaction, then 5 Deletes in a transaction', async function () {
        const NUM_ITEMS = 10
        const NUM_DELETES = 5
        expect(NUM_DELETES).to.be.lessThan(NUM_ITEMS)

        const insertOperations = []
        for (let i = 0; i < NUM_ITEMS; i++) {
          const item = i.toString()
          const itemId = item
          insertOperations.push({ command: 'Insert', item, itemId })
        }

        const updateOperations = []
        for (let i = 0; i < NUM_ITEMS; i++) {
          const item = (i + NUM_ITEMS).toString()
          const itemId = i.toString()
          updateOperations.push({ command: 'Update', item, itemId })
        }

        const deleteOperations = []
        for (let i = 0; i < NUM_DELETES; i++) {
          const itemId = i.toString()
          deleteOperations.push({ command: 'Delete', itemId })
        }

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 4) {
            const totalItemsExpected = NUM_ITEMS - NUM_DELETES
            expect(items, 'array passed to changeHandler').to.have.lengthOf(totalItemsExpected)

            for (let i = 0; i < totalItemsExpected; i++) {
              const actualItem = items[i]
              expect(actualItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy', 'updatedBy')

              const { item, itemId } = actualItem
              expect(item, 'item in items array passed to changeHandler').to.equal((i + NUM_ITEMS + NUM_DELETES).toString())
              expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal((i + NUM_DELETES).toString())
            }

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        await this.test.userbase.putTransaction({ databaseName, operations: insertOperations })
        await this.test.userbase.putTransaction({ databaseName, operations: updateOperations })
        await this.test.userbase.putTransaction({ databaseName, operations: deleteOperations })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(4)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('2 sequential Inserts, then transaction with 1 Insert, 1 Update, and 1 Delete', async function () {
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
          { command: 'Insert', item: item3ToInsert, itemId: itemId3 },
          { command: 'Update', item: item2ToUpdate, itemId: itemId2 },
          { command: 'Delete', itemId: itemId1 },
        ]

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 4) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(2)

            const item2 = items[0]
            expect(item2, 'item 2 in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy', 'updatedBy')
            expect(item2.itemId, 'item ID of item 2 in items array passed to changeHandler').to.equal(itemId2)
            expect(item2.item, 'item 2 in items array passed to changeHandler').to.deep.equal(item2ToUpdate)

            const item3 = items[1]
            expect(item3, 'item 3 in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')
            expect(item3.itemId, 'item ID of item 3 in items array passed to changeHandler').to.equal(itemId3)
            expect(item3.item, 'item 3 in items array passed to changeHandler').to.deep.equal(item3ToInsert)

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        await this.test.userbase.insertItem({ databaseName, item: item1ToInsert, itemId: itemId1 })
        await this.test.userbase.insertItem({ databaseName, item: item2ToInsert, itemId: itemId2 })
        await this.test.userbase.putTransaction({ databaseName, operations })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(4)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('Multiple inserts combined with multiple calls to open database with the same name', async function () {
        let changeHandler1CallCount = 0
        let changeHandler2CallCount = 0

        let success

        const changeHandler1 = function (items) {
          changeHandler1CallCount += 1

          if (changeHandler1CallCount === 2) {
            expect(items).to.have.lengthOf(1)
            expect(items[0].item === 'test1')
          }
        }

        const changeHandler2 = function (items) {
          changeHandler2CallCount += 1

          if (changeHandler2CallCount === 1) {
            expect(items).to.have.lengthOf(1)
            expect(items[0].item === 'test1')
          }

          if (changeHandler2CallCount === 2) {
            expect(items).to.have.lengthOf(2)
            expect(items[0].item === 'test1')
            expect(items[1].item === 'test2')
            success = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler: changeHandler1 })

        await this.test.userbase.insertItem({ databaseName, item: 'test1' })
        await this.test.userbase.openDatabase({ databaseName, changeHandler: changeHandler2 })

        await this.test.userbase.insertItem({ databaseName, item: 'test2' })

        expect(changeHandler1CallCount, 'changeHandler 1 called correct number of times').to.equal(2)
        expect(changeHandler2CallCount, 'changeHandler 2 called correct number of times').to.equal(2)
        expect(success, 'database reached successful state').to.be.true
        
        await this.test.userbase.deleteUser()
      })

    })

    describe('Concurrency Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('100 concurrent Inserts', async function () {
        const numConcurrentOperations = 100
        const insertedItems = {}

        let changeHandlerCallCount = 0
        let successful

        let latestState
        let correctState

        const changeHandler = function (items) {
          changeHandlerCallCount += 1
          latestState = items

          if (items.length === numConcurrentOperations && !successful) {
            for (let i = 0; i < numConcurrentOperations; i++) {
              const insertedItem = items[i]
              expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

              const { item, itemId } = insertedItem
              expect(item, 'item in items array passed to changeHandler').to.equal(itemId)

              // order of inserted items not guaranteed, but every insert should only be
              // inserted a single time
              expect(insertedItems[itemId], 'item status before insert confirmed').to.be.false
              insertedItems[itemId] = true
            }

            for (let insertedItem of Object.values(insertedItems)) {
              expect(insertedItem, 'item status after insert confirmed').to.be.true
            }

            successful = true
            correctState = items
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        const inserts = []
        for (let i = 0; i < numConcurrentOperations; i++) {
          const item = i.toString()
          const itemId = item
          insertedItems[itemId] = false
          inserts.push(this.test.userbase.insertItem({ databaseName, item, itemId }))
        }
        await Promise.all(inserts)

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(1 + numConcurrentOperations)
        expect(successful, 'successful state').to.be.true

        // give client time to process all inserts, then make sure state is still correct
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        expect(latestState, 'successful state after waiting').to.deep.equal(correctState)
      })

      it('90 concurrent Inserts, then 90 concurrent Updates', async function () {
        const numConcurrentOperations = 90
        expect(numConcurrentOperations % 2).to.be.equal(0)

        const accumulatedUpdatedItems = {}
        let accumulatorChecked

        const updatedItems = {}

        let changeHandlerCallCount = 0
        let successfulyInsertedAllItems

        let latestState

        const undefinedExpectations = []

        const changeHandler = function (items) {
          changeHandlerCallCount += 1
          latestState = items

          if (successfulyInsertedAllItems) {
            for (let i = 0; i < items.length; i++) {
              const thisItem = items[i]
              const { itemId, item } = thisItem

              if (Number(item) === Number(itemId) + numConcurrentOperations) {
                accumulatedUpdatedItems[itemId] = itemId
              } else {
                // move expect() out of changeHandler so that cypress doesn't trigger userbase-js timeout painting DOM with expects
                undefinedExpectations.push([accumulatedUpdatedItems[itemId], 'Updated item should not have reverted to old state'])
              }
            }

            accumulatorChecked = true
          }
        }

        // Set up the test
        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        const inserts = []
        for (let i = 0; i < numConcurrentOperations; i++) {
          const item = i.toString()
          const itemId = item
          inserts.push(this.test.userbase.insertItem({ databaseName, item, itemId }))
        }
        await Promise.all(inserts)

        successfulyInsertedAllItems = true

        const updates = []
        for (let i = 0; i < numConcurrentOperations; i++) {
          const item = (i + numConcurrentOperations).toString()
          const itemId = i.toString()
          updatedItems[itemId] = false
          updates.push(this.test.userbase.updateItem({ databaseName, item, itemId }))
        }
        await Promise.all(updates)

        // Assertions
        expect(latestState).to.have.lengthOf(numConcurrentOperations)

        for (let i = 0; i < numConcurrentOperations; i++) {
          const insertedItem = latestState[i]
          const { item, itemId } = insertedItem
          expect(Number(item), 'item in items array passed to changeHandler').to.equal(Number(itemId) + numConcurrentOperations)

          expect(updatedItems[itemId], 'item status before update confirmed').to.be.false
          updatedItems[itemId] = true
        }

        for (let updatedItem of Object.values(updatedItems)) {
          expect(updatedItem, 'item status after update confirmed').to.be.true
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(1 + (numConcurrentOperations * 2))

        const correctState = latestState

        // give client time to process all transactions, then make sure state is still correct
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        expect(latestState, 'successful state after waiting').to.deep.equal(correctState)
        expect(accumulatorChecked, 'accumulator was checked at least once').to.be.true

        for (let i = 0; i < undefinedExpectations.length; i++) {
          const expectation = undefinedExpectations[i][0]
          if (expectation !== undefined) expect(undefinedExpectations[i][0], undefinedExpectations[i][1]).to.be.undefined
        }
      })

      it('90 concurrent Inserts, then 90 concurrent Deletes', async function () {
        const numConcurrentOperations = 90
        expect(numConcurrentOperations % 2).to.be.equal(0)

        const accumulatedDeletedItems = {}
        let accumulatorChecked

        let changeHandlerCallCount = 0
        let successfulyInsertedAllItems

        let latestState

        const undefinedExpectations = []

        const changeHandler = function (items) {
          changeHandlerCallCount += 1
          latestState = items

          if (successfulyInsertedAllItems) {

            // will keep track of items that have been deleted from this batch
            const itemsDeletedInThisState = {}
            for (let i = 0; i < numConcurrentOperations; i++) {
              itemsDeletedInThisState[i.toString()] = true
            }

            for (let i = 0; i < items.length; i++) {
              const thisItem = items[i]

              // move expect() out of changeHandler so that cypress doesn't trigger userbase-js timeout painting DOM with expects
              undefinedExpectations.push([accumulatedDeletedItems[thisItem.itemId], 'Deleted item should not have reverted to old state'])
              itemsDeletedInThisState[thisItem.itemId] = false
            }

            for (let i = 0; i < numConcurrentOperations; i++) {
              const itemId = i.toString()

              // if it's still true, it must have been deleted in this state
              if (itemsDeletedInThisState[itemId]) {
                accumulatedDeletedItems[itemId] = itemId
              }
            }

            accumulatorChecked = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        const inserts = []
        for (let i = 0; i < numConcurrentOperations; i++) {
          const item = i.toString()
          const itemId = item
          inserts.push(this.test.userbase.insertItem({ databaseName, item, itemId }))
        }
        await Promise.all(inserts)

        successfulyInsertedAllItems = true

        const deletes = []
        for (let i = 0; i < numConcurrentOperations; i++) {
          const itemId = i.toString()
          deletes.push(this.test.userbase.deleteItem({ databaseName, itemId }))
        }
        await Promise.all(deletes)

        expect(latestState).to.have.lengthOf(0)
        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(1 + (numConcurrentOperations * 2))

        const correctState = latestState

        // give client time to process all transactions, then make sure state is still correct
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        expect(latestState, 'successful state after waiting').to.deep.equal(correctState)
        expect(accumulatorChecked, 'accumulator was checked at least once').to.be.true

        console.log(undefinedExpectations.length)

        for (let i = 0; i < undefinedExpectations.length; i++) {
          const expectation = undefinedExpectations[i][0]
          if (expectation !== undefined) expect(undefinedExpectations[i][0], undefinedExpectations[i][1]).to.be.undefined
        }
      })

      it('90 concurrent Inserts, then concurrent 45 Updates & 45 Deletes', async function () {
        const numConcurrentOperations = 90
        expect(numConcurrentOperations % 2).to.be.equal(0)

        const numUpdates = numConcurrentOperations / 2

        const accumulatedUpdatedItems = {}
        const accumulatedDeletedItems = {}
        let accumulatorChecked

        const updatedItems = {}

        let changeHandlerCallCount = 0
        let successfulyInsertedAllItems

        let latestState

        const undefinedExpectations = []

        const changeHandler = function (items) {
          changeHandlerCallCount += 1
          latestState = items

          if (successfulyInsertedAllItems) {

            // will keep track of items that have been deleted from this batch
            const itemsDeletedInThisState = {}
            for (let i = numUpdates; i < numConcurrentOperations; i++) {
              itemsDeletedInThisState[i.toString()] = true
            }

            for (let i = 0; i < items.length; i++) {
              const thisItem = items[i]
              const { item, itemId } = thisItem

              if (Number(item) === Number(itemId) + numConcurrentOperations) {
                accumulatedUpdatedItems[itemId] = itemId
              } else {
                undefinedExpectations.push([accumulatedUpdatedItems[itemId], 'Updated item should not have reverted to old state'])
              }

              if (Number(itemId) >= numUpdates) {
                undefinedExpectations.push([accumulatedUpdatedItems[itemId], 'Deleted item should not have reverted to old state'])
                itemsDeletedInThisState[itemId] = false
              }
            }

            for (let i = numUpdates; i < numConcurrentOperations; i++) {
              const itemId = i.toString()

              // if it's still true, it must have been deleted in this state
              if (itemsDeletedInThisState[itemId]) {
                accumulatedDeletedItems[itemId] = itemId
              }
            }

            accumulatorChecked = true
          }
        }

        // Set up test
        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        const inserts = []
        for (let i = 0; i < numConcurrentOperations; i++) {
          const item = i.toString()
          const itemId = item
          inserts.push(this.test.userbase.insertItem({ databaseName, item, itemId }))
        }
        await Promise.all(inserts)

        successfulyInsertedAllItems = true

        const updatesAndDeletes = []
        for (let i = 0; i < numUpdates; i++) {
          const item = (i + numConcurrentOperations).toString()
          const itemId = i.toString()
          updatedItems[itemId] = false
          updatesAndDeletes.push(this.test.userbase.updateItem({ databaseName, item, itemId }))
        }

        for (let i = numUpdates; i < numConcurrentOperations; i++) {
          const itemId = i.toString()
          updatesAndDeletes.push(this.test.userbase.deleteItem({ databaseName, itemId }))
        }
        await Promise.all(updatesAndDeletes)

        // Assertions
        expect(latestState).to.have.lengthOf(numUpdates)

        for (let i = 0; i < numUpdates; i++) {
          const insertedItem = latestState[i]
          const { item, itemId } = insertedItem
          expect(Number(item), 'item in items array passed to changeHandler').to.equal(Number(itemId) + numConcurrentOperations)

          expect(updatedItems[itemId], 'item status before update confirmed').to.be.false
          updatedItems[itemId] = true
        }

        for (let updatedItem of Object.values(updatedItems)) {
          expect(updatedItem, 'item status after update confirmed').to.be.true
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(1 + (numConcurrentOperations * 2))

        const correctState = latestState

        // give client time to process all transactions, then make sure state is still correct
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        expect(latestState, 'successful state after waiting').to.deep.equal(correctState)
        expect(accumulatorChecked, 'accumulator was checked at least once').to.be.true

        console.log(undefinedExpectations.length)
        for (let i = 0; i < undefinedExpectations.length; i++) {
          const expectation = undefinedExpectations[i][0]
          if (expectation !== undefined) expect(undefinedExpectations[i][0], undefinedExpectations[i][1]).to.be.undefined
        }
      })

      it('100 concurrent Inserts with same Item ID', async function () {
        const numConcurrentOperations = 100

        const testItemId = 'test-id'

        let changeHandlerCallCount = 0
        let successful

        let latestState
        let correctState

        const successExpectations = []

        const changeHandler = function (items) {
          changeHandlerCallCount += 1
          latestState = items

          if (items.length === 1 && !successful) {
            const insertedItem = items[0]
            expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

            const { item, itemId } = insertedItem
            expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(testItemId)
            expect(Number(item), 'item in items array passed to changeHandler').to.be.within(0, numConcurrentOperations - 1)

            successful = true
            correctState = items
          } else if (successful) {
            successExpectations.push([
              JSON.parse(JSON.stringify(latestState)),
              'after successful insert, state remains constant',
              JSON.parse(JSON.stringify(correctState)),
            ])
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        let successCount = 0
        let failureCount = 0

        const inserts = []
        for (let i = 0; i < numConcurrentOperations; i++) {
          const item = i.toString()

          const insert = async () => {
            try {
              await this.test.userbase.insertItem({ databaseName, item, itemId: testItemId })
              successCount += 1
            } catch (e) {
              expect(e.name, 'error name').to.be.equal('ItemAlreadyExists')
              expect(e.message, 'error message').to.be.equal('Item with the same id already exists.')
              expect(e.status, 'error status').to.be.equal(409)
              failureCount += 1
            }
          }
          inserts.push(insert())
        }

        await Promise.all(inserts)

        expect(successCount, 'success count').to.equal(1)
        expect(failureCount, 'failure count').to.equal(numConcurrentOperations - 1)

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(1 + numConcurrentOperations)
        expect(successful, 'successful state').to.be.true

        // give client time to process all transactions, then make sure state is still correct
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        expect(latestState, 'successful state after waiting').to.deep.equal(correctState)

        for (let i = 0; i < successExpectations.length; i++) {
          const expectation = successExpectations[i]
          expect(expecation[0], expectation[1]).to.deep.equal(expectation[2])
        }
      })

      it('30 concurrent Inserts across 6 open databases', async function () {
        const numConcurrentOperations = 30
        const insertedItems = {}

        const numOpenDatabases = 6

        let changeHandlerCallCounts = []
        changeHandlerCallCounts.length = numOpenDatabases
        changeHandlerCallCounts.fill(0)

        let successfuls = []

        let latestStates = []
        let correctStates = []

        const openDatabases = []
        for (let i = 0; i < numOpenDatabases; i++) {
          const changeHandler = function (items) {
            changeHandlerCallCounts[i] += 1
            latestStates[i] = items

            if (items.length === numConcurrentOperations && !successfuls[i]) {

              for (let j = 0; j < numConcurrentOperations; j++) {
                const insertedItem = items[j]

                const { itemId } = insertedItem

                // order of inserted items not guaranteed, but every insert should only be
                // inserted a single time
                expect(insertedItems[i][itemId], 'item status before insert confirmed').to.be.false
                insertedItems[i][itemId] = true
              }

              for (let insertedItem of Object.values(insertedItems[i])) {
                expect(insertedItem, 'item status after insert confirmed').to.be.true
              }

              successfuls[i] = true
              correctStates[i] = items
            }
          }

          openDatabases.push(this.test.userbase.openDatabase({ databaseName: databaseName + i, changeHandler }))
        }
        await Promise.all(openDatabases)

        const inserts = []
        for (let i = 0; i < numOpenDatabases; i++) {
          insertedItems[i] = {}

          for (let j = 0; j < numConcurrentOperations; j++) {
            const item = `${i} ${j}`
            const itemId = item
            insertedItems[i][itemId] = false
            inserts.push(this.test.userbase.insertItem({ databaseName: databaseName + i, item, itemId }))
          }
        }
        await Promise.all(inserts)

        for (let i = 0; i < numOpenDatabases; i++) {
          expect(changeHandlerCallCounts[i], 'changeHandler called correct number of times').to.be.lte(1 + numConcurrentOperations)
          expect(successfuls[i], 'successful state').to.be.true
        }

        // give client time to process all inserts, then make sure state is still correct
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        for (let i = 0; i < numOpenDatabases; i++) {
          expect(latestStates[i], 'successful state after waiting').to.deep.equal(correctStates[i])
        }

      })

      it('2 concurrent Updates on same item', async function () {
        const testItemId = 'test-id'
        const itemToInsert = {
          key1: 'Test',
          key2: 123
        }

        const update1 = {
          updatedKey: 'TestTest',
        }

        const update2 = {
          updatedKey2: 456
        }

        let changeHandlerCallCount = 0
        let successful

        let latestState
        let correctState

        const changeHandler = function (items) {
          changeHandlerCallCount += 1
          latestState = items

          if (changeHandlerCallCount > 2 && !successful) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(1)

            const updatedItem = items[0]
            expect(updatedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy', 'updatedBy')

            const { item, itemId } = updatedItem
            expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(testItemId)

            if (Object.prototype.hasOwnProperty.call(item, 'updatedKey')) {
              expect(item, 'item in items array passed to changeHandler').to.deep.equal(update1)
            } else {
              expect(item, 'item in items array passed to changeHandler').to.deep.equal(update2)
            }

            successful = true
            correctState = items
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: itemToInsert, itemId: testItemId })

        try {
          await Promise.all([
            this.test.userbase.updateItem({ databaseName, item: update1, itemId: testItemId }),
            this.test.userbase.updateItem({ databaseName, item: update2, itemId: testItemId })
          ])
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemUpdateConflict')
          expect(e.message, 'error message').to.equal('Item update conflict.')
          expect(e.status, 'error status').to.equal(409)
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(4)
        expect(successful, 'successful state').to.be.true

        // give client time to process all transactions, then make sure state is still correct
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        expect(latestState, 'successful state after waiting').to.deep.equal(correctState)
      })

      it('Concurrent Update and Transaction on same item', async function () {
        const testItemId = 'test-id'
        const itemToInsert = {
          key1: 'Test',
          key2: 123
        }

        const update1 = {
          updatedKey: 'TestTest',
        }

        const update2 = {
          updatedKey2: 456
        }
        const operations = [
          { command: 'Update', item: update2, itemId: testItemId }
        ]

        let changeHandlerCallCount = 0
        let successful

        let latestState
        let correctState

        const changeHandler = function (items) {
          changeHandlerCallCount += 1
          latestState = items

          if (changeHandlerCallCount > 2 && !successful) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(1)

            const updatedItem = items[0]
            expect(updatedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy', 'updatedBy')

            const { item, itemId } = updatedItem
            expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(testItemId)

            if (Object.prototype.hasOwnProperty.call(item, 'updatedKey')) {
              expect(item, 'item in items array passed to changeHandler').to.deep.equal(update1)
            } else {
              expect(item, 'item in items array passed to changeHandler').to.deep.equal(update2)
            }

            successful = true
            correctState = items
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: itemToInsert, itemId: testItemId })

        try {
          await Promise.all([
            this.test.userbase.updateItem({ databaseName, item: update1, itemId: testItemId }),
            this.test.userbase.putTransaction({ databaseName, operations }),
          ])
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemUpdateConflict')
          expect(e.message, 'error message').to.equal('Item update conflict.')
          expect(e.status, 'error status').to.equal(409)
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(4)
        expect(successful, 'successful state').to.be.true

        // give client time to process all transactions, then make sure state is still correct
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        expect(latestState, 'successful state after waiting').to.deep.equal(correctState)
      })

      it('2 concurrent Deletes on same item', async function () {
        const testItemId = 'test-id'
        const itemToInsert = {
          key1: 'Test',
          key2: 123
        }

        let changeHandlerCallCount = 0
        let successful

        let latestState
        let correctState

        const changeHandler = function (items) {
          changeHandlerCallCount += 1
          latestState = items

          if (changeHandlerCallCount > 2 && !successful) {
            expect(items, 'array passed to changeHandler').to.be.empty
            successful = true
            correctState = items
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: itemToInsert, itemId: testItemId })

        try {
          await Promise.all([
            this.test.userbase.deleteItem({ databaseName, itemId: testItemId }),
            this.test.userbase.deleteItem({ databaseName, itemId: testItemId })
          ])
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ItemDoesNotExist')
          expect(e.message, 'error message').to.be.equal('Item with the provided id does not exist.')
          expect(e.status, 'error status').to.be.equal(404)
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(4)
        expect(successful, 'successful state').to.be.true

        // give client time to process all transactions, then make sure state is still correct
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        expect(latestState, 'successful state after waiting').to.deep.equal(correctState)
      })

      it('Concurrent Update and Delete on same item', async function () {
        const testItemId = 'test-id'
        const itemToInsert = {
          key1: 'Test',
          key2: 123
        }

        const update = {
          updatedKey: 'TestTest',
        }

        let winningTransaction
        let changeHandlerCallCount = 0
        let successful

        let latestState
        let correctState

        const changeHandler = function (items) {
          changeHandlerCallCount += 1
          latestState = items

          if (changeHandlerCallCount > 2 && !successful) {
            expect(items.length).to.be.oneOf([0, 1])
            winningTransaction = items.length ? 'Update' : 'Delete'

            if (winningTransaction === 'Update') {
              const updatedItem = items[0]
              expect(updatedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy', 'updatedBy')

              const { item, itemId } = updatedItem
              expect(item, 'item in items array passed to changeHandler').to.deep.equal(update)
              expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(testItemId)
            }

            successful = true
            correctState = items
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: itemToInsert, itemId: testItemId })

        try {
          await Promise.all([
            this.test.userbase.updateItem({ databaseName, item: update, itemId: testItemId }),
            this.test.userbase.deleteItem({ databaseName, itemId: testItemId })
          ])
          throw new Error('Should have failed')
        } catch (e) {
          if (e.message === 'Should have failed') throw e

          if (winningTransaction === 'Update') {
            expect(e.name, 'error name').to.equal('ItemUpdateConflict')
            expect(e.message, 'error message').to.equal('Item update conflict.')
            expect(e.status, 'error status').to.equal(409)
          } else if (winningTransaction === 'Delete') {
            expect(e.name, 'error name').to.be.equal('ItemDoesNotExist')
            expect(e.message, 'error message').to.be.equal('Item with the provided id does not exist.')
            expect(e.status, 'error status').to.be.equal(404)
          } else {
            throw new Error('Db handler not called')
          }
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(4)
        expect(successful, 'successful state').to.be.true

        // give client time to process all transactions, then make sure state is still correct
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        expect(latestState, 'successful state after waiting').to.deep.equal(correctState)
      })

      it('2 concurrent Inserts, 1 large item & 1 small item', async function () {
        const largeItemId = 'large-item'
        const NINE_KB = 9 * 1024
        const largeItem = getStringOfByteLength(NINE_KB)

        const smallItemId = 'small-item'
        const smallItem = { test: 'test' }

        let changeHandlerCallCount = 0
        let successful

        let latestState
        let correctState

        const changeHandler = function (items) {
          changeHandlerCallCount += 1
          latestState = items

          if (items.length === 2 && !successful) {
            const item1 = items[0]
            const item2 = items[1]

            expect(item1, 'item 1 in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')
            expect(item2, 'item 2 in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

            if (item1.itemId === largeItemId) {
              expect(item1.item, 'item 1 in items array passed to changeHandler').to.deep.equal(largeItem)

              expect(item2.itemId, 'item ID of item 2 in items array passed to changeHandler').to.equal(smallItemId)
              expect(item2.item, 'item 2 in items array passed to changeHandler').to.deep.equal(smallItem)
            } else {
              expect(item1.itemId, 'item ID of item 1 in items array passed to changeHandler').to.equal(smallItemId)
              expect(item1.item, 'item 1 in items array passed to changeHandler').to.deep.equal(smallItem)

              expect(item2.itemId, 'item ID of item 2 in items array passed to changeHandler').to.equal(largeItemId)
              expect(item2.item, 'item 2 in items array passed to changeHandler').to.deep.equal(largeItem)
            }

            successful = true
            correctState = items
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        await Promise.all([
          this.test.userbase.insertItem({ databaseName, item: largeItem, itemId: largeItemId }),
          this.test.userbase.insertItem({ databaseName, item: smallItem, itemId: smallItemId })
        ])

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(3)
        expect(successful, 'successful state').to.be.true

        // give client time to process all transactions, then make sure state is still correct
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        expect(latestState, 'successful state after waiting').to.deep.equal(correctState)
      })

      it('Concurrent Insert and Transaction', async function () {
        const insertItemId = 'insert-item'
        const insertItem = { test1: 'test1' }

        const transactionItem1Id = 'transaction-item1'
        const transactionItem1 = { test2: 'test2' }

        const transactionItem2Id = 'transaction-item2'
        const transactionItem2 = { test3: 'test3' }

        const operations = [
          { command: 'Insert', item: transactionItem1, itemId: transactionItem1Id },
          { command: 'Insert', item: transactionItem2, itemId: transactionItem2Id },
        ]

        let changeHandlerCallCount = 0
        let successful

        let latestState
        let correctState

        const changeHandler = function (items) {
          changeHandlerCallCount += 1
          latestState = items

          if (items.length === 3 && !successful) {
            const item1 = items[0]
            const item2 = items[1]
            const item3 = items[2]

            expect(item1, 'item 1 in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')
            expect(item2, 'item 2 in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')
            expect(item3, 'item 3 in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

            if (item1.itemId === insertItemId) {
              expect(item1.item, 'item 1 in items array passed to changeHandler').to.deep.equal(insertItem)

              expect(item2.itemId, 'item ID of item 2 in items array passed to changeHandler').to.equal(transactionItem1Id)
              expect(item2.item, 'item 2 in items array passed to changeHandler').to.deep.equal(transactionItem1)

              expect(item3.itemId, 'item ID of item 3 in items array passed to changeHandler').to.equal(transactionItem2Id)
              expect(item3.item, 'item 3 in items array passed to changeHandler').to.deep.equal(transactionItem2)
            } else {
              expect(item1.itemId, 'item ID of item 1 in items array passed to changeHandler').to.deep.equal(transactionItem1Id)
              expect(item1.item, 'item 1 in items array passed to changeHandler').to.deep.equal(transactionItem1)

              expect(item2.itemId, 'item ID of item 2 in items array passed to changeHandler').to.equal(transactionItem2Id)
              expect(item2.item, 'item 2 in items array passed to changeHandler').to.deep.equal(transactionItem2)

              expect(item3.itemId, 'item ID of item 3 in items array passed to changeHandler').to.equal(insertItemId)
              expect(item3.item, 'item 3 in items array passed to changeHandler').to.deep.equal(insertItem)
            }

            successful = true
            correctState = items
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        await Promise.all([
          this.test.userbase.insertItem({ databaseName, item: insertItem, itemId: insertItemId }),
          this.test.userbase.putTransaction({ databaseName, operations })
        ])

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(3)
        expect(successful, 'successful state').to.be.true

        // give client time to process all transactions, then make sure state is still correct
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        expect(latestState, 'successful state after waiting').to.deep.equal(correctState)
      })

      it('201 concurrent Inserts trigger rate limit', async function () {
        const numSuccessfulConcurrentOperations = 200
        const insertedItems = {}

        let changeHandlerCallCount = 0
        let successful

        let latestState
        let correctState

        const changeHandler = function (items) {
          changeHandlerCallCount += 1
          latestState = items

          if (items.length === numSuccessfulConcurrentOperations && !successful) {
            for (let i = 0; i < numSuccessfulConcurrentOperations; i++) {
              const insertedItem = items[i]
              const { itemId } = insertedItem

              expect(insertedItems[itemId].inState, 'item status before insert confirmed').to.be.undefined
              insertedItems[itemId].inState = true
            }

            successful = true
            correctState = items
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        // wait for ValidateKey and OpenDatabase to be finished to reset rate limiter
        await wait(2000)

        let errorCount = 0
        let failedItemId

        const inserts = []
        for (let i = 0; i < numSuccessfulConcurrentOperations + 1; i++) {
          const item = i.toString()
          const itemId = item
          insertedItems[itemId] = { successResponse: false }

          const insert = async () => {
            try {
              await this.test.userbase.insertItem({ databaseName, item, itemId })
              insertedItems[itemId].successResponse = true

            } catch (e) {
              expect(e.name, 'error name').to.be.equal('TooManyRequests')
              expect(e.message, 'error message').to.be.equal('Too many requests in a row. Please try again in 1 second.')
              expect(e.status, 'error status').to.be.equal(429)
              errorCount += 1
              failedItemId = itemId
            }
          }
          inserts.push(insert())
        }
        await Promise.all(inserts)

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(1 + numSuccessfulConcurrentOperations)
        expect(successful, 'successful state').to.be.true
        expect(errorCount, 'error count').to.equal(1)

        for (const insertedItemId of Object.keys(insertedItems)) {
          const insertedItem = insertedItems[insertedItemId]

          if (insertedItem.inState) {
            expect(insertedItem.successResponse, 'item status after insert finished').to.be.true
          } else {
            expect(failedItemId, 'failed item id is correct').to.equal(insertedItemId)
            expect(insertedItem.inState, 'failed item status in state after insert finished').to.be.undefined
            expect(insertedItem.successResponse, 'failed item status after insert finished').to.be.false
          }
        }

        // give client time to process all inserts, then make sure state is still correct
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        expect(latestState, 'successful state after waiting').to.deep.equal(correctState)
      })

      it('201 concurrent Inserts trigger rate limit, then wait 1 second and insert', async function () {
        const numSuccessfulConcurrentOperations = 200
        const insertedItems = {}

        let changeHandlerCallCount = 0
        let successful

        let latestState
        let correctState

        const changeHandler = function (items) {
          changeHandlerCallCount += 1
          latestState = items

          if (items.length === numSuccessfulConcurrentOperations + 1 && !successful) {
            for (let i = 0; i < numSuccessfulConcurrentOperations + 1; i++) {
              const insertedItem = items[i]
              const { itemId } = insertedItem

              expect(insertedItems[itemId].inState, 'item status before insert confirmed').to.be.undefined
              insertedItems[itemId].inState = true
            }

            successful = true
            correctState = items
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        // wait for ValidateKey and OpenDatabase to be finished to reset rate limiter
        await wait(2000)

        const inserts = []
        for (let i = 0; i < numSuccessfulConcurrentOperations + 1; i++) {
          const item = i.toString()
          const itemId = item
          insertedItems[itemId] = { successResponse: false }

          const insert = async () => {
            try {
              await this.test.userbase.insertItem({ databaseName, item, itemId })
              insertedItems[itemId].successResponse = true
            } catch (e) {
              // do nothing
            }
          }
          inserts.push(insert())
        }
        await Promise.all(inserts)

        // wait 1 second then insert
        await wait(1000)

        const finalItem = 'final-item'
        const finalItemId = 'final-item-id'
        insertedItems[finalItemId] = { successResponse: false }
        await this.test.userbase.insertItem({ databaseName, item: finalItem, itemId: finalItemId })
        insertedItems[finalItemId].successResponse = true

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(2 + numSuccessfulConcurrentOperations)
        expect(successful, 'successful state').to.be.true

        for (const insertedItemId of Object.keys(insertedItems)) {
          const insertedItem = insertedItems[insertedItemId]

          if (insertedItem.inState) {
            expect(insertedItem.successResponse, 'item status after insert finished').to.be.true
          } else {
            expect(insertedItem.successResponse, 'failed item status after insert finished').to.be.false
          }

          if (insertedItemId === 'finalItemId') {
            expect(insertedItem.inState, 'final item to be in state').to.be.true
          }
        }

        // give client time to process all inserts, then make sure state is still correct
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        expect(latestState, 'successful state after waiting').to.deep.equal(correctState)
      })

    })

  })

})
