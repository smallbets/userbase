import { getRandomString } from '../../support/utils'

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

  describe('Open Database', function () {

    describe('Synchronous Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Open 1 Database', async function () {
        let changeHandlerCallCount = 0

        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')
          expect(items, 'array passed to changeHandler').to.be.empty

          changeHandlerCallCount += 1
        }
        await this.test.userbase.openDatabase({ databaseName, changeHandler })

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)
      })

      it('Open 2 Databases sequentially with the same name', async function () {
        let changeHandler1CallCount = 0
        let changeHandler2CallCount = 0

        const changeHandler1 = function () {
          changeHandler1CallCount += 1
        }

        const changeHandler2 = function () {
          changeHandler2CallCount += 1
        }

        await this.test.userbase.openDatabase({ databaseName, changeHandler: changeHandler1 })
        await this.test.userbase.openDatabase({ databaseName, changeHandler: changeHandler2 })

        expect(changeHandler1CallCount, 'changeHandler 1 called correct number of times').to.equal(1)
        expect(changeHandler2CallCount, 'changeHandler 2 called correct number of times').to.equal(1)
      })

      it('Open 10 Databases sequentially', async function () {
        const numDatabases = 10

        let changeHandlerCallCount = 0

        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')
          expect(items, 'array passed to changeHandler').to.be.empty

          changeHandlerCallCount += 1
        }

        for (let i = 0; i < numDatabases; i++) {
          await this.test.userbase.openDatabase({ databaseName: databaseName + i, changeHandler })
        }

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(10)
      })
    })

    describe('Concurrency Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Open 100 different Databases concurrently', async function () {
        const numDatabases = 100

        let changeHandlerCallCount = 0

        const changeHandler = function (items) {
          expect(items, 'array passed to changeHandler').to.be.a('array')
          expect(items, 'array passed to changeHandler').to.be.empty

          changeHandlerCallCount += 1
        }

        const promises = []
        for (let i = 0; i < numDatabases; i++) {
          promises.push(this.test.userbase.openDatabase({ databaseName: databaseName + i, changeHandler }))
        }
        await Promise.all(promises)

        expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(numDatabases)
      })

      it('Open the same 100 Databases concurrently', async function () {
        const numDatabases = 100

        const successfulChangeHandlersCalled = []

        const openDatabasePromises = []

        for (let i = 0; i < numDatabases; i++) {
          const changeHandler = function (items) {
            expect(items, 'array passed to changeHandler').to.be.a('array')
            expect(items, 'array passed to changeHandler').to.be.empty

            successfulChangeHandlersCalled.push(i)
          }

          openDatabasePromises.push(this.test.userbase.openDatabase({ databaseName, changeHandler }))
        }

        // all calls to openDatabase should succeed
        await Promise.all(openDatabasePromises)

        // but there should only be 1 changeHandler called 1 time, and it should be the final database's changeHandler
        expect(successfulChangeHandlersCalled.length).to.equal(1)
        expect(successfulChangeHandlersCalled[0]).to.equal(numDatabases - 1)
      })

    })

  })

})
