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

const successfulInsertSingleItem = async function (itemToInsert, userbase) {
  let successful
  let changeHandlerCallCount = 0

  const changeHandler = function (items) {
    changeHandlerCallCount += 1

    if (changeHandlerCallCount === 2) {
      expect(items, 'items array to have correct length').to.have.lengthOf(1)

      const insertedItem = items[0]
      expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId')

      const { item, itemId } = insertedItem
      expect(item, 'item in items array passed to changeHandler').to.deep.equal(itemToInsert)
      expect(itemId, 'item ID of item in items array passed to changeHandler').to.be.a('string')

      successful = true
    }
  }

  await userbase.openDatabase({ databaseName, changeHandler })
  await userbase.insertItem({ databaseName, item: itemToInsert })

  expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(2)
  expect(successful, 'successful state').to.be.true
}

const successfulUpdateSingleItem = async function (itemToUpdate, userbase) {
  let successful
  let changeHandlerCallCount = 0

  const testItemId = 'test-id'

  const changeHandler = function (items) {
    changeHandlerCallCount += 1

    if (changeHandlerCallCount === 3) {
      expect(items, 'items array to have correct length').to.have.lengthOf(1)

      const insertedItem = items[0]
      expect(insertedItem, 'item in items array passed to changeHandler').to.be.an('object').that.has.all.keys('item', 'itemId')

      const { item, itemId } = insertedItem
      expect(item, 'item in items array passed to changeHandler').to.deep.equal(itemToUpdate)
      expect(itemId, 'item ID of item in items array passed to changeHandler').to.equal(testItemId)

      successful = true
    }
  }

  await userbase.openDatabase({ databaseName, changeHandler })
  await userbase.insertItem({ databaseName, item: 'hello world', itemId: testItemId })
  await userbase.updateItem({ databaseName, item: itemToUpdate, itemId: testItemId })

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

      it('Database params as false', async function () {
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
          expect(e.name, 'error name').to.equal('ItemCannotBeUndefined')
          expect(e.message, 'error message').to.equal('Item cannot be undefined.')
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

      it('Database params as false', async function () {
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
          expect(e.name, 'error name').to.equal('ItemCannotBeUndefined')
          expect(e.message, 'error message').to.equal('Item cannot be undefined.')
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

})
