import { getRandomString } from '../support/utils'

const TEN_SECONDS = 1000 * 10
const ONE_HOUR = 60 * 60 * 1000
const TWENTY_FOUR_HOURS = 24 * ONE_HOUR

const beforeEachHook = function () {
  cy.visit('./cypress/integration/index.html').then(async function (win) {
    expect(win).to.have.property('userbase')
    const userbase = win.userbase
    this.currentTest.userbase = userbase

    const { appId, endpoint } = Cypress.env()
    win._userbaseEndpoint = endpoint
    userbase.init({ appId })
  })
}

describe('Sign Up Tests', function () {

  describe('Success Tests', function () {
    beforeEach(function () { beforeEachHook() })

    it('Default', async function () {
      const username = 'test-user-' + getRandomString()
      const password = getRandomString()

      const startTime = Date.now()

      const user = await this.test.userbase.signUp({
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
      const username = 'test-user-' + getRandomString()
      const password = getRandomString()

      const startTime = Date.now()

      const user = await this.test.userbase.signUp({
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
      const username = 'test-user-' + getRandomString()
      const password = getRandomString()

      const startTime = Date.now()

      const user = await this.test.userbase.signUp({
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

    it('Set email', async function () {
      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const email = 'test@email.com'

      const startTime = Date.now()

      const user = await this.test.userbase.signUp({
        username,
        password,
        email,
        rememberMe: 'none',
      })

      // expected return values
      expect(user, 'result').to.deep.equal({
        username,
        email,
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

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Set profile', async function () {
      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const profile = { key: 'value' }

      const startTime = Date.now()

      const user = await this.test.userbase.signUp({
        username,
        password,
        profile,
        rememberMe: 'none',
      })

      // expected return values
      expect(user, 'result').to.deep.equal({
        username,
        profile,
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

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Set profile with max keys', async function () {
      const username = 'test-user-' + getRandomString()
      const password = getRandomString()

      const profile = {}
      const MAX_KEYS = 100
      for (let i = 0; i < MAX_KEYS; i++) {
        profile[i] = i.toString()
      }

      const startTime = Date.now()

      const user = await this.test.userbase.signUp({
        username,
        password,
        profile,
        rememberMe: 'none',
      })

      // expected return values
      expect(user, 'result').to.deep.equal({
        username,
        profile,
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

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Set email + profile', async function () {
      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const email = 'test@email.com'
      const profile = { key: 'value' }

      const startTime = Date.now()

      const user = await this.test.userbase.signUp({
        username,
        password,
        email,
        profile,
        rememberMe: 'none',
      })

      // expected return values
      expect(user, 'result').to.deep.equal({
        username,
        email,
        profile,
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

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Set session length', async function () {
      const username = 'test-user-' + getRandomString()
      const password = getRandomString()

      const NUM_HOURS = 1
      const HOURS_MS = NUM_HOURS * ONE_HOUR

      const startTime = Date.now()

      const user = await this.test.userbase.signUp({
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
      const username = 'test-user-' + getRandomString()
      const password = getRandomString()

      const NUM_HOURS = 365 * 24
      const HOURS_MS = NUM_HOURS * ONE_HOUR

      const startTime = Date.now()

      const user = await this.test.userbase.signUp({
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
    beforeEach(function () { beforeEachHook() })

    it('Missing params object', async function () {
      try {
        await this.test.userbase.signUp()
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ParamsMustBeObject')
        expect(e.message, 'error message').to.equal('Parameters passed to function must be placed inside an object.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Incorrect params type', async function () {
      try {
        await this.test.userbase.signUp(false)
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ParamsMustBeObject')
        expect(e.message, 'error message').to.equal('Parameters passed to function must be placed inside an object.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Username missing', async function () {
      try {
        await this.test.userbase.signUp({ password: 'test-pass' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('UsernameMissing')
        expect(e.message, 'error message').to.equal('Username missing.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Username already exists', async function () {
      const randomUser1 = 'test-user-' + getRandomString()
      const password = getRandomString()
      const rememberMe = 'none'

      await this.test.userbase.signUp({
        username: randomUser1,
        password,
        rememberMe
      })
      await this.test.userbase.signOut()

      try {
        await this.test.userbase.signUp({
          username: randomUser1,
          password,
          rememberMe
        })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('UsernameAlreadyExists')
        expect(e.message, 'error message').to.equal('Username already exists.')
        expect(e.status, 'error status').to.equal(409)
      }

      // clean up
      await this.test.userbase.signIn({
        username: randomUser1,
        password,
        rememberMe
      })
      await this.test.userbase.deleteUser()
    })

    it('Blank username', async function () {
      try {
        await this.test.userbase.signUp({ username: '', password: 'test-pass' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('UsernameCannotBeBlank')
        expect(e.message, 'error message').to.equal('Username cannot be blank.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Username must be string', async function () {
      try {
        await this.test.userbase.signUp({ username: false, password: 'test-pass' })
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
        await this.test.userbase.signUp({
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
        await this.test.userbase.signUp({ username })
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
        await this.test.userbase.signUp({ username, password: 1 })
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
        await this.test.userbase.signUp({ username, password: '' })
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
        await this.test.userbase.signUp({ username, password: 'pass' })
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
        await this.test.userbase.signUp({ username, password: 'a'.repeat(1001) })
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
        await this.test.userbase.signUp({ username, password: 'test-pass', rememberMe: 'invalid' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('RememberMeValueNotValid')
        expect(e.message, 'error message').to.equal(`Remember me value must be one of ["local","session","none"].`)
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Profile must be object', async function () {
      try {
        const username = 'test-user-' + getRandomString()
        await this.test.userbase.signUp({ username, password: 'test-pass', profile: 123 })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ProfileMustBeObject')
        expect(e.message, 'error message').to.equal('Profile must be a flat JSON object.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Profile empty', async function () {
      try {
        const username = 'test-user-' + getRandomString()
        await this.test.userbase.signUp({ username, password: 'test-pass', profile: {} })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ProfileCannotBeEmpty')
        expect(e.message, 'error message').to.equal('Profile cannot be empty.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Profile has too many keys', async function () {
      const profile = {}
      const MAX_KEYS = 100
      for (let i = 0; i <= MAX_KEYS; i++) {
        profile[i] = i.toString()
      }

      try {
        const username = 'test-user-' + getRandomString()
        await this.test.userbase.signUp({ username, password: 'test-pass', profile })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ProfileHasTooManyKeys')
        expect(e.message, 'error message').to.equal(`Profile has too many keys. Must have a max of ${MAX_KEYS} keys.`)
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Profile key too long', async function () {
      const key = 'a'.repeat(21)

      try {
        const username = 'test-user-' + getRandomString()
        await this.test.userbase.signUp({ username, password: 'test-pass', profile: { [key]: 'hello' } })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ProfileKeyTooLong')
        expect(e.message, 'error message').to.equal('Profile key too long. Must be a max of 20 characters.')
        expect(e.status, 'error status').to.equal(400)
        expect(e.key, 'error key').to.equal(key)
      }
    })

    it('Profile value must be string', async function () {
      const key = 'nest'
      const value = {}

      try {
        const username = 'test-user-' + getRandomString()
        await this.test.userbase.signUp({ username, password: 'test-pass', profile: { [key]: value } })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ProfileValueMustBeString')
        expect(e.message, 'error message').to.equal('Profile value must be a string.')
        expect(e.status, 'error status').to.equal(400)
        expect(e.key, 'error key').to.equal(key)
        expect(e.value, 'error value').to.equal(value)
      }
    })

    it('Profile value too long', async function () {
      const key = 'nest'
      const value = 'a'.repeat(1001)

      try {
        const username = 'test-user-' + getRandomString()
        await this.test.userbase.signUp({ username, password: 'test-pass', profile: { [key]: value } })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ProfileValueTooLong')
        expect(e.message, 'error message').to.equal('Profile value too long. Must be a max of 1000 characters.')
        expect(e.status, 'error status').to.equal(400)
        expect(e.key, 'error key').to.equal(key)
        expect(e.value, 'error value').to.equal(value)
      }
    })

    it('Email not valid', async function () {
      try {
        const username = 'test-user-' + getRandomString()
        await this.test.userbase.signUp({ username, password: 'test-pass', email: 'd' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('EmailNotValid')
        expect(e.message, 'error message').to.equal('Email not valid.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Session length must be number', async function () {
      try {
        const username = 'test-user-' + getRandomString()
        await this.test.userbase.signUp({ username, password: 'test-pass', sessionLength: false })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('SessionLengthMustBeNumber')
        expect(e.message, 'error message').to.equal('Session length must be a number.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Session length too short', async function () {
      try {
        const username = 'test-user-' + getRandomString()
        await this.test.userbase.signUp({ username, password: 'test-pass', sessionLength: 0.001 })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('SessionLengthTooShort')
        expect(e.message, 'error message').to.equal(`Session length cannot be shorter than 5 minutes.`)
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Session length too long', async function () {
      try {
        const username = 'test-user-' + getRandomString()
        const sessionLength = (365 * 24) + 1
        await this.test.userbase.signUp({ username, password: 'test-pass', sessionLength })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('SessionLengthTooLong')
        expect(e.message, 'error message').to.equal(`Session length cannot be longer than 1 year.`)
        expect(e.status, 'error status').to.equal(400)
      }
    })

  })

})
