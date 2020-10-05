import { getRandomString, getStringOfByteLength } from '../support/utils'

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
  })
}

const successfulInsertSingleItem = async function (itemToInsert, userbase, insideTransaction = false) {
  let successful
  let changeHandlerCallCount = 0

  const changeHandler = function (items) {
    changeHandlerCallCount += 1

    if (changeHandlerCallCount === 2) {
      expect(items, 'items array to have correct length').to.have.lengthOf(1)

      const insertedItem = items[0]
      expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy')

      const { item, itemId } = insertedItem
      expect(item, 'item in items array passed to changeHandler').to.deep.equal(itemToInsert)
      expect(itemId, 'item ID of item in items array passed to changeHandler').to.be.a('string')

      successful = true
    }
  }

  await userbase.openDatabase({ databaseName, changeHandler })

  if (!insideTransaction) {
    await userbase.insertItem({ databaseName, item: itemToInsert })
  } else {
    await userbase.putTransaction({
      databaseName,
      operations: [{ command: 'Insert', item: itemToInsert }]
    })
  }

  expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)
  expect(successful, 'successful state').to.be.true
}

const successfulUpdateSingleItem = async function (itemToUpdate, userbase, insideTransaction = false) {
  let successful
  let changeHandlerCallCount = 0

  const testItemId = 'test-id'

  const changeHandler = function (items) {
    changeHandlerCallCount += 1

    if (changeHandlerCallCount === 3) {
      expect(items, 'items array to have correct length').to.have.lengthOf(1)

      const insertedItem = items[0]
      expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId', 'createdBy', 'updatedBy')

      const { item, itemId } = insertedItem
      expect(item, 'item in items array passed to changeHandler').to.deep.equal(itemToUpdate)
      expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(testItemId)

      successful = true
    }
  }

  await userbase.openDatabase({ databaseName, changeHandler })
  await userbase.insertItem({ databaseName, item: 'hello world', itemId: testItemId })

  if (!insideTransaction) {
    await userbase.updateItem({ databaseName, item: itemToUpdate, itemId: testItemId })
  } else {
    await userbase.putTransaction({
      databaseName,
      operations: [{ command: 'Update', item: itemToUpdate, itemId: testItemId }]
    })
  }

  expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(3)
  expect(successful, 'successful state').to.be.true
}

