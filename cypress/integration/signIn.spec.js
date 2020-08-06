import { getRandomString } from '../support/utils'

const TEN_SECONDS = 1000 * 10
const ONE_HOUR = 60 * 60 * 1000
const TWENTY_FOUR_HOURS = 24 * ONE_HOUR

const beforeEachHook = function (signUp = true) {
  cy.visit('./cypress/integration/index.html').then(async function (win) {
    expect(win).to.have.property('userbase')
    const userbase = win.userbase
    this.currentTest.userbase = userbase

    const { appId, endpoint } = Cypress.env()
    win._userbaseEndpoint = endpoint
    userbase.init({ appId })

    if (signUp) {
      const username = 'test-user-' + getRandomString()
      const password = getRandomString()

      await userbase.signUp({
        username,
        password,
        rememberMe: 'none'
      })
      await userbase.signOut()

      this.currentTest.username = username
      this.currentTest.password = password
    }
  })
}

describe('Sign In Tests', function () {

  describe('Success Tests', function () {
    beforeEach(function () { beforeEachHook() })

    it('Default', async function () {
      const { username, password } = this.test

      const startTime = Date.now()

      const user = await this.test.userbase.signIn({
        username,
        password
      })

      // expected return values
      expect(user, 'result').to.deep.equal({
        username,
        paymentsMode: 'disabled',
        userId: user.userId,
        authToken: user.authToken,
        creationDate: user.creationDate,
      })

      const { userId, authToken, creationDate } = user
      const creationTime = new Date(creationDate).getTime()

      expect(userId, 'userId').to.be.a('string').that.has.lengthOf(36)
      expect(authToken, 'authToken').to.be.a('string').that.has.lengthOf(32)
      expect(creationTime, 'creationDate').to.be.within(startTime - TEN_SECONDS, Date.now() + TEN_SECONDS)

      // expected session storage values
      expect(sessionStorage.length, 'sessionStorage length').to.eq(2)
      expect(localStorage.length, 'localStorage length').to.eq(0)

      const userbaseCurrentSessionString = sessionStorage.getItem('userbaseCurrentSession')
      expect(userbaseCurrentSessionString, 'userbaseCurrentSessionString').to.be.a('string')

      const userbaseCurrentSession = JSON.parse(userbaseCurrentSessionString)
      expect(userbaseCurrentSession, 'userbaseCurrentSession').to.deep.equal({
        username,
        signedIn: true,
        sessionId: userbaseCurrentSession.sessionId,
        creationDate: userbaseCurrentSession.creationDate, // this is the session creationDate, not user creationDate from above
        expirationDate: userbaseCurrentSession.expirationDate,
      })

      const { sessionId, expirationDate } = userbaseCurrentSession
      const sessionCreationTime = new Date(userbaseCurrentSession.creationDate).getTime()
      const expirationTime = new Date(expirationDate).getTime()

      expect(sessionId, 'sessionId').to.be.a('string').that.has.lengthOf(32)
      expect(sessionCreationTime, 'session creation date').to.be.within(creationTime - TEN_SECONDS, creationTime + TEN_SECONDS)
      expect(expirationTime, 'expiration date').to.be.within(sessionCreationTime - TEN_SECONDS + TWENTY_FOUR_HOURS, sessionCreationTime + TEN_SECONDS + TWENTY_FOUR_HOURS)

      // clean up
      await this.test.userbase.deleteUser()
      expect(sessionStorage.length, 'sessionStorage length').to.eq(0)
      expect(localStorage.length, 'localStorage length').to.eq(0)
    })

    it('rememberMe=local', async function () {
      const { username, password } = this.test

      const startTime = Date.now()

      const user = await this.test.userbase.signIn({
        username,
        password,
        rememberMe: 'local'
      })

      // expected return values
      expect(user, 'result').to.deep.equal({
        username,
        paymentsMode: 'disabled',
        userId: user.userId,
        authToken: user.authToken,
        creationDate: user.creationDate,
      })

      const { userId, authToken, creationDate } = user
      const creationTime = new Date(creationDate).getTime()

      expect(userId, 'userId').to.be.a('string').that.has.lengthOf(36)
      expect(authToken, 'authToken').to.be.a('string').that.has.lengthOf(32)
      expect(creationTime, 'creationDate').to.be.within(startTime - TEN_SECONDS, Date.now() + TEN_SECONDS)

      // expected local storage values
      expect(sessionStorage.length, 'sessionStorage length').to.eq(0)
      expect(localStorage.length, 'localStorage length').to.eq(2)

      const userbaseCurrentSessionString = localStorage.getItem('userbaseCurrentSession')
      expect(userbaseCurrentSessionString, 'userbaseCurrentSessionString').to.be.a('string')

      const userbaseCurrentSession = JSON.parse(userbaseCurrentSessionString)
      expect(userbaseCurrentSession, 'userbaseCurrentSession').to.deep.equal({
        username,
        signedIn: true,
        sessionId: userbaseCurrentSession.sessionId,
        creationDate: userbaseCurrentSession.creationDate, // this is the session creationDate, not user creationDate from above
        expirationDate: userbaseCurrentSession.expirationDate,
      })

      const { sessionId, expirationDate } = userbaseCurrentSession
      const sessionCreationTime = new Date(userbaseCurrentSession.creationDate).getTime()
      const expirationTime = new Date(expirationDate).getTime()

      expect(sessionId, 'sessionId').to.be.a('string').that.has.lengthOf(32)
      expect(sessionCreationTime, 'session creation date').to.be.within(creationTime - TEN_SECONDS, creationTime + TEN_SECONDS)
      expect(expirationTime, 'expiration date').to.be.within(sessionCreationTime - TEN_SECONDS + TWENTY_FOUR_HOURS, sessionCreationTime + TEN_SECONDS + TWENTY_FOUR_HOURS)

      // clean up
      await this.test.userbase.deleteUser()
      expect(sessionStorage.length, 'sessionStorage length').to.eq(0)
      expect(localStorage.length, 'localStorage length').to.eq(0)
    })

    it('rememberMe=none', async function () {
      const { username, password } = this.test

      const startTime = Date.now()

      const user = await this.test.userbase.signIn({
        username,
        password,
        rememberMe: 'none'
      })

      // expected return values
      expect(user, 'result').to.deep.equal({
        username,
        paymentsMode: 'disabled',
        userId: user.userId,
        authToken: user.authToken,
        creationDate: user.creationDate,
      })

      const { userId, authToken, creationDate } = user
      const creationTime = new Date(creationDate).getTime()

      expect(userId, 'userId').to.be.a('string').that.has.lengthOf(36)
      expect(authToken, 'authToken').to.be.a('string').that.has.lengthOf(32)
      expect(creationTime, 'creationDate').to.be.within(startTime - TEN_SECONDS, Date.now() + TEN_SECONDS)

      // expected local storage values
      expect(sessionStorage.length, 'sessionStorage length').to.eq(0)
      expect(localStorage.length, 'localStorage length').to.eq(0)

      // clean up
      await this.test.userbase.deleteUser()
      expect(sessionStorage.length, 'sessionStorage length').to.eq(0)
      expect(localStorage.length, 'localStorage length').to.eq(0)
    })

    it('Set session length', async function () {
      const { username, password } = this.test

      const NUM_HOURS = 1
      const HOURS_MS = NUM_HOURS * ONE_HOUR

      const startTime = Date.now()

      const user = await this.test.userbase.signIn({
        username,
        password,
        sessionLength: NUM_HOURS,
        rememberMe: 'local'
      })

      // expected return values
      expect(user, 'result').to.deep.equal({
        username,
        paymentsMode: 'disabled',
        userId: user.userId,
        authToken: user.authToken,
        creationDate: user.creationDate,
      })

      const { userId, authToken, creationDate } = user
      const creationTime = new Date(creationDate).getTime()

      expect(userId, 'userId').to.be.a('string').that.has.lengthOf(36)
      expect(authToken, 'authToken').to.be.a('string').that.has.lengthOf(32)
      expect(creationTime, 'creationDate').to.be.within(startTime - TEN_SECONDS, Date.now() + TEN_SECONDS)

      // expected local storage values
      expect(sessionStorage.length, 'sessionStorage length').to.eq(0)
      expect(localStorage.length, 'localStorage length').to.eq(2)

      const userbaseCurrentSessionString = localStorage.getItem('userbaseCurrentSession')
      expect(userbaseCurrentSessionString, 'userbaseCurrentSessionString').to.be.a('string')

      const userbaseCurrentSession = JSON.parse(userbaseCurrentSessionString)
      expect(userbaseCurrentSession, 'userbaseCurrentSession').to.deep.equal({
        username,
        signedIn: true,
        sessionId: userbaseCurrentSession.sessionId,
        creationDate: userbaseCurrentSession.creationDate, // this is the session creationDate, not user creationDate from above
        expirationDate: userbaseCurrentSession.expirationDate,
      })

      const { sessionId, expirationDate } = userbaseCurrentSession
      const sessionCreationTime = new Date(userbaseCurrentSession.creationDate).getTime()
      const expirationTime = new Date(expirationDate).getTime()

      expect(sessionId, 'sessionId').to.be.a('string').that.has.lengthOf(32)
      expect(sessionCreationTime, 'session creation date').to.be.within(creationTime - TEN_SECONDS, creationTime + TEN_SECONDS)
      expect(expirationTime, 'expiration date').to.be.within(sessionCreationTime - TEN_SECONDS + HOURS_MS, sessionCreationTime + TEN_SECONDS + HOURS_MS)

      // clean up
      await this.test.userbase.deleteUser()
      expect(sessionStorage.length, 'sessionStorage length').to.eq(0)
      expect(localStorage.length, 'localStorage length').to.eq(0)
    })

    it('Set session length to max', async function () {
      const { username, password } = this.test

      const NUM_HOURS = 365 * 24
      const HOURS_MS = NUM_HOURS * ONE_HOUR

      const startTime = Date.now()

      const user = await this.test.userbase.signIn({
        username,
        password,
        sessionLength: NUM_HOURS,
        rememberMe: 'local'
      })

      // expected return values
      expect(user, 'result').to.deep.equal({
        username,
        paymentsMode: 'disabled',
        userId: user.userId,
        authToken: user.authToken,
        creationDate: user.creationDate,
      })

      const { userId, authToken, creationDate } = user
      const creationTime = new Date(creationDate).getTime()

      expect(userId, 'userId').to.be.a('string').that.has.lengthOf(36)
      expect(authToken, 'authToken').to.be.a('string').that.has.lengthOf(32)
      expect(creationTime, 'creationDate').to.be.within(startTime - TEN_SECONDS, Date.now() + TEN_SECONDS)

      // expected local storage values
      expect(sessionStorage.length, 'sessionStorage length').to.eq(0)
      expect(localStorage.length, 'localStorage length').to.eq(2)

      const userbaseCurrentSessionString = localStorage.getItem('userbaseCurrentSession')
      expect(userbaseCurrentSessionString, 'userbaseCurrentSessionString').to.be.a('string')

      const userbaseCurrentSession = JSON.parse(userbaseCurrentSessionString)
      expect(userbaseCurrentSession, 'userbaseCurrentSession').to.deep.equal({
        username,
        signedIn: true,
        sessionId: userbaseCurrentSession.sessionId,
        creationDate: userbaseCurrentSession.creationDate, // this is the session creationDate, not user creationDate from above
        expirationDate: userbaseCurrentSession.expirationDate,
      })

      const { sessionId, expirationDate } = userbaseCurrentSession
      const sessionCreationTime = new Date(userbaseCurrentSession.creationDate).getTime()
      const expirationTime = new Date(expirationDate).getTime()

      expect(sessionId, 'sessionId').to.be.a('string').that.has.lengthOf(32)
      expect(sessionCreationTime, 'session creation date').to.be.within(creationTime - TEN_SECONDS, creationTime + TEN_SECONDS)
      expect(expirationTime, 'expiration date').to.be.within(sessionCreationTime - TEN_SECONDS + HOURS_MS, sessionCreationTime + TEN_SECONDS + HOURS_MS)

      // clean up
      await this.test.userbase.deleteUser()
      expect(sessionStorage.length, 'sessionStorage length').to.eq(0)
      expect(localStorage.length, 'localStorage length').to.eq(0)
    })

  })

  describe('Failure Tests', function () {
    beforeEach(function () { beforeEachHook(false) })

    it('Missing params object', async function () {
      try {
        await this.test.userbase.signIn()
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ParamsMustBeObject')
        expect(e.message, 'error message').to.equal('Parameters passed to function must be placed inside an object.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Incorrect params type', async function () {
      try {
        await this.test.userbase.signIn(false)
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ParamsMustBeObject')
        expect(e.message, 'error message').to.equal('Parameters passed to function must be placed inside an object.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Username missing', async function () {
      try {
        await this.test.userbase.signIn({ password: 'test-pass' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('UsernameMissing')
        expect(e.message, 'error message').to.equal('Username missing.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Blank username', async function () {
      try {
        await this.test.userbase.signIn({ username: '', password: 'test-pass' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('UsernameCannotBeBlank')
        expect(e.message, 'error message').to.equal('Username cannot be blank.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Username must be string', async function () {
      try {
        await this.test.userbase.signIn({ username: false, password: 'test-pass' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('UsernameMustBeString')
        expect(e.message, 'error message').to.equal('Username must be a string.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Username too long', async function () {
      const username = 'a'.repeat(101)
      const password = getRandomString()
      const rememberMe = 'none'

      try {
        await this.test.userbase.signIn({
          username,
          password,
          rememberMe
        })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('UsernameTooLong')
        expect(e.message, 'error message').to.equal('Username too long. Must be a max of 100 characters.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Password missing', async function () {
      try {
        const username = 'test-user-' + getRandomString()
        await this.test.userbase.signIn({ username })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('PasswordMissing')
        expect(e.message, 'error message').to.equal('Password missing.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Password must be string', async function () {
      try {
        const username = 'test-user-' + getRandomString()
        await this.test.userbase.signIn({ username, password: 1 })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('PasswordMustBeString')
        expect(e.message, 'error message').to.equal('Password must be a string.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Password blank', async function () {
      try {
        const username = 'test-user-' + getRandomString()
        await this.test.userbase.signIn({ username, password: '' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('PasswordCannotBeBlank')
        expect(e.message, 'error message').to.equal('Password cannot be blank.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Password too short', async function () {
      try {
        const username = 'test-user-' + getRandomString()
        await this.test.userbase.signIn({ username, password: 'pass' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('PasswordTooShort')
        expect(e.message, 'error message').to.equal(`Password too short. Must be a minimum of 6 characters.`)
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Password too long', async function () {
      try {
        const username = 'test-user-' + getRandomString()
        await this.test.userbase.signIn({ username, password: 'a'.repeat(1001) })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('PasswordTooLong')
        expect(e.message, 'error message').to.equal(`Password too long. Must be a max of 1000 characters.`)
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('rememberMe not valid', async function () {
      try {
        const username = 'test-user-' + getRandomString()
        await this.test.userbase.signIn({ username, password: 'test-pass', rememberMe: 'invalid' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('RememberMeValueNotValid')
        expect(e.message, 'error message').to.equal(`Remember me value must be one of ["local","session","none"].`)
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Session length must be number', async function () {
      try {
        const username = 'test-user-' + getRandomString()
        await this.test.userbase.signIn({ username, password: 'test-pass', sessionLength: false })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('SessionLengthMustBeNumber')
        expect(e.message, 'error message').to.equal('Session length must be a number.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Session length too short', async function () {
      const username = 'test-user-' + getRandomString()
      const password = getRandomString()

      await this.test.userbase.signUp({
        username,
        password,
        rememberMe: 'none'
      })
      await this.test.userbase.signOut()

      try {
        await this.test.userbase.signIn({ username, password, sessionLength: 0.001 })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('SessionLengthTooShort')
        expect(e.message, 'error message').to.equal(`Session length cannot be shorter than 5 minutes.`)
        expect(e.status, 'error status').to.equal(400)
      }

      // clean up
      await this.test.userbase.signIn({ username, password, rememberMe: 'none' })
      await this.test.userbase.deleteUser()
    })

    it('Session length too long', async function () {
      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      await this.test.userbase.signUp({
        username,
        password,
        rememberMe: 'none'
      })
      await this.test.userbase.signOut()

      try {
        const sessionLength = (365 * 24) + 1
        await this.test.userbase.signIn({ username, password, sessionLength })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('SessionLengthTooLong')
        expect(e.message, 'error message').to.equal(`Session length cannot be longer than 1 year.`)
        expect(e.status, 'error status').to.equal(400)
      }

      // clean up
      await this.test.userbase.signIn({ username, password, rememberMe: 'none' })
      await this.test.userbase.deleteUser()
    })

  })

})
