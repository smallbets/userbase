import { getRandomString, getStringOfByteLength, wait, readBlobAsText } from '../../support/utils'

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
  const BUNDLE_SIZE = 50 * 1024 // from src/userbase-server/ws.js

  describe('Bundling', function () {

    describe('Synchronous Tests', function () {
      beforeEach(function () { beforeEachHook() })

      // must check the server logs to verify bundling occurs
      it('Bundle transaction log with a large Userbase transaction', async function () {
        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)
        const operations = []
        for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
          operations.push({ command: 'Insert', item: largeString, itemId: i.toString() })
        }

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 2) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(numItemsNeededToTriggerBundle)

            for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
              const insertedItem = items[i]
              expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

              const { item, itemId } = insertedItem
              expect(item, 'item in items array passed to changeHandler').to.equal(largeString)
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

      // must check the server logs to verify bundling occurs
      it('Bundle transaction log with a large Userbase transaction and then insert', async function () {
        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)
        const operations = []
        for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
          operations.push({ command: 'Insert', item: largeString, itemId: i.toString() })
        }

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 3) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(numItemsNeededToTriggerBundle + 1)

            for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
              const insertedItem = items[i]
              const { item, itemId } = insertedItem
              expect(item, 'item in items array passed to changeHandler').to.equal(largeString)
              expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(i.toString())
            }

            const finalItem = items[numItemsNeededToTriggerBundle]
            const { item, itemId } = finalItem
            expect(item, 'final item').to.equal('extra-insert')
            expect(itemId, 'final item id').to.equal('extra-insert-id')

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.putTransaction({ databaseName, operations })
        await this.test.userbase.insertItem({ databaseName, item: 'extra-insert', itemId: 'extra-insert-id' })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(3)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      // must check the server to verify reading bundle from S3 and not DDB
      it('Read from bundled transaction log', async function () {
        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)
        const operations = []
        for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
          operations.push({ command: 'Insert', item: largeString, itemId: i.toString() })
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })
        await this.test.userbase.putTransaction({ databaseName, operations })

        // give client sufficient time to finish the bundle
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        await this.test.userbase.signOut()
        await this.test.userbase.signIn({ username: this.test.username, password: this.test.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 1) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(numItemsNeededToTriggerBundle)

            for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
              const insertedItem = items[i]
              expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

              const { item, itemId } = insertedItem
              expect(item, 'item in items array passed to changeHandler').to.equal(largeString)
              expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(i.toString())
            }

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      // must check the server to verify reading bundle from S3 and not DDB
      it('Bundle transaction log with a large Userbase transaction, insert, and then read from bundle', async function () {
        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)
        const operations = []
        for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
          operations.push({ command: 'Insert', item: largeString, itemId: i.toString() })
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })
        await this.test.userbase.putTransaction({ databaseName, operations })
        await this.test.userbase.insertItem({ databaseName, item: 'extra-insert', itemId: 'extra-insert-id' })

        // give client sufficient time to finish the bundle
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        await this.test.userbase.signOut()
        await this.test.userbase.signIn({ username: this.test.username, password: this.test.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          expect(items, 'array passed to changeHandler').to.have.lengthOf(numItemsNeededToTriggerBundle + 1)

          for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
            const insertedItem = items[i]
            const { item, itemId } = insertedItem
            expect(item, 'item in items array passed to changeHandler').to.equal(largeString)
            expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(i.toString())
          }

          const finalItem = items[numItemsNeededToTriggerBundle]
          const { item, itemId } = finalItem
          expect(item, 'final item').to.equal('extra-insert')
          expect(itemId, 'final item id').to.equal('extra-insert-id')

          successful = true
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      // must check the server to verify reading bundle from S3 and not DDB
      it('Read from bundled transaction log and then insert', async function () {
        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)
        const operations = []
        for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
          operations.push({ command: 'Insert', item: largeString, itemId: i.toString() })
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })
        await this.test.userbase.putTransaction({ databaseName, operations })

        // give client sufficient time to finish the bundle
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        await this.test.userbase.signOut()
        await this.test.userbase.signIn({ username: this.test.username, password: this.test.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 2) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(numItemsNeededToTriggerBundle + 1)

            for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
              const insertedItem = items[i]
              const { item, itemId } = insertedItem
              expect(item, 'item in items array passed to changeHandler').to.equal(largeString)
              expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(i.toString())
            }

            const finalItem = items[numItemsNeededToTriggerBundle]
            const { item, itemId } = finalItem
            expect(item, 'final item').to.equal('extra-insert')
            expect(itemId, 'final item id').to.equal('extra-insert-id')

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, item: 'extra-insert', itemId: 'extra-insert-id' })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      // must check the server to verify reading bundle from S3 and not DDB
      it('Upload file, read from bundled transaction log, then read file', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // upload file
        const testItem = 'test-item'
        const testItemId = 'test-id'
        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFileContent = 1
        const testFile = new this.test.win.File([testFileContent], testFileName, { type: testFileType })

        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })

        // trigger bundle
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
        await this.test.userbase.signIn({ username: this.test.username, password: this.test.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        let successful
        let fileId

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 1) {
            const expectedItemsCount = numItemsNeededToTriggerBundle + 1
            expect(items, 'array passed to changeHandler').to.have.lengthOf(expectedItemsCount)

            // check item with the file
            const itemWithFile = items[0]
            expect(itemWithFile, 'item with file in items array passed to changeHandler').to.be.an('object').that.has.all.keys(
              'item', 'itemId', 'createdBy', 'fileName', 'fileSize', 'fileId', 'fileUploadedBy'
            )

            expect(itemWithFile, 'item in items array passed to changeHandler').to.deep.equal({
              item: testItem,
              itemId: testItemId,
              createdBy: itemWithFile.createdBy,
              fileName: testFileName,
              fileSize: testFile.size,
              fileId: itemWithFile.fileId,
              fileUploadedBy: itemWithFile.fileUploadedBy,
            })
            expect(itemWithFile.fileId, 'file id').to.be.a.string
            fileId = itemWithFile.fileId

            // check the rest of the items
            for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
              const insertedItem = items[i + 1]
              expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

              const { item, itemId } = insertedItem
              expect(item, 'item in items array passed to changeHandler').to.equal(largeString)
              expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(i.toString())
            }

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)
        expect(successful, 'successful state').to.be.true

        // get file
        const result = await this.test.userbase.getFile({ databaseName, fileId })
        expect(result, 'result keys').to.have.keys(['file'])

        const { file } = result
        expect(file.name, 'file name').to.equal(testFileName)
        expect(file.type, 'file type').to.equal(testFileType)
        expect(file.size, 'file size').to.equal(testFile.size)

        const text = await readBlobAsText(file)
        expect(text, 'file text').to.equal(testFileContent.toString())

        await this.test.userbase.deleteUser()
      })

      // must check the server logs to verify bundling occurs
      it('Bundle transaction log with regular inserts', async function () {
        const ITEM_SIZE = 5 * 1024
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        const largeString = getStringOfByteLength(ITEM_SIZE)

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 1 + numItemsNeededToTriggerBundle) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(numItemsNeededToTriggerBundle)

            for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
              const insertedItem = items[i]
              expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

              const { item, itemId } = insertedItem
              expect(item, 'item in items array passed to changeHandler').to.equal(largeString)
              expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(i.toString())
            }

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
          const item = largeString
          const itemId = i.toString()
          await this.test.userbase.insertItem({ databaseName, item, itemId })
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1 + numItemsNeededToTriggerBundle)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      // must check the server logs to verify bundling occurs
      it('Read from bundled transaction log with regular inserts', async function () {
        const ITEM_SIZE = 5 * 1024
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        const largeString = getStringOfByteLength(ITEM_SIZE)

        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
          const item = largeString
          const itemId = i.toString()
          await this.test.userbase.insertItem({ databaseName, item, itemId })
        }

        // give client sufficient time to finish the bundle
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)

        await this.test.userbase.signOut()
        await this.test.userbase.signIn({ username: this.test.username, password: this.test.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 1) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(numItemsNeededToTriggerBundle)

            for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
              const insertedItem = items[i]
              expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

              const { item, itemId } = insertedItem
              expect(item, 'item in items array passed to changeHandler').to.equal(largeString)
              expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(i.toString())
            }

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      // must check the server logs to verify bundling occurs
      it('Bundle transaction log 5 times with 5 sequential large Userbase transactions', async function () {
        const numBundles = 5

        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to tigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 1 + numBundles) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(numBundles * numItemsNeededToTriggerBundle)

            for (let i = 0; i < numBundles; i++) {
              for (let j = 0; j < numItemsNeededToTriggerBundle; j++) {
                const itemIndex = (i * numItemsNeededToTriggerBundle) + j

                const insertedItem = items[itemIndex]
                expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

                const { item, itemId } = insertedItem
                expect(item, 'item in items array passed to changeHandler').to.equal(largeString)
                expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(itemIndex.toString())
              }
            }

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        for (let i = 0; i < numBundles; i++) {
          const operations = []
          for (let j = 0; j < numItemsNeededToTriggerBundle; j++) {
            const itemId = ((i * numItemsNeededToTriggerBundle) + j).toString()
            operations.push({ command: 'Insert', item: largeString, itemId: itemId })
          }
          await this.test.userbase.putTransaction({ databaseName, operations })
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1 + numBundles)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      // must check the server logs to verify bundling occurs
      it('Read from bundled transaction after 5 sequential large Userbase transactions', async function () {
        const numBundles = 5

        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)

        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        for (let i = 0; i < numBundles; i++) {
          const operations = []
          for (let j = 0; j < numItemsNeededToTriggerBundle; j++) {
            const itemId = ((i * numItemsNeededToTriggerBundle) + j).toString()
            operations.push({ command: 'Insert', item: largeString, itemId: itemId })
          }
          await this.test.userbase.putTransaction({ databaseName, operations })
        }

        // give client sufficient time to finish the bundle
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)

        await this.test.userbase.signOut()
        await this.test.userbase.signIn({ username: this.test.username, password: this.test.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 1) {
            expect(items, 'array passed to changeHandler').to.have.lengthOf(numBundles * numItemsNeededToTriggerBundle)

            for (let i = 0; i < numBundles; i++) {
              for (let j = 0; j < numItemsNeededToTriggerBundle; j++) {
                const itemIndex = (i * numItemsNeededToTriggerBundle) + j

                const insertedItem = items[itemIndex]
                expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

                const { item, itemId } = insertedItem
                expect(item, 'item in items array passed to changeHandler').to.equal(largeString)
                expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(itemIndex.toString())
              }
            }

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })
    })

    describe('Concurrency Tests', function () {
      beforeEach(function () { beforeEachHook() })

      // must check the server logs to verify bundling occurs
      it('2 concurrent transactions, 1 triggers bundle process', async function () {
        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (!successful && items.length === 2 * numItemsNeededToTriggerBundle) {
            for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
              const itemIndex1 = i
              const itemIndex2 = i + numItemsNeededToTriggerBundle

              const insertedItem1 = items[itemIndex1]
              const insertedItem2 = items[itemIndex2]

              if (insertedItem1.itemId === itemIndex1.toString()) {
                expect(insertedItem1.item, 'item 1 in items array passed to changeHandler').to.deep.equal(itemIndex1.toString())

                expect(insertedItem2.itemId, 'item ID of item 2 in items array passed to changeHandler').to.equal(itemIndex2.toString())
                expect(insertedItem2.item, 'item 2 in items array passed to changeHandler').to.deep.equal(largeString)
              } else {
                expect(insertedItem1.itemId, 'item ID of item 1 in items array passed to changeHandler').to.equal(itemIndex2.toString())
                expect(insertedItem1.item, 'item 1 in items array passed to changeHandler').to.deep.equal(largeString)

                expect(insertedItem2.itemId, 'item ID of item 2 in items array passed to changeHandler').to.equal(itemIndex1.toString())
                expect(insertedItem2.item, 'item 2 in items array passed to changeHandler').to.deep.equal(itemIndex1.toString())
              }
            }

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        const operations1 = []
        const operations2 = []

        for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
          operations1.push({ command: 'Insert', item: i.toString(), itemId: i.toString() })
          operations2.push({ command: 'Insert', item: largeString, itemId: (i + numItemsNeededToTriggerBundle).toString() })
        }

        await Promise.all([
          this.test.userbase.putTransaction({ databaseName, operations: operations1 }),
          this.test.userbase.putTransaction({ databaseName, operations: operations2 })
        ])

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(3)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      // must check the server logs to verify bundling occurs
      it('Read from bundled transaction log after 2 concurrent transactions where 1 triggers bundle process', async function () {
        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)

        const operations1 = []
        const operations2 = []
        for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
          operations1.push({ command: 'Insert', item: i.toString(), itemId: i.toString() })
          operations2.push({ command: 'Insert', item: largeString, itemId: (i + numItemsNeededToTriggerBundle).toString() })
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        await Promise.all([
          this.test.userbase.putTransaction({ databaseName, operations: operations1 }),
          this.test.userbase.putTransaction({ databaseName, operations: operations2 })
        ])

        // give client sufficient time to finish the bundle
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)

        await this.test.userbase.signOut()
        await this.test.userbase.signIn({ username: this.test.username, password: this.test.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          expect(items, 'array passed to changeHandler').to.have.lengthOf(2 * numItemsNeededToTriggerBundle)

          for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
            const itemIndex1 = i
            const itemIndex2 = i + numItemsNeededToTriggerBundle

            const insertedItem1 = items[itemIndex1]
            const insertedItem2 = items[itemIndex2]

            if (insertedItem1.itemId === itemIndex1.toString()) {
              expect(insertedItem1.item, 'item 1 in items array passed to changeHandler').to.deep.equal(itemIndex1.toString())

              expect(insertedItem2.itemId, 'item ID of item 2 in items array passed to changeHandler').to.equal(itemIndex2.toString())
              expect(insertedItem2.item, 'item 2 in items array passed to changeHandler').to.deep.equal(largeString)
            } else {
              expect(insertedItem1.itemId, 'item ID of item 1 in items array passed to changeHandler').to.equal(itemIndex2.toString())
              expect(insertedItem1.item, 'item 1 in items array passed to changeHandler').to.deep.equal(largeString)

              expect(insertedItem2.itemId, 'item ID of item 2 in items array passed to changeHandler').to.equal(itemIndex1.toString())
              expect(insertedItem2.item, 'item 2 in items array passed to changeHandler').to.deep.equal(itemIndex1.toString())
            }
          }

          successful = true
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      // must check the server logs to verify bundling occurs
      it('2 concurrent transactions, each trigger bundle process', async function () {
        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (!successful && items.length === 2 * numItemsNeededToTriggerBundle) {
            for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
              const itemIndex1 = i
              const itemIndex2 = i + numItemsNeededToTriggerBundle

              const insertedItem1 = items[itemIndex1]
              const insertedItem2 = items[itemIndex2]

              expect(insertedItem1, 'item 1 in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')
              expect(insertedItem2, 'item 2 in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

              if (insertedItem1.itemId === itemIndex1.toString()) {
                expect(insertedItem1.item, 'item 1 in items array passed to changeHandler').to.deep.equal(largeString)

                expect(insertedItem2.itemId, 'item ID of item 2 in items array passed to changeHandler').to.equal(itemIndex2.toString())
                expect(insertedItem2.item, 'item 2 in items array passed to changeHandler').to.deep.equal(largeString)
              } else {
                expect(insertedItem1.itemId, 'item ID of item 1 in items array passed to changeHandler').to.equal(itemIndex2.toString())
                expect(insertedItem1.item, 'item 1 in items array passed to changeHandler').to.deep.equal(largeString)

                expect(insertedItem2.itemId, 'item ID of item 2 in items array passed to changeHandler').to.equal(itemIndex1.toString())
                expect(insertedItem2.item, 'item 2 in items array passed to changeHandler').to.deep.equal(largeString)
              }
            }

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        const operations1 = []
        const operations2 = []

        for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
          operations1.push({ command: 'Insert', item: largeString, itemId: i.toString() })
          operations2.push({ command: 'Insert', item: largeString, itemId: (i + numItemsNeededToTriggerBundle).toString() })
        }

        await Promise.all([
          this.test.userbase.putTransaction({ databaseName, operations: operations1 }),
          this.test.userbase.putTransaction({ databaseName, operations: operations2 })
        ])

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(3)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      // must check the server logs to verify bundling occurs
      it('Read from bundled transaction log after 2 concurrent transactions that each trigger bundle process', async function () {
        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)

        const operations1 = []
        const operations2 = []
        for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
          operations1.push({ command: 'Insert', item: largeString, itemId: i.toString() })
          operations2.push({ command: 'Insert', item: largeString, itemId: (i + numItemsNeededToTriggerBundle).toString() })
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        await Promise.all([
          this.test.userbase.putTransaction({ databaseName, operations: operations1 }),
          this.test.userbase.putTransaction({ databaseName, operations: operations2 })
        ])

        // give client sufficient time to finish the bundle
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)

        await this.test.userbase.signOut()
        await this.test.userbase.signIn({ username: this.test.username, password: this.test.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          expect(items, 'array passed to changeHandler').to.have.lengthOf(2 * numItemsNeededToTriggerBundle)

          for (let i = 0; i < numItemsNeededToTriggerBundle; i++) {
            const itemIndex1 = i
            const itemIndex2 = i + numItemsNeededToTriggerBundle

            const insertedItem1 = items[itemIndex1]
            const insertedItem2 = items[itemIndex2]

            expect(insertedItem1, 'item 1 in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')
            expect(insertedItem2, 'item 2 in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

            if (insertedItem1.itemId === itemIndex1.toString()) {
              expect(insertedItem1.item, 'item 1 in items array passed to changeHandler').to.deep.equal(largeString)

              expect(insertedItem2.itemId, 'item ID of item 2 in items array passed to changeHandler').to.equal(itemIndex2.toString())
              expect(insertedItem2.item, 'item 2 in items array passed to changeHandler').to.deep.equal(largeString)
            } else {
              expect(insertedItem1.itemId, 'item ID of item 1 in items array passed to changeHandler').to.equal(itemIndex2.toString())
              expect(insertedItem1.item, 'item 1 in items array passed to changeHandler').to.deep.equal(largeString)

              expect(insertedItem2.itemId, 'item ID of item 2 in items array passed to changeHandler').to.equal(itemIndex1.toString())
              expect(insertedItem2.item, 'item 2 in items array passed to changeHandler').to.deep.equal(largeString)
            }
          }

          successful = true
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      // must check the server logs to verify bundling occurs. Failing to bundle is ok
      it('5 concurrent transactions, each trigger bundle process', async function () {
        const numBundles = 5

        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (!successful && items.length === numBundles * numItemsNeededToTriggerBundle) {

            for (let i = 0; i < numBundles; i++) {
              let startingItemId

              for (let j = 0; j < numItemsNeededToTriggerBundle; j++) {
                const itemIndex = (i * numItemsNeededToTriggerBundle) + j

                const insertedItem = items[itemIndex]
                expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

                const { item, itemId } = insertedItem
                expect(item, 'item in items array passed to changeHandler').to.equal(largeString)

                if (j === 0) {
                  expect(Number(itemId) % numItemsNeededToTriggerBundle, 'item ID of item in items array passed to changeHandler').to.equal(0)
                  startingItemId = Number(itemId)
                }

                const expectedItemIndex = startingItemId + j
                expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(expectedItemIndex.toString())
              }
            }

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        const transactions = []

        for (let i = 0; i < numBundles; i++) {
          const operations = []
          for (let j = 0; j < numItemsNeededToTriggerBundle; j++) {
            const itemId = ((i * numItemsNeededToTriggerBundle) + j).toString()
            operations.push({ command: 'Insert', item: largeString, itemId: itemId })
          }
          transactions.push(this.test.userbase.putTransaction({ databaseName, operations }))
        }
        await Promise.all(transactions)

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(1 + numBundles)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

      // must check the server logs to verify reading from bundle. Failing to bundle is ok
      it('Read from bundled transaction log after 5 concurrent transactions that each trigger bundle process', async function () {
        const numBundles = 5

        const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
        const numItemsNeededToTriggerBundle = BUNDLE_SIZE / ITEM_SIZE
        expect(numItemsNeededToTriggerBundle, 'items needed to trigger bundle').to.be.lte(10) // max operations allowed in tx

        const largeString = getStringOfByteLength(ITEM_SIZE)

        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const transactions = []
        for (let i = 0; i < numBundles; i++) {
          const operations = []
          for (let j = 0; j < numItemsNeededToTriggerBundle; j++) {
            const itemId = ((i * numItemsNeededToTriggerBundle) + j).toString()
            operations.push({ command: 'Insert', item: largeString, itemId: itemId })
          }
          transactions.push(this.test.userbase.putTransaction({ databaseName, operations }))
        }
        await Promise.all(transactions)

        // give client sufficient time to finish the bundle
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)

        await this.test.userbase.signOut()
        await this.test.userbase.signIn({ username: this.test.username, password: this.test.password, rememberMe: 'none' })

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1
          expect(items, 'array passed to changeHandler').to.have.lengthOf(numBundles * numItemsNeededToTriggerBundle)

          for (let i = 0; i < numBundles; i++) {
            let startingItemId

            for (let j = 0; j < numItemsNeededToTriggerBundle; j++) {
              const itemIndex = (i * numItemsNeededToTriggerBundle) + j

              const insertedItem = items[itemIndex]
              expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

              const { item, itemId } = insertedItem
              expect(item, 'item in items array passed to changeHandler').to.equal(largeString)

              if (j === 0) {
                expect(Number(itemId) % numItemsNeededToTriggerBundle, 'item ID of item in items array passed to changeHandler').to.equal(0)
                startingItemId = Number(itemId)
              }

              const expectedItemIndex = startingItemId + j
              expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(expectedItemIndex.toString())
            }
          }

          successful = true
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)
        expect(successful, 'successful state').to.be.true

        await this.test.userbase.deleteUser()
      })

    })

  })

})
