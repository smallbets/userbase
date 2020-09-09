
import { getRandomString, wait, readBlobAsText, readBlobAsArrayBuffer } from '../support/utils'

const databaseName = 'test-db'

const beforeEachHook = function () {
  cy.visit('./cypress/integration/index.html').then(async function (win) {
    expect(win).to.have.property('userbase')
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
    this.currentTest.win = win
  })
}

describe('File Storage', function () {

  describe('Upload File', function () {

    describe('Success Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Upload file', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFile = new this.test.win.File([1], testFileName, { type: testFileType })
        expect(testFile.size, 'test file size').to.equal(1)

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 3) {
            expect(items, 'items array to have correct length').to.have.lengthOf(1)

            const insertedItem = items[0]
            expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys(
              'item', 'itemId', 'createdBy', 'fileName', 'fileSize', 'fileId', 'fileUploadedBy'
            )

            expect(insertedItem, 'item in items array passed to changeHandler').to.deep.equal({
              item: testItem,
              itemId: testItemId,
              createdBy: insertedItem.createdBy,
              fileName: testFileName,
              fileSize: testFile.size,
              fileId: insertedItem.fileId,
              fileUploadedBy: insertedItem.fileUploadedBy,
            })

            expect(insertedItem.fileId, 'file id').to.be.a.string

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })

        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })
        expect(successful, 'success state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('Upload 512kb file', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testArray = []
        testArray.length = 1024 * 512 // 512kb
        testArray.fill(1)
        const testFile = new this.test.win.File(testArray, testFileName, { type: testFileType })
        expect(testFile.size, 'test file size').to.equal(testArray.length)

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 3) {
            expect(items, 'items array to have correct length').to.have.lengthOf(1)

            const insertedItem = items[0]
            expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys(
              'item', 'itemId', 'createdBy', 'fileName', 'fileSize', 'fileId', 'fileUploadedBy'
            )

            expect(insertedItem, 'item in items array passed to changeHandler').to.deep.equal({
              item: testItem,
              itemId: testItemId,
              createdBy: insertedItem.createdBy,
              fileName: testFileName,
              fileSize: testFile.size,
              fileId: insertedItem.fileId,
              fileUploadedBy: insertedItem.fileUploadedBy,
            })

            expect(insertedItem.fileId, 'file id').to.be.a.string

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })

        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })
        expect(successful, 'success state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('Upload 512.001 kb file', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testArray = []
        testArray.length = (1024 * 512) + 1 // 512.001kb
        testArray.fill(1)
        const testFile = new this.test.win.File(testArray, testFileName, { type: testFileType })
        expect(testFile.size, 'test file size').to.equal(testArray.length)

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 3) {
            expect(items, 'items array to have correct length').to.have.lengthOf(1)

            const insertedItem = items[0]
            expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys(
              'item', 'itemId', 'createdBy', 'fileName', 'fileSize', 'fileId', 'fileUploadedBy'
            )

            expect(insertedItem, 'item in items array passed to changeHandler').to.deep.equal({
              item: testItem,
              itemId: testItemId,
              createdBy: insertedItem.createdBy,
              fileName: testFileName,
              fileSize: testFile.size,
              fileId: insertedItem.fileId,
              fileUploadedBy: insertedItem.fileUploadedBy,
            })

            expect(insertedItem.fileId, 'file id').to.be.a.string

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })

        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })
        expect(successful, 'success state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('Upload 1mb file', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testArray = []
        testArray.length = 1024 * 1024 // 1mb
        testArray.fill(1)
        const testFile = new this.test.win.File(testArray, testFileName, { type: testFileType })
        expect(testFile.size, 'test file size').to.equal(testArray.length)

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 3) {
            expect(items, 'items array to have correct length').to.have.lengthOf(1)

            const insertedItem = items[0]
            expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys(
              'item', 'itemId', 'createdBy', 'fileName', 'fileSize', 'fileId', 'fileUploadedBy'
            )

            expect(insertedItem, 'item in items array passed to changeHandler').to.deep.equal({
              item: testItem,
              itemId: testItemId,
              createdBy: insertedItem.createdBy,
              fileName: testFileName,
              fileSize: testFile.size,
              fileId: insertedItem.fileId,
              fileUploadedBy: insertedItem.fileUploadedBy,
            })

            expect(insertedItem.fileId, 'file id').to.be.a.string

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })

        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })
        expect(successful, 'success state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('Upload 10mb file', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testArray = []
        testArray.length = 1024 * 1024 // 1mb
        testArray.fill(1)

        const TOTAL_MB = 10
        const testArrays = []
        for (let i = 0; i < TOTAL_MB; i++) {
          testArrays.push(new Uint8Array(testArray.slice()))
        }

        const testFile = new this.test.win.File(testArrays, testFileName, { type: testFileType })
        expect(testFile.size, 'test file size').to.equal(testArray.length * TOTAL_MB)

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 3) {
            expect(items, 'items array to have correct length').to.have.lengthOf(1)

            const insertedItem = items[0]
            expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys(
              'item', 'itemId', 'createdBy', 'fileName', 'fileSize', 'fileId', 'fileUploadedBy'
            )

            expect(insertedItem, 'item in items array passed to changeHandler').to.deep.equal({
              item: testItem,
              itemId: testItemId,
              createdBy: insertedItem.createdBy,
              fileName: testFileName,
              fileSize: testFile.size,
              fileId: insertedItem.fileId,
              fileUploadedBy: insertedItem.fileUploadedBy,
            })

            expect(insertedItem.fileId, 'file id').to.be.a.string

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })

        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })
        expect(successful, 'success state').to.be.true

        await this.test.userbase.deleteUser()
      })

      it('Upload files sequentially', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'

        const testFile1 = new this.test.win.File([1], testFileName, { type: testFileType })
        const testFile2 = new this.test.win.File([1], 2 + testFileName, { type: testFileType })

        let changeHandlerCallCount = 0
        let successful

        const changeHandler = function (items) {
          changeHandlerCallCount += 1

          if (changeHandlerCallCount === 4) {
            expect(items, 'items array to have correct length').to.have.lengthOf(1)

            const insertedItem = items[0]
            expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys(
              'item', 'itemId', 'createdBy', 'fileName', 'fileSize', 'fileId', 'fileUploadedBy'
            )

            expect(insertedItem, 'item in items array passed to changeHandler').to.deep.equal({
              item: testItem,
              itemId: testItemId,
              createdBy: insertedItem.createdBy,
              fileName: 2 + testFileName,
              fileSize: testFile2.size,
              fileId: insertedItem.fileId,
              fileUploadedBy: insertedItem.fileUploadedBy,
            })

            expect(insertedItem.fileId, 'file id').to.be.a.string

            successful = true
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })

        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile1 })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile2 })
        expect(successful, 'success state').to.be.true

        await this.test.userbase.deleteUser()
      })

    })

    describe('Failure Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Params as false', async function () {
        try {
          await this.test.userbase.uploadFile(false)
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ParamsMustBeObject')
          expect(e.message, 'error message').to.equal('Parameters passed to function must be placed inside an object.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Database not open', async function () {
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFile = new this.test.win.File([1], testFileName, { type: testFileType })

        try {
          await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNotOpen')
          expect(e.message, 'error message').to.equal('Database is not open.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Database name missing', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFile = new this.test.win.File([1], testFileName, { type: testFileType })

        try {
          await this.test.userbase.uploadFile({ itemId: testItemId, file: testFile })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMissing')
          expect(e.message, 'error message').to.equal('Database name missing.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Database name as false', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFile = new this.test.win.File([1], testFileName, { type: testFileType })

        try {
          await this.test.userbase.uploadFile({ databaseName: false, itemId: testItemId, file: testFile })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMustBeString')
          expect(e.message, 'error message').to.equal('Database name must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Database name as null', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFile = new this.test.win.File([1], testFileName, { type: testFileType })

        try {
          await this.test.userbase.uploadFile({ databaseName: null, itemId: testItemId, file: testFile })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMustBeString')
          expect(e.message, 'error message').to.equal('Database name must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Database name as 0 length string', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFile = new this.test.win.File([1], testFileName, { type: testFileType })

        try {
          await this.test.userbase.uploadFile({ databaseName: '', itemId: testItemId, file: testFile })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameCannotBeBlank')
          expect(e.message, 'error message').to.equal('Database name cannot be blank.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Database name too long', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFile = new this.test.win.File([1], testFileName, { type: testFileType })

        try {
          await this.test.userbase.uploadFile({ databaseName: 'a'.repeat(51), itemId: testItemId, file: testFile })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameTooLong')
          expect(e.message, 'error message').to.equal('Database name cannot be more than 50 characters.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Item id as false', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFile = new this.test.win.File([1], testFileName, { type: testFileType })

        try {
          await this.test.userbase.uploadFile({ databaseName, itemId: false, file: testFile })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdMustBeString')
          expect(e.message, 'error message').to.equal('Item id must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Item id as 0 length string', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFile = new this.test.win.File([1], testFileName, { type: testFileType })

        try {
          await this.test.userbase.uploadFile({ databaseName, itemId: '', file: testFile })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdCannotBeBlank')
          expect(e.message, 'error message').to.equal('Item id cannot be blank.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Item id too long', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFile = new this.test.win.File([1], testFileName, { type: testFileType })

        try {
          await this.test.userbase.uploadFile({ databaseName, itemId: 'a'.repeat(101), file: testFile })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdTooLong')
          expect(e.message, 'error message').to.equal('Item id cannot be more than 100 characters.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('File missing', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.uploadFile({ databaseName, itemId: 'test-id' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('FileMissing')
          expect(e.message, 'error message').to.equal('File missing.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Item does not exist', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.uploadFile({ databaseName, itemId: 'test-id', file: undefined })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ItemDoesNotExist')
          expect(e.message, 'error message').to.be.equal('Item with the provided id does not exist.')
          expect(e.status, 'error status').to.be.equal(404)
        }

        await this.test.userbase.deleteUser()
      })

      it('File undefined', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const itemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: 'test-item', itemId })

        try {
          await this.test.userbase.uploadFile({ databaseName, itemId, file: undefined })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('FileMustBeFile')
          expect(e.message, 'error message').to.equal('File must be a file.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('File as function', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const itemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: 'test-item', itemId })

        try {
          await this.test.userbase.uploadFile({ databaseName, itemId, file: () => { } })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('FileMustBeFile')
          expect(e.message, 'error message').to.equal('File must be a file.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Empty file', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const itemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: 'test-item', itemId })

        try {
          await this.test.userbase.uploadFile({ databaseName, itemId, file: new this.test.win.File([], 'empty.txt') })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('FileCannotBeEmpty')
          expect(e.message, 'error message').to.equal('File cannot be empty.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Upload files concurrently', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName1 = 'test-file-name.txt'
        const testFileName2 = 2 + testFileName1
        const testFileType = 'text/plain'

        const testFile1 = new this.test.win.File([1], testFileName1, { type: testFileType })
        const testFile2 = new this.test.win.File([1], testFileName2, { type: testFileType })

        let changeHandlerCallCount = 0
        let successful, latestState, correctState

        const changeHandler = function (items) {
          changeHandlerCallCount += 1
          latestState = items

          if (changeHandlerCallCount > 2 && !successful) {
            expect(items, 'items array to have correct length').to.have.lengthOf(1)

            const insertedItem = items[0]
            expect(insertedItem, 'item keys in items array passed to changeHandler').to.be.an('object').that.has.all.keys(
              'item', 'itemId', 'createdBy', 'fileName', 'fileSize', 'fileId', 'fileUploadedBy'
            )

            const fileName = insertedItem.fileName
            expect(fileName, 'file name').to.be.oneOf([testFileName1, testFileName2])

            expect(insertedItem, 'item in items array passed to changeHandler').to.deep.equal({
              item: testItem,
              itemId: testItemId,
              createdBy: insertedItem.createdBy,
              fileName: insertedItem.fileName,
              fileSize: testFile1.size,
              fileId: insertedItem.fileId,
              fileUploadedBy: insertedItem.fileUploadedBy,
            })

            expect(insertedItem.fileId, 'file id').to.be.a.string

            successful = true
            correctState = items
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })

        try {
          await Promise.all([
            this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile1 }),
            this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile2 }),
          ])
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('FileUploadConflict')
          expect(e.message, 'error message').to.equal('File upload conflict.')
          expect(e.status, 'error status').to.equal(409)
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.be.lte(4)
        expect(successful, 'successful state').to.be.true

        // give client time to process all transactions, then make sure state is still correct
        const THREE_SECONDS = 3 * 1000
        await wait(THREE_SECONDS)
        expect(latestState, 'successful state after waiting').to.deep.equal(correctState)

        await this.test.userbase.deleteUser()
      })

    })

  })

  describe('Get File', function () {

    describe('Success Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Default', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFileContent = 1
        const testFile = new this.test.win.File([testFileContent], testFileName, { type: testFileType })

        let fileId
        const changeHandler = function (items) {
          if (items.length === 1) {
            fileId = items[0].fileId
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })

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

      it('512kb file', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'

        // testArray: [0, 1, 1, ... , 1, 1, 0]
        const testArray = []
        testArray.length = 1024 * 512 // 512kb
        testArray.fill(1)
        testArray[0] = 0
        testArray[testArray.length - 1] = 0

        const testFile = new this.test.win.File(testArray, testFileName, { type: testFileType })

        let fileId
        const changeHandler = function (items) {
          if (items.length === 1) {
            fileId = items[0].fileId
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })

        const result = await this.test.userbase.getFile({ databaseName, fileId })

        expect(result, 'result keys').to.have.keys(['file'])

        const { file } = result

        expect(file.name, 'file name').to.equal(testFileName)
        expect(file.type, 'file type').to.equal(testFileType)
        expect(file.size, 'file size').to.equal(testFile.size)

        const text = await readBlobAsText(file)
        expect(text, 'file text').to.equal(testArray.join(''))

        await this.test.userbase.deleteUser()
      })

      it('512.001 kb file', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'

        // testArray: [0, 1, 1, ... , 1, 1, 0]
        const testArray = []
        testArray.length = (1024 * 512) + 1 // 512.001 kb
        testArray.fill(1)
        testArray[0] = 0
        testArray[testArray.length - 1] = 0

        const testFile = new this.test.win.File(testArray, testFileName, { type: testFileType })

        let fileId
        const changeHandler = function (items) {
          if (items.length === 1) {
            fileId = items[0].fileId
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })

        const result = await this.test.userbase.getFile({ databaseName, fileId })

        expect(result, 'result keys').to.have.keys(['file'])

        const { file } = result

        expect(file.name, 'file name').to.equal(testFileName)
        expect(file.type, 'file type').to.equal(testFileType)
        expect(file.size, 'file size').to.equal(testFile.size)

        const text = await readBlobAsText(file)
        expect(text, 'file text').to.equal(testArray.join(''))

        await this.test.userbase.deleteUser()
      })

      it('1mb file', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'

        // testArray: [0, 1, 1, ... , 1, 1, 0]
        const testArray = []
        testArray.length = 1024 * 1024 // 1mb
        testArray.fill(1)
        testArray[0] = 0
        testArray[testArray.length - 1] = 0

        const testFile = new this.test.win.File(testArray, testFileName, { type: testFileType })
        expect(testFile.size, 'test file size').to.equal(testArray.length)

        let fileId
        const changeHandler = function (items) {
          if (items.length === 1) {
            fileId = items[0].fileId
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })

        const result = await this.test.userbase.getFile({ databaseName, fileId })

        expect(result, 'result keys').to.have.keys(['file'])

        const { file } = result

        expect(file.name, 'file name').to.equal(testFileName)
        expect(file.type, 'file type').to.equal(testFileType)
        expect(file.size, 'file size').to.equal(testFile.size)

        const text = await readBlobAsText(file)
        expect(text, 'file text').to.equal(testArray.join(''))

        await this.test.userbase.deleteUser()
      })

      it('10mb file', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'

        const MAX_RANDOM_BYTE_SIZE = 65536
        const TOTAL_MB = 1024 * 1024 * 10 // 10mb
        const NUM_RANDOM_BYTE_ARRAYS = TOTAL_MB / MAX_RANDOM_BYTE_SIZE

        const testArrays = []
        for (let i = 0; i < NUM_RANDOM_BYTE_ARRAYS; i++) {
          testArrays.push(new Uint8Array(this.test.win.crypto.getRandomValues(new Uint8Array(MAX_RANDOM_BYTE_SIZE))))
        }

        const testFile = new this.test.win.File(testArrays, testFileName, { type: testFileType })
        expect(testFile.size, 'test file size').to.equal(TOTAL_MB)

        let fileId
        const changeHandler = function (items) {
          if (items.length === 1) {
            fileId = items[0].fileId
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })

        const result = await this.test.userbase.getFile({ databaseName, fileId })

        expect(result, 'result keys').to.have.keys(['file'])

        const { file } = result

        expect(file.name, 'file name').to.equal(testFileName)
        expect(file.type, 'file type').to.equal(testFileType)
        expect(file.size, 'file size').to.equal(testFile.size)

        const actualArrayBuffer = new Uint8Array(await readBlobAsArrayBuffer(file))
        const expectedArrayBuffer = new Uint8Array(await readBlobAsArrayBuffer(testFile))

        expect(actualArrayBuffer.byteLength, 'file content len').to.equal(expectedArrayBuffer.byteLength)

        // deep equal slows down browser -- do this manually to reduce memory footprint
        for (let i = 0; i < actualArrayBuffer.byteLength; i++) {
          if (actualArrayBuffer[i] !== expectedArrayBuffer[i]) {
            expect(actualArrayBuffer[i], 'byte num ' + i).to.equal(expectedArrayBuffer[i])
          }

          // sanity check
          if (i % (TOTAL_MB / 10) === 0) {
            expect(actualArrayBuffer[i], 'byte num ' + i).to.equal(expectedArrayBuffer[i])
          }
        }

        await this.test.userbase.deleteUser()
      })

      it('Sequentially uploaded files', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileName2 = 2 + 'test-file-name.txt'

        const testFileType = 'text/plain'

        const testFile1 = new this.test.win.File([1], testFileName, { type: testFileType })
        const testFile2 = new this.test.win.File([2], testFileName2, { type: testFileType })

        let fileId
        const changeHandler = function (items) {
          if (items.length === 1) {
            fileId = items[0].fileId
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile1 })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile2 })

        const result = await this.test.userbase.getFile({ databaseName, fileId })

        expect(result, 'result keys').to.have.keys(['file'])

        const { file } = result

        expect(file.name, 'file name').to.equal(testFileName2)
        expect(file.size, 'file size').to.equal(testFile2.size)
        expect(file.type, 'file type').to.equal(testFile2.type)

        const text = await readBlobAsText(file)
        expect(text, 'file text').to.equal('2')

        await this.test.userbase.deleteUser()
      })

    })

    describe('Failure Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Params as false', async function () {
        try {
          await this.test.userbase.uploadFile(false)
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ParamsMustBeObject')
          expect(e.message, 'error message').to.equal('Parameters passed to function must be placed inside an object.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Database not open', async function () {
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFile = new this.test.win.File([1], testFileName, { type: testFileType })

        try {
          await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNotOpen')
          expect(e.message, 'error message').to.equal('Database is not open.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Database name missing', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFile = new this.test.win.File([1], testFileName, { type: testFileType })

        try {
          await this.test.userbase.uploadFile({ itemId: testItemId, file: testFile })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMissing')
          expect(e.message, 'error message').to.equal('Database name missing.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Database name as false', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFile = new this.test.win.File([1], testFileName, { type: testFileType })

        try {
          await this.test.userbase.uploadFile({ databaseName: false, itemId: testItemId, file: testFile })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMustBeString')
          expect(e.message, 'error message').to.equal('Database name must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Database name as null', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFile = new this.test.win.File([1], testFileName, { type: testFileType })

        try {
          await this.test.userbase.uploadFile({ databaseName: null, itemId: testItemId, file: testFile })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMustBeString')
          expect(e.message, 'error message').to.equal('Database name must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Database name as 0 length string', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFile = new this.test.win.File([1], testFileName, { type: testFileType })

        try {
          await this.test.userbase.uploadFile({ databaseName: '', itemId: testItemId, file: testFile })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameCannotBeBlank')
          expect(e.message, 'error message').to.equal('Database name cannot be blank.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Database name too long', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'
        const testFile = new this.test.win.File([1], testFileName, { type: testFileType })

        try {
          await this.test.userbase.uploadFile({ databaseName: 'a'.repeat(51), itemId: testItemId, file: testFile })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameTooLong')
          expect(e.message, 'error message').to.equal('Database name cannot be more than 50 characters.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('File id missing', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.getFile({ databaseName })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('FileIdMissing')
          expect(e.message, 'error message').to.equal('File id missing.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('File id as false', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.getFile({ databaseName, fileId: false })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('FileIdMustBeString')
          expect(e.message, 'error message').to.equal('File id must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('File id as 0 length string', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.getFile({ databaseName, fileId: '' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('FileIdCannotBeBlank')
          expect(e.message, 'error message').to.equal('File id cannot be blank.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('File id too long', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.getFile({ databaseName, fileId: 'a'.repeat(101) })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('FileIdTooLong')
          expect(e.message, 'error message').to.equal('File id cannot be more than 100 characters.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('File not found', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.getFile({ databaseName, fileId: 'fake-id' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('FileNotFound')
          expect(e.message, 'error message').to.equal('File not found.')
          expect(e.status, 'error status').to.equal(404)
        }

        await this.test.userbase.deleteUser()
      })

      it('File not found after overwriting', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileName2 = 2 + 'test-file-name.txt'

        const testFileType = 'text/plain'

        const testFile1 = new this.test.win.File([1], testFileName, { type: testFileType })
        const testFile2 = new this.test.win.File([2], testFileName2, { type: testFileType })

        let fileId
        let changeHandlerCallCount = 0
        const changeHandler = function (items) {
          if (changeHandlerCallCount === 2) {
            fileId = items[0].fileId
          }

          changeHandlerCallCount += 1
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile1 })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile2 })

        try {
          await this.test.userbase.getFile({ databaseName, fileId })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('FileNotFound')
          expect(e.message, 'error message').to.equal('File not found.')
          expect(e.status, 'error status').to.equal(404)
        }

        await this.test.userbase.deleteUser()
      })

      it('Upload files concurrently', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName1 = 'test-file-name.txt'
        const testFileName2 = 2 + testFileName1
        const testFileType = 'text/plain'

        const testFile1 = new this.test.win.File([1], testFileName1, { type: testFileType })
        const testFile2 = new this.test.win.File([2], testFileName2, { type: testFileType })

        let fileId, fileName
        const changeHandler = function (items) {
          if (items.length) {
            fileId = items[0].fileId
            fileName = items[0].fileName
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })

        const uploadFile = async (file) => {
          try {
            await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file })
            return true
          } catch (e) {
            expect(e.name, 'error name').to.equal('FileUploadConflict')
            expect(e.message, 'error message').to.equal('File upload conflict.')
            expect(e.status, 'error status').to.equal(409)
            return false
          }
        }

        const [file1Result, file2Result] = await Promise.all([
          uploadFile(testFile1),
          uploadFile(testFile2),
        ])

        const { file } = await this.test.userbase.getFile({ databaseName, fileId })
        const text = await readBlobAsText(file)

        if (file1Result) {
          expect(file2Result, 'file 2 should have failed').to.be.false
          expect(fileName, 'file name').to.equal(testFileName1)
          expect(text, 'file text').to.equal('1')
        } else if (file2Result) {
          expect(file1Result, 'file 1 should have failed').to.be.false
          expect(fileName, 'file name').to.equal(testFileName2)
          expect(text, 'file text').to.equal('2')
        } else {
          throw new Error('one should have failed')
        }

        await this.test.userbase.deleteUser()
      })

    })

  })

  describe('Get File - Range', function () {

    describe('Success Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Get all bytes', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'

        // testArray: [0, 1, 1, ... , 1, 1, 0]
        const testArray = []
        testArray.length = 1024 * 1024 // 1mb
        testArray.fill(1)
        testArray[0] = 0
        testArray[testArray.length - 1] = 0

        const testFile = new this.test.win.File(testArray, testFileName, { type: testFileType })
        expect(testFile.size, 'test file size').to.equal(testArray.length)

        let fileId
        const changeHandler = function (items) {
          if (items.length === 1) {
            fileId = items[0].fileId
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })

        const result = await this.test.userbase.getFile({ databaseName, fileId, range: { start: 0, end: testFile.size } })

        expect(result, 'result keys').to.have.keys(['file'])

        const { file } = result

        expect(file.name, 'file name').to.equal(testFileName)
        expect(file.type, 'file type').to.equal(testFileType)
        expect(file.size, 'file size').to.equal(testFile.size)

        const text = await readBlobAsText(file)
        expect(text, 'file text').to.equal(testArray.join(''))

        await this.test.userbase.deleteUser()
      })

      it('Get first byte', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'

        // testArray: [0, 1, 1, ... , 1, 1, 2]
        const testArray = []
        testArray.length = 1024 * 1024 // 1mb
        testArray.fill(1)
        testArray[0] = 0
        testArray[testArray.length - 1] = 2

        const testFile = new this.test.win.File(testArray, testFileName, { type: testFileType })
        expect(testFile.size, 'test file size').to.equal(testArray.length)

        let fileId
        const changeHandler = function (items) {
          if (items.length === 1) {
            fileId = items[0].fileId
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })

        const result = await this.test.userbase.getFile({ databaseName, fileId, range: { start: 0, end: 1 } })

        expect(result, 'result keys').to.have.keys(['file'])

        const { file } = result

        expect(file.name, 'file name').to.equal(testFileName)
        expect(file.type, 'file type').to.equal(testFileType)
        expect(file.size, 'file size').to.equal(1)

        const text = await readBlobAsText(file)
        expect(text, 'file text').to.equal('0')

        await this.test.userbase.deleteUser()
      })

      it('Get last byte', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'

        // testArray: [0, 1, 1, ... , 1, 1, 2]
        const testArray = []
        testArray.length = 1024 * 1024 // 1mb
        testArray.fill(1)
        testArray[0] = 0
        testArray[testArray.length - 1] = 2

        const testFile = new this.test.win.File(testArray, testFileName, { type: testFileType })
        expect(testFile.size, 'test file size').to.equal(testArray.length)

        let fileId
        const changeHandler = function (items) {
          if (items.length === 1) {
            fileId = items[0].fileId
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })

        const result = await this.test.userbase.getFile({ databaseName, fileId, range: { start: testFile.size - 1, end: testFile.size } })

        expect(result, 'result keys').to.have.keys(['file'])

        const { file } = result

        expect(file.name, 'file name').to.equal(testFileName)
        expect(file.type, 'file type').to.equal(testFileType)
        expect(file.size, 'file size').to.equal(1)

        const text = await readBlobAsText(file)
        expect(text, 'file text').to.equal('2')

        await this.test.userbase.deleteUser()
      })

      it('Get range of middle bytes', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'

        const MAX_RANDOM_BYTE_SIZE = 65536
        const TOTAL_MB = 1024 * 1024 // 1mb
        const NUM_RANDOM_BYTE_ARRAYS = TOTAL_MB / MAX_RANDOM_BYTE_SIZE

        const testArrays = []
        for (let i = 0; i < NUM_RANDOM_BYTE_ARRAYS; i++) {
          testArrays.push(new Uint8Array(this.test.win.crypto.getRandomValues(new Uint8Array(MAX_RANDOM_BYTE_SIZE))))
        }

        const testFile = new this.test.win.File(testArrays, testFileName, { type: testFileType })
        expect(testFile.size, 'test file size').to.equal(TOTAL_MB)

        let fileId
        const changeHandler = function (items) {
          if (items.length === 1) {
            fileId = items[0].fileId
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })

        const HALF_OF_FILE = TOTAL_MB / 2
        const TEN_KB = 10 * 1024
        const start = HALF_OF_FILE - TEN_KB
        const end = HALF_OF_FILE + TEN_KB

        const result = await this.test.userbase.getFile({ databaseName, fileId, range: { start, end } })

        expect(result, 'result keys').to.have.keys(['file'])

        const { file } = result

        expect(file.name, 'file name').to.equal(testFileName)
        expect(file.type, 'file type').to.equal(testFileType)
        expect(file.size, 'file size').to.equal(TEN_KB * 2)

        const actualArrayBuffer = new Uint8Array(await readBlobAsArrayBuffer(file))
        const expectedArrayBuffer = new Uint8Array(await readBlobAsArrayBuffer(testFile.slice(start, end)))

        expect(actualArrayBuffer, 'file content').to.deep.equal(expectedArrayBuffer)

        await this.test.userbase.deleteUser()
      })

      it('Get last byte of 512.001 kb file', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'

        // testArray: [0, 1, 1, ... , 1, 1, 2]
        const testArray = []
        testArray.length = (1024 * 512) + 1 // 512.001 kb
        testArray.fill(1)
        testArray[0] = 0
        testArray[testArray.length - 1] = 2

        const testFile = new this.test.win.File(testArray, testFileName, { type: testFileType })

        let fileId
        const changeHandler = function (items) {
          if (items.length === 1) {
            fileId = items[0].fileId
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })

        const result = await this.test.userbase.getFile({ databaseName, fileId, range: { start: testFile.size - 1, end: testFile.size } })

        expect(result, 'result keys').to.have.keys(['file'])

        const { file } = result

        expect(file.name, 'file name').to.equal(testFileName)
        expect(file.type, 'file type').to.equal(testFileType)
        expect(file.size, 'file size').to.equal(1)

        const text = await readBlobAsText(file)
        expect(text, 'file text').to.equal('2')

        await this.test.userbase.deleteUser()
      })

      it('Get last 2 bytes of 512.001 kb file', async function () {
        const testItem = 'test-item'
        const testItemId = 'test-id'

        const testFileName = 'test-file-name.txt'
        const testFileType = 'text/plain'

        // testArray: [0, 1, 1, ... , 1, 1, 2]
        const testArray = []
        testArray.length = (1024 * 512) + 1 // 512.001 kb
        testArray.fill(1)
        testArray[0] = 0
        testArray[testArray.length - 1] = 2

        const testFile = new this.test.win.File(testArray, testFileName, { type: testFileType })

        let fileId
        const changeHandler = function (items) {
          if (items.length === 1) {
            fileId = items[0].fileId
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })
        await this.test.userbase.insertItem({ databaseName, itemId: testItemId, item: testItem })
        await this.test.userbase.uploadFile({ databaseName, itemId: testItemId, file: testFile })

        const result = await this.test.userbase.getFile({ databaseName, fileId, range: { start: testFile.size - 2, end: testFile.size } })

        expect(result, 'result keys').to.have.keys(['file'])

        const { file } = result

        expect(file.name, 'file name').to.equal(testFileName)
        expect(file.type, 'file type').to.equal(testFileType)
        expect(file.size, 'file size').to.equal(2)

        const text = await readBlobAsText(file)
        expect(text, 'file text').to.equal('12')

        await this.test.userbase.deleteUser()
      })

    })

    describe('Failure Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Range as false', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.getFile({ databaseName, fileId: 'test-id', range: false })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('RangeMustBeObject')
          expect(e.message, 'error message').to.equal('Range param provided must be object.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Range missing start', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.getFile({ databaseName, fileId: 'test-id', range: {} })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('RangeMissingStart')
          expect(e.message, 'error message').to.equal('Range param missing start.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Range missing end', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.getFile({ databaseName, fileId: 'test-id', range: { start: 0 } })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('RangeMissingEnd')
          expect(e.message, 'error message').to.equal('Range param missing end.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Range start as false', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.getFile({ databaseName, fileId: 'test-id', range: { start: false, end: 1 } })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('RangeStartMustBeNumber')
          expect(e.message, 'error message').to.equal('Range start provided must be a number.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Range end as false', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.getFile({ databaseName, fileId: 'test-id', range: { start: 0, end: false } })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('RangeEndMustBeNumber')
          expect(e.message, 'error message').to.equal('Range end provided must be a number.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Range start less than zero', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.getFile({ databaseName, fileId: 'test-id', range: { start: -1, end: 1 } })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('RangeStartMustBeGreaterThanZero')
          expect(e.message, 'error message').to.equal('Range start provided must be greater than 0.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Range end same as range start', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.getFile({ databaseName, fileId: 'test-id', range: { start: 0, end: 0 } })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('RangeEndMustBeGreaterThanRangeStart')
          expect(e.message, 'error message').to.equal('Range end provided must be greater than range start.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Range end less than range start', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.getFile({ databaseName, fileId: 'test-id', range: { start: 1, end: 0 } })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('RangeEndMustBeGreaterThanRangeStart')
          expect(e.message, 'error message').to.equal('Range end provided must be greater than range start.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })

      it('Range end greater than file size', async function () {
        let fileId
        const changeHandler = function (items) {
          if (items.length) {
            fileId = items[0].fileId
          }
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        const itemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, itemId, item: 'test-item' })
        await this.test.userbase.uploadFile({ databaseName, itemId, file: new this.test.win.File([1], 'test.txt') })

        try {
          await this.test.userbase.getFile({ databaseName, fileId, range: { start: 0, end: 2 } })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('RangeEndMustBeLessThanFileSize')
          expect(e.message, 'error message').to.equal('Range end provided must be less than file size.')
          expect(e.status, 'error status').to.equal(400)
        }

        await this.test.userbase.deleteUser()
      })
    })

  })

})
