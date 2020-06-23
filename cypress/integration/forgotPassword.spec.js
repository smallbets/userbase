import { getRandomString } from '../support/utils'

const beforeHook = function (setAppId) {
  cy.clearLocalStorage()
  sessionStorage.clear()

  cy.visit('./cypress/integration/index.html').then(function (win) {
    expect(win).to.have.property('userbase')
    const userbase = win.userbase
    this.currentTest.userbase = userbase

    const { endpoint } = Cypress.env()
    win._userbaseEndpoint = endpoint

    if (setAppId) setAppId(userbase, this)
  })
}

describe('Forgot Password Tests', function () {

  describe('Correct app initialization', function () {
    beforeEach(function () {
      beforeHook(function (userbase, that) {
        const { appId } = Cypress.env()
        userbase.init({ appId })
        that.currentTest.appId = appId
      })
    })

    it('Default behavior', async function () {
      const username = getRandomString()

      await this.test.userbase.signUp({
        username,
        password: getRandomString(),
        email: `${getRandomString()}@random.com`
      })

      await this.test.userbase.forgotPassword({ username })
    })

    it('rememberMe=session', async function () {
      const username = getRandomString()

      await this.test.userbase.signUp({
        username,
        password: getRandomString(),
        email: `${getRandomString()}@random.com`,
        rememberMe: 'session'
      })

      await this.test.userbase.forgotPassword({ username })
    })

    it('rememberMe=local', async function () {
      const username = getRandomString()

      await this.test.userbase.signUp({
        username,
        password: getRandomString(),
        email: `${getRandomString()}@random.com`,
        rememberMe: 'local'
      })

      await this.test.userbase.forgotPassword({ username })
    })

    it('rememberMe=none', async function () {
      const username = getRandomString()

      await this.test.userbase.signUp({
        username,
        password: getRandomString(),
        email: `${getRandomString()}@random.com`,
        rememberMe: 'none'
      })

      try {
        await this.test.userbase.forgotPassword({ username })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'correct error name').to.equal('KeyNotFound')
      }
    })

    it('Unknown user', async function () {
      const username = getRandomString()

      try {
        await this.test.userbase.forgotPassword({ username })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'correct error name').to.equal('KeyNotFound')
      }
    })

    it('Deleted user', async function () {
      const username = getRandomString()

      await this.test.userbase.signUp({
        username,
        password: getRandomString(),
        email: `${getRandomString()}@random.com`
      })

      await this.test.userbase.deleteUser()

      try {
        await this.test.userbase.forgotPassword({ username })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'correct error name').to.equal('UserNotFound')
      }
    })

    it('No email provided', async function () {
      const username = getRandomString()

      await this.test.userbase.signUp({
        username,
        password: getRandomString()
      })

      try {
        await this.test.userbase.forgotPassword({ username })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'correct error name').to.equal('UserEmailNotFound')
      }
    })

    it('Missing params object', async function () {
      try {
        await this.test.userbase.forgotPassword()
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'correct error name').to.equal('ParamsMustBeObject')
      }
    })

    it('Incorrect params type', async function () {
      try {
        await this.test.userbase.forgotPassword(false)
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'correct error name').to.equal('ParamsMustBeObject')
      }
    })

    it('Missing username', async function () {
      try {
        await this.test.userbase.forgotPassword({})
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'correct error name').to.equal('UsernameMissing')
      }
    })

    it('Blank username', async function () {
      try {
        await this.test.userbase.forgotPassword({ username: '' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'correct error name').to.equal('UsernameCannotBeBlank')
      }
    })

    it('Incorrect username type', async function () {
      try {
        await this.test.userbase.forgotPassword({ username: {} })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'correct error name').to.equal('UsernameMustBeString')
      }
    })

    it('Non-existent user with fake key in local storage', async function () {
      const username = getRandomString()

      localStorage.setItem(`userbaseSeed.${this.test.appId}.${username}`, 'fakekey')

      try {
        await this.test.userbase.forgotPassword({ username })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'correct error name').to.equal('UserNotFound')
      }
    })

    it('Incorrect key', async function () {
      const username = getRandomString()

      await this.test.userbase.signUp({
        username,
        password: getRandomString(),
        email: `${getRandomString()}@random.com`
      })

      sessionStorage.setItem(`userbaseSeed.${this.test.appId}.${username}`, 'ZkeHqIBL5TdW/YpCC323EzdoSLEnudRu20xpyx6GUzY=')

      try {
        await this.test.userbase.forgotPassword({ username })
      } catch (e) {
        expect(e.name, 'correct error name').to.equal('KeyNotFound')
      }
    })

    it('Username too long', async function () {
      const username = 'a'.repeat(101)

      localStorage.setItem(`userbaseSeed.${this.test.appId}.${username}`, 'fakekey')

      try {
        await this.test.userbase.forgotPassword({ username })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'correct error name').to.equal('UsernameTooLong')
      }
    })
  })

  describe('App ID not set', function () {
    beforeEach(function () { beforeHook() })

    it('App ID not set', async function () {
      const username = getRandomString()
      try {
        await this.test.userbase.forgotPassword({ username })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'correct error name').to.equal('AppIdNotSet')
      }
    })
  })

  describe('App ID not valid', function () {
    beforeEach(function () {
      beforeHook(function (userbase, that) {
        const fakeAppId = 'fake-app-id'
        userbase.init({ appId: fakeAppId })
        that.currentTest.appId = fakeAppId
      })
    })

    it('App ID not valid', async function () {
      const username = getRandomString()

      localStorage.setItem(`userbaseSeed.${this.test.appId}.${username}`, 'fakekey')

      try {
        await this.test.userbase.forgotPassword({ username })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'correct error name').to.equal('AppIdNotValid')
      }
    })
  })

})
