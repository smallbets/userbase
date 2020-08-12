
import { getRandomString } from '../support/utils'

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
