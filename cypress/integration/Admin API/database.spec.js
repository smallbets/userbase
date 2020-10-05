import { getRandomString, constructNextPageToken } from '../../support/utils'

const databaseName = 'test-db'

function signIn(testReference, username, password) {
  function signInWrapper() {
    return new Cypress.Promise((resolve, reject) => {
      testReference.userbase
        .signIn({
          username,
          password,
          rememberMe: 'none',
        })
        .then((user) => resolve(user))
        .catch((e) => reject(e))
    })
  }

  return cy.wrap(null).then(() => {
    return signInWrapper()
  })
}

function shareDatabase(testReference, username) {
  function shareDatabaseWrapper() {
    return new Cypress.Promise((resolve, reject) => {
      testReference.userbase
        .shareDatabase({
          databaseName,
          username,
          requireVerified: false
        })
        .then(() => resolve())
        .catch((e) => reject(e))
    })
  }

  return cy.wrap(null).then(() => {
    return shareDatabaseWrapper()
  })
}

function signOut(testReference) {
  function signOutWrapper() {
    return new Cypress.Promise((resolve, reject) => {
      testReference.userbase
        .signOut()
        .then(() => resolve())
        .catch((e) => reject(e))
    })
  }

  return cy.wrap(null).then(() => {
    return signOutWrapper()
  })
}

function getDatabases(testReference) {
  function getDatabasesWrapper() {
    return new Cypress.Promise((resolve, reject) => {
      testReference.userbase
        .getDatabases()
        .then((databasesResult) => resolve(databasesResult))
        .catch((e) => reject(e))
    })
  }

  return cy.wrap(null).then(() => {
    return getDatabasesWrapper()
  })
}

function openDatabase(testReference) {
  function openDatabaseWrapper() {
    return new Cypress.Promise((resolve, reject) => {
      testReference.userbase
        .openDatabase({
          databaseName,
          changeHandler: () => { },
        })
        .then(() => resolve())
        .catch((e) => reject(e))
    })
  }

  return cy.wrap(null).then(() => {
    return openDatabaseWrapper()
  })
}

function signUp(testReference, username, password) {
  return cy.visit('./cypress/integration/index.html').then(function (win) {
    expect(win).to.have.property('userbase')
    const userbase = win.userbase
    testReference.userbase = userbase

    const { endpoint } = Cypress.env()
    win._userbaseEndpoint = endpoint
    userbase.init({ appId: testReference.appId })

    function signUpWrapper() {
      return new Cypress.Promise((resolve, reject) => {
        userbase
          .signUp({
            username,
            password,
            rememberMe: 'none',
          })
          .then((user) => resolve(user))
          .catch((e) => reject(e))
      })
    }

    cy.wrap(null).then(() => {
      return signUpWrapper()
    })
  })
}

// makes a new App ID and Access Token available for each test
function createAdmin(testReference) {
  const randomAdmin = 'test-admin-' + getRandomString() + '@test.com'
  const password = getRandomString()

  const { endpoint } = Cypress.env()

  return cy
    .request({
      method: 'POST',
      url: endpoint + '/admin/create-admin',
      body: {
        email: randomAdmin,
        password,
        fullName: 'Test Admin'
      }
    })
    .then(function (adminResponse) {
      testReference.adminId = adminResponse.body

      cy
        .request({
          method: 'POST',
          url: endpoint + '/admin/list-apps'
        })
        .then(function (response) {
          const appId = response.body[0]['app-id']
          testReference.appId = appId

          cy
            .request({
              method: 'POST',
              url: endpoint + '/admin/access-token',
              body: {
                currentPassword: password,
                label: 'Test Token'
              }
            })
            .then(function (response) {
              const accessToken = response.body.accessToken
              testReference.accessToken = accessToken
            })
        })
    })
}

