import { getRandomString, wait } from '../support/utils'

const beforeEachHook = function (signUp = true) {
  cy.visit('./cypress/integration/index.html').then(async function (win) {
    expect(win).to.have.property('userbase')
    const userbase = win.userbase
    this.currentTest.userbase = userbase

    const { appId, endpoint } = Cypress.env()
    win._userbaseEndpoint = endpoint
    userbase.init({ appId })
    this.currentTest.appId = appId

    if (signUp) {
      const randomUser = 'test-user-' + getRandomString()
      const password = getRandomString()
      const rememberMe = 'none'

      const user = await userbase.signUp({
        username: randomUser,
        password,
        rememberMe
      })

      this.currentTest.user = user
      this.currentTest.password = password
    }
  })
}

describe('Update User Tests', function () {

  describe('Success Tests', function () {
    beforeEach(function () { beforeEachHook() })

    it('Update username', async function () {
      const user = this.test.user
      const startingUsername = user.username
      const updatedUsername = 'test-user-' + getRandomString()

      let success
      const updateUserHandler = function (updatedUserResult) {
        const updatedUser = updatedUserResult.user
        expect(updatedUser.username, 'updated username').to.not.equal(startingUsername)
        expect(updatedUser, 'user object').to.deep.equal({ ...user, username: updatedUsername })
        success = true
      }

      // relies on idempotent call to init
      await this.test.userbase.init({ appId: this.test.appId, updateUserHandler })
      await this.test.userbase.updateUser({ username: updatedUsername })

      expect(success, 'success').to.be.true

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Update profile', async function () {
      const user = this.test.user
      const profile = { hello: 'world!' }

      let success
      const updateUserHandler = function (updatedUserResult) {
        const updatedUser = updatedUserResult.user
        expect(updatedUser, 'user object').to.deep.equal({ ...user, profile })
        success = true
      }

      // relies on idempotent call to init
      await this.test.userbase.init({ appId: this.test.appId, updateUserHandler })
      await this.test.userbase.updateUser({ profile })

      expect(success, 'success').to.be.true

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Update email', async function () {
      const user = this.test.user
      const email = 'test@email.com'

      let success
      const updateUserHandler = function (updatedUserResult) {
        const updatedUser = updatedUserResult.user
        expect(updatedUser, 'user object').to.deep.equal({ ...user, email })
        success = true
      }

      // relies on idempotent call to init
      await this.test.userbase.init({ appId: this.test.appId, updateUserHandler })
      await this.test.userbase.updateUser({ email })

      expect(success, 'success').to.be.true

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Update password', async function () {
      const user = this.test.user

      const currentPassword = this.test.password
      const newPassword = getRandomString()

      let success
      const updateUserHandler = function (updatedUserResult) {
        const updatedUser = updatedUserResult.user
        expect(updatedUser, 'user object').to.deep.equal({ ...user, passwordChanged: true })
        success = true
      }

      // relies on idempotent call to init
      await this.test.userbase.init({ appId: this.test.appId, updateUserHandler })
      await this.test.userbase.updateUser({ currentPassword, newPassword })

      expect(success, 'success').to.be.true

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Sign back in after updating password', async function () {
      const username = this.test.user.username

      const currentPassword = this.test.password
      const newPassword = getRandomString()

      await this.test.userbase.updateUser({ currentPassword, newPassword })
      await this.test.userbase.signOut()

      // signing in with old password should fail
      try {
        await this.test.userbase.signIn({ username, password: currentPassword, rememberMe: 'none' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.status, 'error status').to.equal(401)
        expect(e.name, 'error name').to.equal('UsernameOrPasswordMismatch')
        expect(e.message, 'error message').to.equal('Username or password mismatch.')
      }

      // signing in with new password should succeed
      await this.test.userbase.signIn({ username, password: newPassword, rememberMe: 'none' })

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Update username + profile + email + password', async function () {
      const user = this.test.user

      const username = 'test-user-' + getRandomString()
      const profile = { hello: 'world!' }
      const email = 'test@email.com'

      const currentPassword = this.test.password
      const newPassword = getRandomString()

      let success
      const updateUserHandler = function (updatedUserResult) {
        const updatedUser = updatedUserResult.user
        expect(updatedUser, 'user object').to.deep.equal({ ...user, username, profile, email, passwordChanged: true })
        success = true
      }

      // relies on idempotent call to init
      await this.test.userbase.init({ appId: this.test.appId, updateUserHandler })
      await this.test.userbase.updateUser({ username, profile, email, currentPassword, newPassword })

      expect(success, 'success').to.be.true

      await this.test.userbase.signOut()

      // signing in with old password should fail
      try {
        await this.test.userbase.signIn({ username, password: currentPassword, rememberMe: 'none' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.status, 'error status').to.equal(401)
        expect(e.name, 'error name').to.equal('UsernameOrPasswordMismatch')
        expect(e.message, 'error message').to.equal('Username or password mismatch.')
      }

      // signing in with new password should succeed
      await this.test.userbase.signIn({ username, password: newPassword, rememberMe: 'none' })

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Remove profile', async function () {
      const user = this.test.user

      const profile = { hello: 'world!' }
      await this.test.userbase.updateUser({ profile })

      let success
      const updateUserHandler = function (updatedUserResult) {
        const updatedUser = updatedUserResult.user
        expect(updatedUser, 'user object').to.deep.equal(user)
        expect(updatedUser, 'no profile').to.not.have.key('profile')
        success = true
      }

      // relies on idempotent call to init
      await this.test.userbase.init({ appId: this.test.appId, updateUserHandler })
      await this.test.userbase.updateUser({ profile: null })

      expect(success, 'success').to.be.true

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Remove email', async function () {
      const user = this.test.user

      const email = 'example@email.com'
      await this.test.userbase.updateUser({ email })

      let success
      const updateUserHandler = function (updatedUserResult) {
        const updatedUser = updatedUserResult.user
        expect(updatedUser, 'user object').to.deep.equal(user)
        expect(updatedUser, 'no email').to.not.have.key('email')
        success = true
      }

      // relies on idempotent call to init
      await this.test.userbase.init({ appId: this.test.appId, updateUserHandler })
      await this.test.userbase.updateUser({ email: null })

      expect(success, 'success').to.be.true

      // clean up
      await this.test.userbase.deleteUser()
    })

  })

  describe('Failure Tests', function () {
    beforeEach(function () { beforeEachHook(false) })

    it('Update user handler must be function', async function () {
      try {
        await this.test.userbase.init({ appId: this.test.appId, updateUserHandler: 1 })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('UpdateUserHandlerMustBeFunction')
        expect(e.message, 'error message').to.equal('Update user handler must be a function.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Missing params object', async function () {
      try {
        await this.test.userbase.updateUser()
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ParamsMustBeObject')
        expect(e.message, 'error message').to.equal('Parameters passed to function must be placed inside an object.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Incorrect params type', async function () {
      try {
        await this.test.userbase.updateUser(false)
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ParamsMustBeObject')
        expect(e.message, 'error message').to.equal('Parameters passed to function must be placed inside an object.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Params missing', async function () {
      try {
        await this.test.userbase.updateUser({})
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ParamsMissing')
        expect(e.message, 'error message').to.equal('Parameters expected are missing.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Blank username', async function () {
      try {
        await this.test.userbase.updateUser({ username: '' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('UsernameCannotBeBlank')
        expect(e.message, 'error message').to.equal('Username cannot be blank.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Username must be string', async function () {
      try {
        await this.test.userbase.updateUser({ username: false })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('UsernameMustBeString')
        expect(e.message, 'error message').to.equal('Username must be a string.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Username too long', async function () {
      const randomUser = 'test-user-' + getRandomString()
      const password = getRandomString()
      const rememberMe = 'none'

      await this.test.userbase.signUp({
        username: randomUser,
        password,
        rememberMe
      })

      const username = 'a'.repeat(101)

      try {
        await this.test.userbase.updateUser({ username })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('UsernameTooLong')
        expect(e.message, 'error message').to.equal('Username too long. Must be a max of 100 characters.')
        expect(e.status, 'error status').to.equal(400)
      }

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Username already exists', async function () {
      const randomUser1 = 'test-user-' + getRandomString()
      const randomUser2 = 'test-user-' + getRandomString()
      const password = getRandomString()
      const rememberMe = 'none'

      await this.test.userbase.signUp({
        username: randomUser1,
        password,
        rememberMe
      })
      await this.test.userbase.signOut()

      await this.test.userbase.signUp({
        username: randomUser2,
        password,
        rememberMe
      })

      try {
        await this.test.userbase.updateUser({ username: randomUser1 })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('UsernameAlreadyExists')
        expect(e.message, 'error message').to.equal('Username already exists.')
        expect(e.status, 'error status').to.equal(409)
      }

      // clean up
      await this.test.userbase.deleteUser()
      await this.test.userbase.signIn({
        username: randomUser1,
        password,
        rememberMe
      })
      await this.test.userbase.deleteUser()
    })

    it('Profile must be object', async function () {
      try {
        await this.test.userbase.updateUser({ profile: 123 })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ProfileMustBeObject')
        expect(e.message, 'error message').to.equal('Profile must be a flat JSON object.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Profile empty', async function () {
      try {
        await this.test.userbase.updateUser({ profile: {} })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ProfileCannotBeEmpty')
        expect(e.message, 'error message').to.equal('Profile cannot be empty.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Profile has too many keys', async function () {
      const randomUser = 'test-user-' + getRandomString()
      const password = getRandomString()
      const rememberMe = 'none'

      await this.test.userbase.signUp({
        username: randomUser,
        password,
        rememberMe
      })

      const profile = {}
      const MAX_KEYS = 100
      for (let i = 0; i <= MAX_KEYS; i++) {
        profile[i] = i.toString()
      }

      try {
        await this.test.userbase.updateUser({ profile })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ProfileHasTooManyKeys')
        expect(e.message, 'error message').to.equal(`Profile has too many keys. Must have a max of ${MAX_KEYS} keys.`)
        expect(e.status, 'error status').to.equal(400)
      }

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Profile key too long', async function () {
      const randomUser = 'test-user-' + getRandomString()
      const password = getRandomString()
      const rememberMe = 'none'

      await this.test.userbase.signUp({
        username: randomUser,
        password,
        rememberMe
      })

      const key = 'a'.repeat(21)

      try {
        await this.test.userbase.updateUser({ profile: { [key]: 'hello' } })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ProfileKeyTooLong')
        expect(e.message, 'error message').to.equal('Profile key too long. Must be a max of 20 characters.')
        expect(e.status, 'error status').to.equal(400)
        expect(e.key, 'error key').to.equal(key)
      }

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Profile value must be string', async function () {
      const key = 'nest'
      const value = {}

      try {
        await this.test.userbase.updateUser({ profile: { [key]: value } })
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
      const randomUser = 'test-user-' + getRandomString()
      const password = getRandomString()
      const rememberMe = 'none'

      await this.test.userbase.signUp({
        username: randomUser,
        password,
        rememberMe
      })

      const key = 'nest'
      const value = 'a'.repeat(1001)

      try {
        await this.test.userbase.updateUser({ profile: { [key]: value } })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ProfileValueTooLong')
        expect(e.message, 'error message').to.equal('Profile value too long. Must be a max of 1000 characters.')
        expect(e.status, 'error status').to.equal(400)
        expect(e.key, 'error key').to.equal(key)
        expect(e.value, 'error value').to.equal(value)
      }

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Email not valid', async function () {
      const randomUser = 'test-user-' + getRandomString()
      const password = getRandomString()
      const rememberMe = 'none'

      await this.test.userbase.signUp({
        username: randomUser,
        password,
        rememberMe
      })

      try {
        await this.test.userbase.updateUser({ email: 'd' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('EmailNotValid')
        expect(e.message, 'error message').to.equal('Email not valid.')
        expect(e.status, 'error status').to.equal(400)
      }

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Current password missing', async function () {
      try {
        await this.test.userbase.updateUser({ newPassword: 'new-pass' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('CurrentPasswordMissing')
        expect(e.message, 'error message').to.equal('Current password missing.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Current password incorrect', async function () {
      const randomUser = 'test-user-' + getRandomString()
      const password = getRandomString()
      const rememberMe = 'none'

      await this.test.userbase.signUp({
        username: randomUser,
        password,
        rememberMe
      })

      try {
        await this.test.userbase.updateUser({ currentPassword: 'incorrect', newPassword: 'new-pass' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('CurrentPasswordIncorrect')
        expect(e.message, 'error message').to.equal('Current password is incorrect.')
        expect(e.status, 'error status').to.equal(401)
      }

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Password attempt limit exceeded', async function () {
      const randomUser = 'test-user-' + getRandomString()
      const password = getRandomString()
      const rememberMe = 'none'

      await this.test.userbase.signUp({
        username: randomUser,
        password,
        rememberMe
      })

      for (let i = 0; i < 25; i++) {
        try {
          await this.test.userbase.updateUser({ currentPassword: 'incorrect', newPassword: 'new-pass' })
          throw new Error('should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('CurrentPasswordIncorrect')
          expect(e.message, 'error message').to.equal('Current password is incorrect.')
          expect(e.status, 'error status').to.equal(401)
        }

        // cooldown for rate limiter
        await wait(2000)
      }

      try {
        await this.test.userbase.updateUser({ currentPassword: 'incorrect', newPassword: 'new-pass' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('PasswordAttemptLimitExceeded')
        expect(e.message, 'error message').to.equal(`Password attempt limit exceeded. Must wait 24 hours to attempt to use password again.`)
        expect(e.status, 'error status').to.equal(401)
      }

      // clean up
      await this.test.userbase.deleteUser()
    })

    it('Current password must be string', async function () {
      try {
        await this.test.userbase.updateUser({ currentPassword: 1, newPassword: 'new-pass' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('PasswordMustBeString')
        expect(e.message, 'error message').to.equal('Password must be a string.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('New password must be string', async function () {
      try {
        await this.test.userbase.updateUser({ currentPassword: 'current-pass', newPassword: 1 })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('PasswordMustBeString')
        expect(e.message, 'error message').to.equal('Password must be a string.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Current password blank', async function () {
      try {
        await this.test.userbase.updateUser({ currentPassword: '', newPassword: 'new-pass' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('PasswordCannotBeBlank')
        expect(e.message, 'error message').to.equal('Password cannot be blank.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('New password blank', async function () {
      try {
        await this.test.userbase.updateUser({ currentPassword: 'curr-pass', newPassword: '' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('PasswordCannotBeBlank')
        expect(e.message, 'error message').to.equal('Password cannot be blank.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Current password too short', async function () {
      try {
        await this.test.userbase.updateUser({ currentPassword: 'cur', newPassword: 'new-pass' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('PasswordTooShort')
        expect(e.message, 'error message').to.equal(`Password too short. Must be a minimum of 6 characters.`)
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('New password too short', async function () {
      try {
        await this.test.userbase.updateUser({ currentPassword: 'cur-pass', newPassword: 'new' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('PasswordTooShort')
        expect(e.message, 'error message').to.equal(`Password too short. Must be a minimum of 6 characters.`)
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Current password too long', async function () {
      try {
        await this.test.userbase.updateUser({ currentPassword: 'a'.repeat(1001), newPassword: 'new-pass' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('PasswordTooLong')
        expect(e.message, 'error message').to.equal(`Password too long. Must be a max of 1000 characters.`)
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('New password too long', async function () {
      try {
        await this.test.userbase.updateUser({ currentPassword: 'curr-pass', newPassword: 'a'.repeat(1001) })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('PasswordTooLong')
        expect(e.message, 'error message').to.equal(`Password too long. Must be a max of 1000 characters.`)
        expect(e.status, 'error status').to.equal(400)
      }
    })

  })

})