describe('DB Tests', function () {

  describe('Insert Item', function () {

    describe('Success Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Insert null', async function () {
        const itemToInsert = null
        await successfulInsertSingleItem(itemToInsert, this.test.userbase)
      })

      it('Insert 0 length string', async function () {
        const itemToInsert = ''
        await successfulInsertSingleItem(itemToInsert, this.test.userbase)
      })

      it('Insert string', async function () {
        const itemToInsert = 'Hello, world!'
        await successfulInsertSingleItem(itemToInsert, this.test.userbase)
      })

      it('Insert 0', async function () {
        const itemToInsert = 0
        await successfulInsertSingleItem(itemToInsert, this.test.userbase)
      })

      it('Insert 1', async function () {
        const itemToInsert = 1
        await successfulInsertSingleItem(itemToInsert, this.test.userbase)
      })

      it('Insert false', async function () {
        const itemToInsert = false
        await successfulInsertSingleItem(itemToInsert, this.test.userbase)
      })

      it('Insert true', async function () {
        const itemToInsert = true
        await successfulInsertSingleItem(itemToInsert, this.test.userbase)
      })

      it('Insert empty array', async function () {
        const itemToInsert = []
        await successfulInsertSingleItem(itemToInsert, this.test.userbase)
      })

      it('Insert array with 1 element', async function () {
        const itemToInsert = ['hello world']
        await successfulInsertSingleItem(itemToInsert, this.test.userbase)
      })

      it('Insert empty object', async function () {
        const itemToInsert = {}
        await successfulInsertSingleItem(itemToInsert, this.test.userbase)
      })

      it('Insert object with 1 key set to null', async function () {
        const itemToInsert = { testKey: null }
        await successfulInsertSingleItem(itemToInsert, this.test.userbase)
      })

    })

    describe('Failure Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Params as false', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.insertItem(false)
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ParamsMustBeObject')
          expect(e.message, 'error message').to.equal('Parameters passed to function must be placed inside an object.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database not open', async function () {
        try {
          await this.test.userbase.insertItem({ databaseName, item: 'test-item' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNotOpen')
          expect(e.message, 'error message').to.equal('Database is not open.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name missing', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.insertItem({ item: 'test-item' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMissing')
          expect(e.message, 'error message').to.equal('Database name missing.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name as false', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.insertItem({ databaseName: false, item: 'test-item' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMustBeString')
          expect(e.message, 'error message').to.equal('Database name must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name as null', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.insertItem({ databaseName: null, item: 'test-item' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMustBeString')
          expect(e.message, 'error message').to.equal('Database name must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name as 0 length string', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.insertItem({ databaseName: '', item: 'test-item' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameCannotBeBlank')
          expect(e.message, 'error message').to.equal('Database name cannot be blank.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name too long', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.insertItem({ databaseName: 'a'.repeat(51), item: 'test-item' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameTooLong')
          expect(e.message, 'error message').to.equal('Database name cannot be more than 50 characters.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item id as false', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.insertItem({ databaseName, item: 'test-item', itemId: false })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdMustBeString')
          expect(e.message, 'error message').to.equal('Item id must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item id as 0 length string', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.insertItem({ databaseName, item: 'test-item', itemId: '' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdCannotBeBlank')
          expect(e.message, 'error message').to.equal('Item id cannot be blank.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item id too long', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.insertItem({ databaseName, item: 'test-item', itemId: 'a'.repeat(101) })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdTooLong')
          expect(e.message, 'error message').to.equal('Item id cannot be more than 100 characters.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item missing', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.insertItem({ databaseName })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemMissing')
          expect(e.message, 'error message').to.equal('Item missing.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item undefined', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.insertItem({ databaseName, item: undefined })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemInvalid')
          expect(e.message, 'error message').to.equal('Item must be serializable to JSON.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item as function', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.insertItem({ databaseName, item: () => { } })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemInvalid')
          expect(e.message, 'error message').to.equal('Item must be serializable to JSON.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item too large', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const MAX_BYTE_SIZE = 10 * 1024
        const item = getStringOfByteLength(MAX_BYTE_SIZE)

        try {
          await this.test.userbase.insertItem({ databaseName, item })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemTooLarge')
          expect(e.message, 'error message').to.equal('Item must be less than 10 KB.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item already exists', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const itemId = 'duplicate-item-id'

        await this.test.userbase.insertItem({ databaseName, item: true, itemId })

        try {
          await this.test.userbase.insertItem({ databaseName, item: false, itemId })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemAlreadyExists')
          expect(e.message, 'error message').to.equal('Item with the same id already exists.')
          expect(e.status, 'error status').to.equal(409)
        }
      })

    })

  })

  describe('Update Item', function () {

    describe('Success Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Update to null', async function () {
        const itemToUpdate = null
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase)
      })

      it('Update to 0 length string', async function () {
        const itemToUpdate = ''
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase)
      })

      it('Update to string', async function () {
        const itemToUpdate = 'Hello, world!'
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase)
      })

      it('Update to 0', async function () {
        const itemToUpdate = 0
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase)
      })

      it('Update to 1', async function () {
        const itemToUpdate = 1
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase)
      })

      it('Update to false', async function () {
        const itemToUpdate = false
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase)
      })

      it('Update to true', async function () {
        const itemToUpdate = true
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase)
      })

      it('Update to empty array', async function () {
        const itemToUpdate = []
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase)
      })

      it('Update to array with 1 element', async function () {
        const itemToUpdate = ['hello world']
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase)
      })

      it('Update to empty object', async function () {
        const itemToUpdate = {}
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase)
      })

      it('Update to object with 1 key set to null', async function () {
        const itemToUpdate = { testKey: null }
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase)
      })

    })

    describe('Failure Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Params as false', async function () {
        try {
          await this.test.userbase.updateItem(false)
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ParamsMustBeObject')
          expect(e.message, 'error message').to.equal('Parameters passed to function must be placed inside an object.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database not open', async function () {
        try {
          await this.test.userbase.updateItem({ databaseName, item: 'test-item', itemId: 'fake-id' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNotOpen')
          expect(e.message, 'error message').to.equal('Database is not open.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name missing', async function () {
        try {
          await this.test.userbase.updateItem({ item: 'test-item', itemId: 'fake-id' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMissing')
          expect(e.message, 'error message').to.equal('Database name missing.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name as false', async function () {
        try {
          await this.test.userbase.updateItem({ databaseName: false, item: 'test-item', itemId: 'fake-id' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMustBeString')
          expect(e.message, 'error message').to.equal('Database name must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name as null', async function () {
        try {
          await this.test.userbase.updateItem({ databaseName: null, item: 'test-item', itemId: 'fake-id' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMustBeString')
          expect(e.message, 'error message').to.equal('Database name must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name as 0 length string', async function () {
        try {
          await this.test.userbase.updateItem({ databaseName: '', item: 'test-item', itemId: 'fake-id' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameCannotBeBlank')
          expect(e.message, 'error message').to.equal('Database name cannot be blank.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name too long', async function () {
        try {
          await this.test.userbase.updateItem({ databaseName: 'a'.repeat(51), item: 'test-item', itemId: 'fake-id' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameTooLong')
          expect(e.message, 'error message').to.equal('Database name cannot be more than 50 characters.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item id as false', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.updateItem({ databaseName, item: 'test-item', itemId: false })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdMustBeString')
          expect(e.message, 'error message').to.equal('Item id must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item id missing', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.updateItem({ databaseName, item: 'test-item' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdMissing')
          expect(e.message, 'error message').to.equal('Item id missing.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item id as 0 length string', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.updateItem({ databaseName, item: 'test-item', itemId: '' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdCannotBeBlank')
          expect(e.message, 'error message').to.equal('Item id cannot be blank.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item id too long', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.updateItem({ databaseName, item: 'test-item', itemId: 'a'.repeat(101) })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdTooLong')
          expect(e.message, 'error message').to.equal('Item id cannot be more than 100 characters.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item missing', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.updateItem({ databaseName })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemMissing')
          expect(e.message, 'error message').to.equal('Item missing.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item undefined', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const itemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: 'test-item', itemId })

        try {
          await this.test.userbase.updateItem({ databaseName, item: undefined, itemId })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemInvalid')
          expect(e.message, 'error message').to.equal('Item must be serializable to JSON.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item as a function', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const itemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: 'test-item', itemId })

        try {
          await this.test.userbase.updateItem({ databaseName, item: () => { }, itemId })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemInvalid')
          expect(e.message, 'error message').to.equal('Item must be serializable to JSON.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item too large', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const itemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: 'test-item', itemId })

        const MAX_BYTE_SIZE = 10 * 1024
        const item = getStringOfByteLength(MAX_BYTE_SIZE)

        try {
          await this.test.userbase.updateItem({ databaseName, item, itemId })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemTooLarge')
          expect(e.message, 'error message').to.equal('Item must be less than 10 KB.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Item does not exist', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.updateItem({ databaseName, item: false, itemId: 'fake-item-id' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemDoesNotExist')
          expect(e.message, 'error message').to.equal('Item with the provided id does not exist.')
          expect(e.status, 'error status').to.equal(404)
        }
      })

    })

  })

  describe('Put Transaction', function () {

    describe('Success Tests', function () {
      const insideTransaction = true

      beforeEach(function () { beforeEachHook() })

      it('Insert null', async function () {
        const itemToInsert = null
        await successfulInsertSingleItem(itemToInsert, this.test.userbase, insideTransaction)
      })

      it('Insert 0 length string', async function () {
        const itemToInsert = ''
        await successfulInsertSingleItem(itemToInsert, this.test.userbase, insideTransaction)
      })

      it('Insert string', async function () {
        const itemToInsert = 'Hello, world!'
        await successfulInsertSingleItem(itemToInsert, this.test.userbase, insideTransaction)
      })

      it('Insert 0', async function () {
        const itemToInsert = 0
        await successfulInsertSingleItem(itemToInsert, this.test.userbase, insideTransaction)
      })

      it('Insert 1', async function () {
        const itemToInsert = 1
        await successfulInsertSingleItem(itemToInsert, this.test.userbase, insideTransaction)
      })

      it('Insert false', async function () {
        const itemToInsert = false
        await successfulInsertSingleItem(itemToInsert, this.test.userbase, insideTransaction)
      })

      it('Insert true', async function () {
        const itemToInsert = true
        await successfulInsertSingleItem(itemToInsert, this.test.userbase, insideTransaction)
      })

      it('Insert empty array', async function () {
        const itemToInsert = []
        await successfulInsertSingleItem(itemToInsert, this.test.userbase, insideTransaction)
      })

      it('Insert array with 1 element', async function () {
        const itemToInsert = ['hello world']
        await successfulInsertSingleItem(itemToInsert, this.test.userbase, insideTransaction)
      })

      it('Insert empty object', async function () {
        const itemToInsert = {}
        await successfulInsertSingleItem(itemToInsert, this.test.userbase, insideTransaction)
      })

      it('Insert object with 1 key set to null', async function () {
        const itemToInsert = { testKey: null }
        await successfulInsertSingleItem(itemToInsert, this.test.userbase, insideTransaction)
      })

      it('Update to null', async function () {
        const itemToUpdate = null
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase, insideTransaction)
      })

      it('Update to 0 length string', async function () {
        const itemToUpdate = ''
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase, insideTransaction)
      })

      it('Update to string', async function () {
        const itemToUpdate = 'Hello, world!'
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase, insideTransaction)
      })

      it('Update to 0', async function () {
        const itemToUpdate = 0
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase, insideTransaction)
      })

      it('Update to 1', async function () {
        const itemToUpdate = 1
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase, insideTransaction)
      })

      it('Update to false', async function () {
        const itemToUpdate = false
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase, insideTransaction)
      })

      it('Update to true', async function () {
        const itemToUpdate = true
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase, insideTransaction)
      })

      it('Update to empty array', async function () {
        const itemToUpdate = []
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase, insideTransaction)
      })

      it('Update to array with 1 element', async function () {
        const itemToUpdate = ['hello world']
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase, insideTransaction)
      })

      it('Update to empty object', async function () {
        const itemToUpdate = {}
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase, insideTransaction)
      })

      it('Update to object with 1 key set to null', async function () {
        const itemToUpdate = { testKey: null }
        await successfulUpdateSingleItem(itemToUpdate, this.test.userbase, insideTransaction)
      })

    })

    describe('Failure Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Params as false', async function () {
        try {
          await this.test.userbase.putTransaction(false)
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ParamsMustBeObject')
          expect(e.message, 'error message').to.equal('Parameters passed to function must be placed inside an object.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database not open', async function () {
        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Insert', item: 'test-item', itemId: 'fake-id' }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNotOpen')
          expect(e.message, 'error message').to.equal('Database is not open.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name missing', async function () {
        try {
          await this.test.userbase.putTransaction({ operations: [{ command: 'Insert', item: 'test-item', itemId: 'fake-id' }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMissing')
          expect(e.message, 'error message').to.equal('Database name missing.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name as false', async function () {
        try {
          await this.test.userbase.putTransaction({ databaseName: false, operations: [{ command: 'Insert', item: 'test-item', itemId: 'fake-id' }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMustBeString')
          expect(e.message, 'error message').to.equal('Database name must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name as null', async function () {
        try {
          await this.test.userbase.putTransaction({ databaseName: null, operations: [{ command: 'Insert', item: 'test-item', itemId: 'fake-id' }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMustBeString')
          expect(e.message, 'error message').to.equal('Database name must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name as 0 length string', async function () {
        try {
          await this.test.userbase.putTransaction({ databaseName: '', operations: [{ command: 'Insert', item: 'test-item', itemId: 'fake-id' }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameCannotBeBlank')
          expect(e.message, 'error message').to.equal('Database name cannot be blank.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name too long', async function () {
        try {
          await this.test.userbase.putTransaction({ databaseName: 'a'.repeat(51), operations: [{ command: 'Insert', item: 'test-item', itemId: 'fake-id' }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameTooLong')
          expect(e.message, 'error message').to.equal('Database name cannot be more than 50 characters.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Insert with item id as false', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Insert', item: 'test-item', itemId: false }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdMustBeString')
          expect(e.message, 'error message').to.equal('Item id must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Insert with item id as 0 length string', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Insert', item: 'test-item', itemId: '' }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdCannotBeBlank')
          expect(e.message, 'error message').to.equal('Item id cannot be blank.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Insert with item id too long', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Insert', item: 'test-item', itemId: 'a'.repeat(101) }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdTooLong')
          expect(e.message, 'error message').to.equal('Item id cannot be more than 100 characters.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Insert with item missing', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Insert' }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemMissing')
          expect(e.message, 'error message').to.equal('Item missing.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Insert with item undefined', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Insert', item: undefined }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemInvalid')
          expect(e.message, 'error message').to.equal('Item must be serializable to JSON.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Insert with item as function', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Insert', item: () => { } }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemInvalid')
          expect(e.message, 'error message').to.equal('Item must be serializable to JSON.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Insert with item too large', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const MAX_BYTE_SIZE = 10 * 1024
        const item = getStringOfByteLength(MAX_BYTE_SIZE)

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Insert', item }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemTooLarge')
          expect(e.message, 'error message').to.equal('Item must be less than 10 KB.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Update with item id as false', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Update', item: 'test-item', itemId: false }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdMustBeString')
          expect(e.message, 'error message').to.equal('Item id must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Update with item id missing', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Update', item: 'test-item' }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdMissing')
          expect(e.message, 'error message').to.equal('Item id missing.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Update with item id as 0 length string', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Update', item: 'test-item', itemId: '' }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdCannotBeBlank')
          expect(e.message, 'error message').to.equal('Item id cannot be blank.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Update with item id too long', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Update', item: 'test-item', itemId: 'a'.repeat(101) }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemIdTooLong')
          expect(e.message, 'error message').to.equal('Item id cannot be more than 100 characters.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Update with item missing', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Update' }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemMissing')
          expect(e.message, 'error message').to.equal('Item missing.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Update with item undefined', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const itemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: 'test-item', itemId })

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Update', item: undefined, itemId }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemInvalid')
          expect(e.message, 'error message').to.equal('Item must be serializable to JSON.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Update with item as function', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const itemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: 'test-item', itemId })

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Update', item: () => { }, itemId }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemInvalid')
          expect(e.message, 'error message').to.equal('Item must be serializable to JSON.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Update with item too large', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const itemId = 'test-id'
        await this.test.userbase.insertItem({ databaseName, item: 'test-item', itemId })

        const MAX_BYTE_SIZE = 10 * 1024
        const item = getStringOfByteLength(MAX_BYTE_SIZE)

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Update', item, itemId }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemTooLarge')
          expect(e.message, 'error message').to.equal('Item must be less than 10 KB.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Update item that does not exist', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command: 'Update', item: false, itemId: 'fake-item-id' }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ItemDoesNotExist')
          expect(e.message, 'error message').to.equal('Item with the provided id does not exist.')
          expect(e.status, 'error status').to.equal(404)
        }
      })

      it('Operations missing', async function () {
        try {
          await this.test.userbase.putTransaction({ databaseName })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('OperationsMissing')
          expect(e.message, 'error message').to.equal('Operations missing.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Operations must be array', async function () {
        try {
          await this.test.userbase.putTransaction({ databaseName, operations: false })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('OperationsMustBeArray')
          expect(e.message, 'error message').to.equal('Operations provided must be an array.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Operations conflict', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const itemId = 'test-item-id'

        try {
          await this.test.userbase.putTransaction({
            databaseName,
            operations: [
              { command: 'Insert', item: false, itemId },
              { command: 'Insert', item: true, itemId },
            ]
          })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('OperationsConflict')
          expect(e.message, 'error message').to.equal('Operations conflict. Only allowed 1 operation per item.')
          expect(e.status, 'error status').to.equal(409)
        }
      })

      it('Operations exceed limit', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const limit = 10

        const operations = []
        for (let i = 0; i <= limit; i++) {
          operations.push({ command: 'Insert', item: i, itemId: i.toString() })
        }

        try {
          await this.test.userbase.putTransaction({ databaseName, operations })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('OperationsExceedLimit')
          expect(e.message, 'error message').to.equal(`Operations exceed limit. Only allowed ${limit} operations.`)
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Command missing', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ item: false, itemId: 'fake-item-id' }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('CommandNotRecognized')
          expect(e.message, 'error message').to.equal(`Command '${undefined}' not recognized.`)
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Command as false', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const command = false

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command, item: false, itemId: 'fake-item-id' }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('CommandNotRecognized')
          expect(e.message, 'error message').to.equal(`Command '${command}' not recognized.`)
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Command incorrect', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const command = 'fake-command'

        try {
          await this.test.userbase.putTransaction({ databaseName, operations: [{ command, item: false, itemId: 'fake-item-id' }] })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('CommandNotRecognized')
          expect(e.message, 'error message').to.equal(`Command '${command}' not recognized.`)
          expect(e.status, 'error status').to.equal(400)
        }
      })

    })

  })

  describe('Get Databases', function () {
    describe('Success Tests', function () {

      beforeEach(function () { beforeEachHook() })

      it('Get 0 Databases', async function () {
        const databasesResult = await this.test.userbase.getDatabases()
        expect(databasesResult, 'result structure').to.have.key('databases')
        expect(databasesResult.databases, 'databases result').to.be.an('array').that.has.lengthOf(0)
      })

      it('Get 1 Database', async function () {
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        const databasesResult = await this.test.userbase.getDatabases()

        expect(databasesResult, 'result structure').to.have.key('databases')
        expect(databasesResult.databases, 'databases result').to.be.an('array').that.has.lengthOf(1)

        const database = databasesResult.databases[0]
        expect(database, 'database name').to.deep.equal({
          databaseName,
          databaseId: database.databaseId,
          isOwner: true,
          readOnly: false,
          resharingAllowed: true,
          users: []
        })

        await this.test.userbase.deleteUser()
      })

      it('Get 10 Databases', async function () {
        const numDatabases = 10
        const createdDatabases = {}
        const openDatabases = []
        for (let i = 0; i < numDatabases; i++) {
          openDatabases.push(this.test.userbase.openDatabase({ databaseName: databaseName + i, changeHandler: () => { } }))
          createdDatabases[databaseName + i] = true
        }
        await Promise.all(openDatabases)

        const databasesResult = await this.test.userbase.getDatabases()

        expect(databasesResult, 'result structure').to.have.key('databases')
        expect(databasesResult.databases, 'databases result').to.be.an('array').that.has.lengthOf(numDatabases)

        for (let i = 0; i < numDatabases; i++) {
          const database = databasesResult.databases[i]

          expect(database, 'database keys').to.have.keys(['databaseName', 'databaseId', 'isOwner', 'readOnly', 'resharingAllowed', 'users'])
          const { isOwner, readOnly, resharingAllowed, users } = database
          expect(isOwner, 'isOwner').to.be.true
          expect(readOnly, 'readOnly').to.be.false
          expect(resharingAllowed, 'resharingAllowe').to.be.true
          expect(users, 'users').to.deep.equal([])

          const databaseName = database.databaseName

          expect(createdDatabases[databaseName], 'created database and was not already found').to.be.true
          createdDatabases[databaseName] = false
        }

        await this.test.userbase.deleteUser()
      })

      it('Get 1 Database using database name', async function () {
        await Promise.all([
          this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } }),

          // spice test up with an extra database
          this.test.userbase.openDatabase({ databaseName: databaseName + '-1', changeHandler: () => { } }),
        ])

        const databasesResult = await this.test.userbase.getDatabases({ databaseName })

        expect(databasesResult, 'result structure').to.have.key('databases')
        expect(databasesResult.databases, 'databases result').to.be.an('array').that.has.lengthOf(1)

        const database = databasesResult.databases[0]
        expect(database, 'database name').to.deep.equal({
          databaseName,
          databaseId: database.databaseId,
          isOwner: true,
          readOnly: false,
          resharingAllowed: true,
          users: []
        })

        await this.test.userbase.deleteUser()
      })

      it('Get 1 Database using database ID', async function () {
        // User A
        const { username, password } = this.test

        // User B user must share database with User A
        await this.test.userbase.signOut()
        const usernameB = 'test-user-' + getRandomString()
        const passwordB = getRandomString()

        await this.test.userbase.signUp({
          username: usernameB,
          password: passwordB,
          rememberMe: 'none'
        })
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } }),
          await this.test.userbase.shareDatabase({ username, databaseName, requireVerified: false })
        await this.test.userbase.signOut()

        await this.test.userbase.signIn({ username, password, rememberMe: 'none' })

        // first call getDatabases() to find the databaseId
        const initDatabasesResult = await this.test.userbase.getDatabases()
        const databaseId = initDatabasesResult.databases[0].databaseId

        // open a database to spice up test
        await this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } })

        // now call getDatabases() using databaseId
        const databasesResult = await this.test.userbase.getDatabases({ databaseId })

        expect(databasesResult, 'result structure').to.have.key('databases')
        expect(databasesResult.databases, 'databases result').to.be.an('array').that.has.lengthOf(1)

        const database = databasesResult.databases[0]
        expect(database, 'database name').to.deep.equal({
          databaseName,
          databaseId,
          isOwner: false,
          readOnly: true,
          resharingAllowed: false,
          receivedFromUsername: usernameB,
          users: [{
            username: usernameB,
            isOwner: true,
            readOnly: false,
            resharingAllowed: true,
          }]
        })

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: usernameB, password: passwordB, rememberMe: 'none' })
        await this.test.userbase.deleteUser()
      })

      it('Get 1 Database using database ID, for my own database', async function () {
        await Promise.all([
          this.test.userbase.openDatabase({ databaseName, changeHandler: () => { } }),

          // spice test up with an extra database
          this.test.userbase.openDatabase({ databaseName: databaseName + '-1', changeHandler: () => { } }),
        ])

        const { databases: allDatabases } = await this.test.userbase.getDatabases()
        const databaseId = allDatabases.find(db => db.databaseName === databaseName).databaseId

        const databasesResult = await this.test.userbase.getDatabases({ databaseId })
        expect(databasesResult, 'result structure').to.have.key('databases')
        expect(databasesResult.databases, 'databases result').to.be.an('array').that.has.lengthOf(1)

        const database = databasesResult.databases[0]
        expect(database, 'database').to.deep.equal({
          databaseName,
          databaseId: database.databaseId,
          isOwner: true,
          readOnly: false,
          resharingAllowed: true,
          users: []
        })

        await this.test.userbase.deleteUser()
      })

      it('Get 0 Databases using database name', async function () {
        const databasesResult = await this.test.userbase.getDatabases({ databaseName })

        expect(databasesResult, 'result structure').to.have.key('databases')
        expect(databasesResult.databases, 'databases result').to.be.an('array').that.has.lengthOf(0)

        await this.test.userbase.deleteUser()
      })

      it('Get 0 Databases using database ID', async function () {
        const databaseId = '3a041059-5809-4d90-bc57-8686e3c8ba8e' // made up
        const databasesResult = await this.test.userbase.getDatabases({ databaseId })

        expect(databasesResult, 'result structure').to.have.key('databases')
        expect(databasesResult.databases, 'databases result').to.be.an('array').that.has.lengthOf(0)

        await this.test.userbase.deleteUser()
      })

    })

    describe('Failure Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Params as false', async function () {
        try {
          await this.test.userbase.getDatabases(false)
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('ParamsMustBeObject')
          expect(e.message, 'error message').to.equal('Parameters passed to function must be placed inside an object.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name as false', async function () {
        try {
          await this.test.userbase.getDatabases({ databaseName: false })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMustBeString')
          expect(e.message, 'error message').to.equal('Database name must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name as null', async function () {
        try {
          await this.test.userbase.getDatabases({ databaseName: null })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameMustBeString')
          expect(e.message, 'error message').to.equal('Database name must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name as 0 length string', async function () {
        try {
          await this.test.userbase.getDatabases({ databaseName: '' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameCannotBeBlank')
          expect(e.message, 'error message').to.equal('Database name cannot be blank.')
          expect(e.status, 'error status').to.equal(400)
        }
      })

      it('Database name too long', async function () {
        try {
          await this.test.userbase.getDatabases({ databaseName: 'a'.repeat(51) })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('DatabaseNameTooLong')
          expect(e.message, 'error message').to.equal('Database name cannot be more than 50 characters.')
          expect(e.status, 'error status').to.equal(400)
        }
      })
    })

  })

})