describe('ListDatabaseUsers', function () {
  const { endpoint } = Cypress.env()
  const DATABASE_USERS_ENDPOINT = endpoint + '/admin/databases/'
  const DELETE_ADMIN_ENDPOINT = endpoint + '/admin/delete-admin'

  describe('Success Tests', function () {
    it('Default behavior', function () {
      createAdmin(this.test).then(function () {
        const username = 'test-user-' + getRandomString()
        const password = getRandomString()

        const {
          accessToken
        } = this.test

        signUp(this.test, username, password).then(function (user) {
          const {
            userId
          } = user

          openDatabase(this.test).then(function () {
            getDatabases(this.test).then(function (databasesResult) {
              const databaseId = databasesResult.databases[0].databaseId

              cy
                .request({
                  method: 'GET',
                  url: DATABASE_USERS_ENDPOINT + databaseId + '/users',
                  auth: {
                    bearer: accessToken
                  }
                })
                .then(function (response) {
                  expect(response.status, 'status').to.eq(200)
                  expect(response.body, 'list database users result keys').to.have.keys(['users'])
                  expect(response.body.users, 'users array').to.have.length(1)

                  const user = response.body.users[0]

                  expect(user, 'user keys').to.have.keys(['userId', 'readOnly', 'isOwner', 'resharingAllowed'])
                  expect(user.userId, 'userId').to.eq(userId)
                  expect(user.readOnly, 'readOnly').to.be.false
                  expect(user.isOwner, 'isOwner').to.be.true
                  expect(user.resharingAllowed, 'resharingAllowed').to.be.true

                  cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
                })
            })
          })
        })
      })
    })

    it('Share with a user', function () {
      createAdmin(this.test).then(function () {
        const recipientUsername = 'test-user-' + getRandomString()
        const password = getRandomString()

        const {
          accessToken
        } = this.test

        signUp(this.test, recipientUsername, password).then(function (recipient) {
          const recipientUserId = recipient.userId

          const senderUsername = 'test-user-' + getRandomString()

          signUp(this.test, senderUsername, password).then(function (sender) {
            const senderUserId = sender.userId

            openDatabase(this.test).then(function () {
              shareDatabase(this.test, recipientUsername).then(function () {
                signOut(this.test).then(function () {
                  signIn(this.test, recipientUsername, password).then(function () {

                    getDatabases(this.test).then(function (databasesResult) {
                      const databaseId = databasesResult.databases[0].databaseId

                      cy
                        .request({
                          method: 'GET',
                          url: DATABASE_USERS_ENDPOINT + databaseId + '/users',
                          auth: {
                            bearer: accessToken
                          }
                        })
                        .then(function (response) {
                          expect(response.status, 'status').to.eq(200)
                          expect(response.body, 'list database users result keys').to.have.keys(['users'])
                          expect(response.body.users, 'users array').to.have.length(2)

                          let foundSender, foundRecipient
                          for (let i = 0; i < response.body.users.length; i++) {
                            const user = response.body.users[i]

                            expect(user, 'user keys').to.have.keys(['userId', 'readOnly', 'isOwner', 'resharingAllowed'])

                            if (user.userId === senderUserId) {
                              expect(user.readOnly, 'readOnly').to.be.false
                              expect(user.isOwner, 'isOwner').to.be.true
                              expect(user.resharingAllowed, 'resharingAllowed').to.be.true
                              foundSender = true
                            } else {
                              expect(user.userId, 'userId').to.eq(recipientUserId)
                              expect(user.readOnly, 'readOnly').to.be.true
                              expect(user.isOwner, 'isOwner').to.be.false
                              expect(user.resharingAllowed, 'resharingAllowed').to.be.false
                              foundRecipient = true
                            }
                          }

                          expect(foundSender, 'found sender').to.be.true
                          expect(foundRecipient, 'found recipient').to.be.true

                          cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
                        })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  })

  describe('Failure Tests', function () {

    describe('Authorization', function () {

      it('Authorization header missing', function () {
        cy
          .request({
            method: 'GET',
            url: DATABASE_USERS_ENDPOINT + 'fake-database-id/users',
            failOnStatusCode: false
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('Authorization header missing.')
            expect(response.headers['www-authenticate']).to.eq('Bearer realm="Acccess to the Admin API"')
          })
      })

      it('Authorization scheme must be of type Bearer', function () {
        cy
          .request({
            method: 'GET',
            url: DATABASE_USERS_ENDPOINT + 'fake-app-id/users',
            failOnStatusCode: false,
            auth: {
              username: 'fake',
              password: 'fake'
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('Authorization scheme must be of type Bearer.')
            expect(response.headers['www-authenticate']).to.eq('Bearer realm="Acccess to the Admin API"')
          })
      })

      it('Access token missing', function () {
        cy
          .request({
            method: 'GET',
            url: DATABASE_USERS_ENDPOINT + 'fake-app-id/users',
            failOnStatusCode: false,
            auth: {
              bearer: ''
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('Access token missing.')
            expect(response.headers['www-authenticate']).to.eq('Bearer realm="Acccess to the Admin API"')
          })
      })

      it('Access token is incorrect length', function () {
        cy
          .request({
            method: 'GET',
            url: DATABASE_USERS_ENDPOINT + 'fake-app-id/users',
            failOnStatusCode: false,
            auth: {
              bearer: 'test'
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('Access token is incorrect length.')
            expect(response.headers['www-authenticate']).to.eq('Bearer realm="Acccess to the Admin API"')
          })
      })

      it('Access token invalid', function () {
        cy
          .request({
            method: 'GET',
            url: DATABASE_USERS_ENDPOINT + 'fake-app-id/users',
            failOnStatusCode: false,
            auth: {
              bearer: '00000000000000000000000000000000000000000000'
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(401)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('Access token invalid.')
          })
      })

    })

    describe('ListDatabaseUsers failures', function () {
      beforeEach(function () {
        createAdmin(this.currentTest).then(function () {
          const username = 'test-user-' + getRandomString()
          const password = getRandomString()
          return signUp(this.currentTest, username, password).then(function (user) {
            this.userId = user.userId
          })
        })
      })

      it('Database ID is incorrect length', function () {
        cy
          .request({
            method: 'GET',
            url: DATABASE_USERS_ENDPOINT + 'a'.repeat(37) + '/users',
            failOnStatusCode: false,
            auth: {
              bearer: this.test.accessToken
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('Database ID is incorrect length.')

            cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
          })
      })

      it('Database not found', function () {
        cy
          .request({
            method: 'GET',
            url: DATABASE_USERS_ENDPOINT + '000000000000000000000000000000000000' + '/users',
            failOnStatusCode: false,
            auth: {
              bearer: this.test.accessToken
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(404)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('Database not found.')

            cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
          })
      })

      it('Next page token as malformed string', function () {
        openDatabase(this.test).then(function () {
          getDatabases(this.test).then(function (databasesResult) {
            const databaseId = databasesResult.databases[0].databaseId
            cy
              .request({
                method: 'GET',
                url: DATABASE_USERS_ENDPOINT + databaseId + '/users?nextPageToken=' + 'string',
                failOnStatusCode: false,
                auth: {
                  bearer: this.test.accessToken
                }
              })
              .then(function (response) {
                expect(response.status, 'status').to.eq(400)
                expect(response.body, 'key').to.have.key('message')
                expect(response.body.message, 'message').to.eq('Next page token invalid.')

                cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
              })
          })
        })
      })

      it('Next page token with no user ID', function () {
        openDatabase(this.test).then(function () {
          getDatabases(this.test).then(function (databasesResult) {
            const databaseId = databasesResult.databases[0].databaseId
            const nextPageToken = constructNextPageToken({ 'database-id': databaseId, 'database-name-hash': 'abc123', 'user-id': undefined })

            cy
              .request({
                method: 'GET',
                url: DATABASE_USERS_ENDPOINT + databaseId + '/users?nextPageToken=' + nextPageToken,
                failOnStatusCode: false,
                auth: {
                  bearer: this.test.accessToken
                }
              })
              .then(function (response) {
                expect(response.status, 'status').to.eq(400)
                expect(response.body, 'key').to.have.key('message')
                expect(response.body.message, 'message').to.eq('Next page token invalid.')

                cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
              })
          })
        })
      })

      it('Next page token with extra key', function () {
        openDatabase(this.test).then(function () {
          getDatabases(this.test).then(function (databasesResult) {
            const databaseId = databasesResult.databases[0].databaseId
            const nextPageToken = constructNextPageToken({ 'database-id': databaseId, 'database-name-hash': 'abc123', 'user-id': this.test.userId, 'extra-key': 'hello' })

            cy
              .request({
                method: 'GET',
                url: DATABASE_USERS_ENDPOINT + databaseId + '/users?nextPageToken=' + nextPageToken,
                failOnStatusCode: false,
                auth: {
                  bearer: this.test.accessToken
                }
              })
              .then(function (response) {
                expect(response.status, 'status').to.eq(400)
                expect(response.body, 'key').to.have.key('message')
                expect(response.body.message, 'message').to.eq('Next page token invalid.')

                cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
              })
          })
        })
      })

      it('Next page token with incorrect database ID', function () {
        openDatabase(this.test).then(function () {
          getDatabases(this.test).then(function (databasesResult) {
            const databaseId = databasesResult.databases[0].databaseId
            const nextPageToken = constructNextPageToken({ 'database-id': '0'.repeat(36), 'database-name-hash': 'abc123', 'user-id': this.test.userId, 'extra-key': 'hello' })

            cy
              .request({
                method: 'GET',
                url: DATABASE_USERS_ENDPOINT + databaseId + '/users?nextPageToken=' + nextPageToken,
                failOnStatusCode: false,
                auth: {
                  bearer: this.test.accessToken
                }
              })
              .then(function (response) {
                expect(response.status, 'status').to.eq(400)
                expect(response.body, 'key').to.have.key('message')
                expect(response.body.message, 'message').to.eq('Next page token invalid.')

                cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
              })
          })
        })
      })
    })

  })

})
