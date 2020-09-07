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
        expect(items[0].item).to.deep.equal(testItem)
        changeHandlerCallCount += 1
      }

      await this.test.userbase.openDatabase({ databaseName, changeHandler })

      expect(changeHandlerCallCount, 'changeHandler called correct number of times').to.equal(1)

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Correctly sets updatedBy', async function () {

    })

    it('Correctly sets fileUploadedBy', async function () {

    })

    it('Correctly sets attribution for multi-operation transactions', async function () {

    })
  })

  describe('Documents others inserted', function () {
    it('Correctly sets attribution on documents that were already here', async function () {

    })

    it('Correctly sets attribution on new documents I receive', async function () {

    })

    it('Only updates updatedBy, while leaving createdBy the same', async function () {

    })

    it('Updates fileUploadedBy', async function () {

    })

    it('Shows userDeleted for documents from a deleted user', async function () {

    })

    it('Shows updated username after attributed user updates their name', async function () {

    })
  })

  // must check the server logs to verify bundling occurs
  describe('Bundled documents', function () {
    it('Retains attribution for bundled documents', async function () {

    })

    it('Bundled documents still have correct attribution after user changes their username', async function () {

    })

    it('Bundled documents still have correct attribution after user is deleted', async function () {

    })
  })
})
