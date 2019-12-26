describe('DB Correctness Tests', function () {
  let userbase

  before(function () {
    cy.visit('./cypress/integration/index.html').then(function (win) {
      expect(win).to.have.property('userbase')
      userbase = win.userbase

      const { appId, endpoint } = Cypress.env()
      userbase.init({ appId, endpoint })
    })
  })

  beforeEach(async function () {
    const randomUser = 'test-user-' + Math.random().toString().substring(2)
    const password = Math.random().toString().substring(2)
    const email = null
    const profile = null
    const showKeyHandler = () => { }
    const rememberMe = false
    const backUpKey = true

    await userbase.signUp(randomUser, password, email, profile, showKeyHandler, rememberMe, backUpKey)
  })

  afterEach(async function () {
    await userbase.signOut()
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

    await userbase.openDatabase(dbName, spyChangeHandler.changeHandler)

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
          expect(insertedItem).to.be.an('object').that.has.all.keys('itemId', 'item')

          const { itemId, item } = insertedItem

          expect(itemId).to.be.a('string')
          expect(item).to.deep.equal(itemToInsert)
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await userbase.insertItem(dbName, itemToInsert)

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
          expect(insertedItem).to.be.an('object').that.has.all.keys('itemId', 'item')

          const { itemId, item } = insertedItem

          expect(itemId).to.equal(testItemId)
          expect(item).to.deep.equal(itemToInsert)
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await userbase.insertItem(dbName, itemToInsert, testItemId)

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
          expect(updatedItem).to.be.an('object').that.has.all.keys('itemId', 'item')

          const { itemId, item } = updatedItem

          expect(itemId).to.equal(testItemId)
          expect(item).to.deep.equal(itemToUpdate)
        }
      }
    }
    const spy = cy.spy(spyChangeHandler, 'changeHandler')

    await userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await userbase.insertItem(dbName, itemToInsert, testItemId)
    await userbase.updateItem(dbName, itemToUpdate, testItemId)

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

    await userbase.openDatabase(dbName, spyChangeHandler.changeHandler)
    await userbase.insertItem(dbName, itemToInsert, testItemId)
    await userbase.deleteItem(dbName, testItemId)

    expect(spy.callCount).to.equal(3)
  })
})
