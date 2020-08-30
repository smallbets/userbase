
import { getRandomString } from '../../support/utils'

const beforeEachHook = function () {
  cy.visit('./cypress/integration/index.html').then(async function (win) {
    expect(win).to.have.property('userbase')
    const userbase = win.userbase
    this.currentTest.userbase = userbase
    this.currentTest.win = win

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

describe('DB Sharing Tests', function () {
  const databaseName = 'test-db'

  describe('Get Verification Message', function () {

    describe('Sucess Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Default', async function () {
        await signUp(this.test.userbase)

        const result = await this.test.userbase.getVerificationMessage()

        expect(result, 'keys').to.have.key('verificationMessage')
        expect(result.verificationMessage, 'verification message').to.be.a.string

        // clean up
        await this.test.userbase.deleteUser()
      })
    })

    describe('Failure Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('User not signed in', async function () {
        try {
          await this.test.userbase.getVerificationMessage()
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('UserNotSignedIn')
          expect(e.message, 'error message').to.be.equal('Not signed in.')
          expect(e.status, 'error status').to.be.equal(400)
        }
      })
    })

  })

  describe('Verify User', function () {

    describe('Sucess Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Default', async function () {
        // sign up User A to be verified
        const userA = await signUp(this.test.userbase)
        const { verificationMessage } = await this.test.userbase.getVerificationMessage()
        await this.test.userbase.signOut()

        // sign up User B to verify User A
        await signUp(this.test.userbase)
        await this.test.userbase.verifyUser({ verificationMessage })

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: userA.username, password: userA.password })
        await this.test.userbase.deleteUser()
      })

      it('Concurrent with getDatabases()', async function () {
        // sign up User A to be verified
        const userA = await signUp(this.test.userbase)
        const { verificationMessage } = await this.test.userbase.getVerificationMessage()
        await this.test.userbase.signOut()

        // sign up User B to verify User A
        await signUp(this.test.userbase)

        // User B verifies User A while concurrently calling getDatabases()
        await Promise.all([
          this.test.userbase.verifyUser({ verificationMessage }),
          this.test.userbase.getDatabases(),
        ])

        // clean up
        await this.test.userbase.deleteUser()
        await this.test.userbase.signIn({ username: userA.username, password: userA.password })
        await this.test.userbase.deleteUser()
      })
    })

    describe('Failure Tests', function () {
      beforeEach(function () { beforeEachHook() })

      it('Params must be object', async function () {
        try {
          await this.test.userbase.verifyUser()
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('ParamsMustBeObject')
          expect(e.message, 'error message').to.be.equal('Parameters passed to function must be placed inside an object.')
          expect(e.status, 'error status').to.be.equal(400)
        }
      })

      it('Verification message missing', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.verifyUser({})
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('VerificationMessageMissing')
          expect(e.message, 'error message').to.equal('Verification message missing.')
          expect(e.status, 'error status').to.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Verification message must be string', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.verifyUser({ verificationMessage: 1 })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.equal('VerificationMessageMustBeString')
          expect(e.message, 'error message').to.equal('Verification message must be a string.')
          expect(e.status, 'error status').to.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Verification messasge cannot be blank', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.verifyUser({ verificationMessage: '' })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('VerificationMessageCannotBeBlank')
          expect(e.message, 'error message').to.be.equal('Verification message cannot be blank.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Verification message invalid', async function () {
        await signUp(this.test.userbase)

        try {
          await this.test.userbase.verifyUser({ verificationMessage: 'abc' })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('VerificationMessageInvalid')
          expect(e.message, 'error message').to.be.equal('Verification message invalid.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('Verifying self not allowed', async function () {
        await signUp(this.test.userbase)
        const { verificationMessage } = await this.test.userbase.getVerificationMessage()

        try {
          await this.test.userbase.verifyUser({ verificationMessage })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('VerifyingSelfNotAllowed')
          expect(e.message, 'error message').to.be.equal('Verifying self not allowed. Can only verify other users.')
          expect(e.status, 'error status').to.be.equal(400)
        }

        // clean up
        await this.test.userbase.deleteUser()
      })

      it('User not signed in', async function () {
        try {
          await this.test.userbase.verifyUser({ verificationMessage: '123' })
          throw new Error('Should have failed')
        } catch (e) {
          expect(e.name, 'error name').to.be.equal('UserNotSignedIn')
          expect(e.message, 'error message').to.be.equal('Not signed in.')
          expect(e.status, 'error status').to.be.equal(400)
        }
      })
    })

  })

  //**
  //
  // Alice shares db with Bob, who shares with Charlie, who shares with Dan, who shares with Frank.
  // A -> B -> C -> D -> F
  //
  // Theses tests will check that the verification process works correctly from Charlie's perspective
  // verifying the other users in this order: D, B, F, A.
  //
  // */
  describe('Verification Process', function () {
    const getStartingDatabaseResult = function (test) {
      return {
        databaseName,
        databaseId: test.databaseId,
        receivedFromUsername: test.bob.username,
        isOwner: false,
        readOnly: true,
        resharingAllowed: true,
      }
    }

    const getStartingDatabaseUsersResult = function (test) {
      return [
        {
          username: test.alice.username,
          isOwner: true,
          readOnly: false,
          resharingAllowed: true,
        },
        {
          username: test.bob.username,
          receivedFromUsername: test.alice.username,
          isOwner: false,
          readOnly: true,
          resharingAllowed: true,
        },
        {
          username: test.dan.username,
          receivedFromUsername: test.charlie.username,
          isOwner: false,
          readOnly: true,
          resharingAllowed: true,
        },
        {
          username: test.frank.username,
          receivedFromUsername: test.dan.username,
          isOwner: false,
          readOnly: true,
          resharingAllowed: true,
        }
      ]
    }

    const getDatabaseAndUsers = async function (userbase) {
      const { databases } = await userbase.getDatabases()
      expect(databases, 'databases array').to.have.lengthOf(1)
      const database = databases[0]
      const databaseUsers = database.users
      delete database.users

      return { database, databaseUsers }
    }

    beforeEach(function () {
      cy.visit('./cypress/integration/index.html').then(async function (win) {
        expect(win).to.have.property('userbase')
        const userbase = win.userbase
        this.currentTest.userbase = userbase

        const { appId, endpoint } = Cypress.env()
        win._userbaseEndpoint = endpoint
        userbase.init({ appId })

        // Frank, Dan, Charlie, Bob, Alice sign up
        const frank = await signUp(userbase)
        this.currentTest.frank = { ...frank, ...await userbase.getVerificationMessage() }
        await userbase.signOut()

        const dan = await signUp(userbase)
        this.currentTest.dan = { ...dan, ...await userbase.getVerificationMessage() }
        await userbase.signOut()

        const charlie = await signUp(userbase)
        this.currentTest.charlie = { ...charlie, ...await userbase.getVerificationMessage() }
        await userbase.signOut()

        const bob = await signUp(userbase)
        this.currentTest.bob = { ...bob, ...await userbase.getVerificationMessage() }
        await userbase.signOut()

        const alice = await signUp(userbase)
        this.currentTest.alice = { ...alice, ...await userbase.getVerificationMessage() }

        // Alice creates database and shares with Bob
        await userbase.openDatabase({ databaseName, changeHandler: () => { } })
        await userbase.shareDatabase({ databaseName, username: bob.username, requireVerified: false, resharingAllowed: true })
        await userbase.signOut()

        // Bob signs in, gets databaseId, and shares with Charlie
        await userbase.signIn({ username: bob.username, password: bob.password, rememberMe: 'none' })
        const { databases } = await userbase.getDatabases()
        const { databaseId } = databases[0]
        this.currentTest.databaseId = databaseId
        await userbase.shareDatabase({ databaseId, username: charlie.username, requireVerified: false, resharingAllowed: true })
        await userbase.signOut()

        // Charlie shares with Dan
        await userbase.signIn({ username: charlie.username, password: charlie.password, rememberMe: 'none' })
        await userbase.getDatabases()
        await userbase.shareDatabase({ databaseId, username: dan.username, requireVerified: false, resharingAllowed: true })
        await userbase.signOut()

        // Dan shares with Frank
        await userbase.signIn({ username: dan.username, password: dan.password, rememberMe: 'none' })
        await userbase.getDatabases()
        await userbase.shareDatabase({ databaseId, username: frank.username, requireVerified: false, resharingAllowed: true })
        await userbase.signOut()

        // Frank accepts database
        await userbase.signIn({ username: frank.username, password: frank.password, rememberMe: 'none' })
        await userbase.getDatabases()
        await userbase.signOut()

        // Charlie signs in
        await userbase.signIn({ username: charlie.username, password: charlie.password, rememberMe: 'none' })
      })
    })

    afterEach(async function () {
      const { userbase, alice, bob, dan, frank } = this.currentTest

      // delete Charlie, Alice, Bob, Dan, and Frank
      await userbase.deleteUser()

      await userbase.signIn({ username: alice.username, password: alice.password, rememberMe: 'none' })
      await userbase.deleteUser()

      await userbase.signIn({ username: bob.username, password: bob.password, rememberMe: 'none' })
      await userbase.deleteUser()

      await userbase.signIn({ username: dan.username, password: dan.password, rememberMe: 'none' })
      await userbase.deleteUser()

      await userbase.signIn({ username: frank.username, password: frank.password, rememberMe: 'none' })
      await userbase.deleteUser()
    })

    it('Charlie initial getDatabases()', async function () {
      const { database, databaseUsers } = await getDatabaseAndUsers(this.test.userbase)

      const expectedDatabase = getStartingDatabaseResult(this.test)
      const expectedDatabaseUsers = getStartingDatabaseUsersResult(this.test)

      expect(database, 'starting database').to.deep.equal(expectedDatabase)
      expect(databaseUsers, 'starting database').to.deep.have.same.members(expectedDatabaseUsers)
    })

    it('Charlie verifies Dan', async function () {
      // Charlie verifies Dan
      await this.test.userbase.verifyUser({ verificationMessage: this.test.dan.verificationMessage })

      const { database, databaseUsers } = await getDatabaseAndUsers(this.test.userbase)

      const expectedDatabase = getStartingDatabaseResult(this.test)
      const expectedDatabaseUsers = getStartingDatabaseUsersResult(this.test)

      // Charlie makes sure Dan and only Dan is verified
      const danIndex = 2
      expectedDatabaseUsers[danIndex].verified = true

      expect(database, 'starting database').to.deep.equal(expectedDatabase)
      expect(databaseUsers, 'starting database').to.deep.have.same.members(expectedDatabaseUsers)
    })

    it('Charlie verifies Bob', async function () {
      // Charlie verifies Dan and Bob
      await Promise.all([
        this.test.userbase.verifyUser({ verificationMessage: this.test.dan.verificationMessage }),
        this.test.userbase.verifyUser({ verificationMessage: this.test.bob.verificationMessage }),
      ])

      const { database, databaseUsers } = await getDatabaseAndUsers(this.test.userbase)

      const expectedDatabase = getStartingDatabaseResult(this.test)
      const expectedDatabaseUsers = getStartingDatabaseUsersResult(this.test)

      // Charlie makes sure Dan and Bob are verified
      const danIndex = 2
      expectedDatabaseUsers[danIndex].verified = true

      const bobIndex = 1
      expectedDatabaseUsers[bobIndex].verified = true

      expect(database, 'starting database').to.deep.equal(expectedDatabase)
      expect(databaseUsers, 'starting database').to.deep.have.same.members(expectedDatabaseUsers)
    })

    it('Charlie verifies Frank', async function () {
      // Charlie verifies Dan, Bob, and Frank
      await Promise.all([
        this.test.userbase.verifyUser({ verificationMessage: this.test.dan.verificationMessage }),
        this.test.userbase.verifyUser({ verificationMessage: this.test.bob.verificationMessage }),
        this.test.userbase.verifyUser({ verificationMessage: this.test.frank.verificationMessage }),
      ])

      const { database, databaseUsers } = await getDatabaseAndUsers(this.test.userbase)

      const expectedDatabase = getStartingDatabaseResult(this.test)
      const expectedDatabaseUsers = getStartingDatabaseUsersResult(this.test)

      // Charlie makes sure Dan, Bob, and Frank are verified
      const danIndex = 2
      expectedDatabaseUsers[danIndex].verified = true

      const bobIndex = 1
      expectedDatabaseUsers[bobIndex].verified = true

      const frankIndex = 3
      expectedDatabaseUsers[frankIndex].verified = true

      expect(database, 'starting database').to.deep.equal(expectedDatabase)
      expect(databaseUsers, 'starting database').to.deep.have.same.members(expectedDatabaseUsers)
    })

    it('Charlie verifies Alice', async function () {
      // Charlie verifies Dan, Bob, Frank, and Alice
      await Promise.all([
        this.test.userbase.verifyUser({ verificationMessage: this.test.dan.verificationMessage }),
        this.test.userbase.verifyUser({ verificationMessage: this.test.bob.verificationMessage }),
        this.test.userbase.verifyUser({ verificationMessage: this.test.frank.verificationMessage }),
        this.test.userbase.verifyUser({ verificationMessage: this.test.alice.verificationMessage }),
      ])

      const { database, databaseUsers } = await getDatabaseAndUsers(this.test.userbase)

      const expectedDatabase = getStartingDatabaseResult(this.test)
      const expectedDatabaseUsers = getStartingDatabaseUsersResult(this.test)

      // Charlie makes sure Dan, Bob, Frank, and Alice are verified
      const danIndex = 2
      expectedDatabaseUsers[danIndex].verified = true

      const bobIndex = 1
      expectedDatabaseUsers[bobIndex].verified = true

      const frankIndex = 3
      expectedDatabaseUsers[frankIndex].verified = true

      const aliceIndex = 0
      expectedDatabaseUsers[aliceIndex].verified = true

      expect(database, 'starting database').to.deep.equal(expectedDatabase)
      expect(databaseUsers, 'starting database').to.deep.have.same.members(expectedDatabaseUsers)
    })

  })
})
