import { getRandomString, constructNextPageToken } from '../../support/utils'

function signUp(testReference, email, profile) {
  return cy.visit('./cypress/integration/index.html').then(function (win) {
    expect(win).to.have.property('userbase')
    const userbase = win.userbase
    testReference.userbase = userbase

    const { endpoint } = Cypress.env()
    win._userbaseEndpoint = endpoint
    userbase.init({ appId: testReference.appId })

    const randomUser = 'test-user-' + getRandomString()
    const password = getRandomString()
    const rememberMe = 'none'

    function signUpWrapper() {
      return new Cypress.Promise((resolve, reject) => {
        userbase
          .signUp({
            username: randomUser,
            password,
            rememberMe,
            email,
            profile
          })
          .then((user) => resolve(user))
          .catch((e) => reject(e))
      })
    }

    cy.wrap(null).then(() => {
      return signUpWrapper().then((user) => {
        testReference.username = randomUser
        testReference.password = password
        testReference.userId = user.userId
      })
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

describe('GetApp', function () {
  const { endpoint } = Cypress.env()
  const APP_ENDPOINT = endpoint + '/admin/apps/'
  const DELETE_ADMIN_ENDPOINT = endpoint + '/admin/delete-admin'

  describe('Success Test', function () {
    it('Default behavior', function () {
      createAdmin(this.test).then(function () {
        const {
          appId,
          accessToken
        } = this.test

        cy
          .request({
            method: 'GET',
            url: APP_ENDPOINT + appId,
            auth: {
              bearer: accessToken
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(200)

            expect(response.body, 'app keys').to.have.keys(['appId', 'appName', 'creationDate', 'paymentsMode', 'encryptionMode'])
            expect(response.body.appId, 'app appId').to.eq(appId)
            expect(response.body.appName, 'app name').to.eq('Trial')
            expect(response.body.paymentsMode, 'paymentsMode').to.eq('disabled')
            expect(response.body.encryptionMode, 'encryptionMode').to.eq('end-to-end')

            cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
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
            url: APP_ENDPOINT + 'fake-app-id',
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
            url: APP_ENDPOINT + 'fake-app-id',
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
            url: APP_ENDPOINT + 'fake-app-id',
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
            url: APP_ENDPOINT + 'fake-app-id',
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
            url: APP_ENDPOINT + 'fake-app-id',
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

    describe('GetApp failures', function () {
      beforeEach(function () {
        createAdmin(this.currentTest).then(function () {
          const email = 'fake@email.com'
          const profile = { hello: 'world!' }
          return signUp(this.currentTest, email, profile)
        })
      })

      it('App ID is incorrect length', function () {
        cy
          .request({
            method: 'GET',
            url: APP_ENDPOINT + 'a'.repeat(37),
            failOnStatusCode: false,
            auth: {
              bearer: this.test.accessToken
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('App ID is incorrect length.')

            cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
          })
      })

      it('App not found', function () {
        cy
          .request({
            method: 'GET',
            url: APP_ENDPOINT + '000000000000000000000000000000000000',
            failOnStatusCode: false,
            auth: {
              bearer: this.test.accessToken
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(404)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('App not found.')

            cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
          })
      })
    })

  })

})

describe('ListUsers', function () {
  const { endpoint } = Cypress.env()
  const APP_ENDPOINT = endpoint + '/admin/apps/'
  const DELETE_ADMIN_ENDPOINT = endpoint + '/admin/delete-admin'

  describe('Success Tests', function () {
    it('Default behavior', function () {
      createAdmin(this.test).then(function () {
        const email = 'fake@email.com'
        const profile = { hello: 'world!' }

        signUp(this.test, email, profile).then(function () {
          const {
            userId,
            username,
            appId,
            accessToken
          } = this.test

          cy
            .request({
              method: 'GET',
              url: APP_ENDPOINT + appId + '/users',
              auth: {
                bearer: accessToken
              }
            })
            .then(function (response) {
              expect(response.status, 'status').to.eq(200)
              expect(response.body, 'list users result keys').to.have.keys(['users'])
              expect(response.body.users, 'users array').to.have.length(1)

              const user = response.body.users[0]

              expect(user, 'user keys').to.have.keys(['username', 'userId', 'appId', 'email', 'profile', 'creationDate'])
              expect(user.username, 'username').to.eq(username)
              expect(user.userId, 'userId').to.eq(userId)
              expect(user.appId, 'appId').to.eq(appId)
              expect(user.email, 'email').to.eq(email)
              expect(user.profile, 'profile').to.deep.eq(profile)

              cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
            })
        })
      })
    })

    it('Pagination Token', function () {
      createAdmin(this.test).then(function () {
        const email = 'fake@email.com'
        const profile = { hello: 'world!' }

        // sign up User A
        signUp(this.test, email, profile).then(function () {
          const {
            appId,
            accessToken
          } = this.test

          const userIdUserA = this.test.userId
          const usernameUserA = this.test.username

          // sign up User B
          signUp(this.test, email, profile).then(function () {
            const userIdUserB = this.test.userId
            const usernameUserB = this.test.username

            // list users should return both users
            cy
              .request({
                method: 'GET',
                url: APP_ENDPOINT + appId + '/users',
                auth: {
                  bearer: accessToken
                }
              })
              .then(function (response) {
                expect(response.status, 'status').to.eq(200)
                expect(response.body, 'list users result keys').to.have.keys(['users'])
                expect(response.body.users, 'users array').to.have.length(2)

                let actualUserA, actualUserB, tokenUsername, expectedPaginatedUser
                if (response.body.users[0].username === usernameUserA) {
                  actualUserA = response.body.users[0]
                  actualUserB = response.body.users[1]
                  tokenUsername = usernameUserA
                  expectedPaginatedUser = actualUserB
                } else {
                  actualUserA = response.body.users[1]
                  actualUserB = response.body.users[0]
                  tokenUsername = usernameUserB
                  expectedPaginatedUser = actualUserA
                }

                // check users are correct
                expect(actualUserA, 'user A keys').to.have.keys(['username', 'userId', 'appId', 'email', 'profile', 'creationDate'])
                expect(actualUserA.username, 'user A username').to.eq(usernameUserA)
                expect(actualUserA.userId, 'user A userId').to.eq(userIdUserA)
                expect(actualUserA.appId, 'user A appId').to.eq(appId)
                expect(actualUserA.email, 'user A email').to.eq(email)
                expect(actualUserA.profile, 'user A profile').to.deep.eq(profile)

                expect(actualUserB, 'user B keys').to.have.keys(['username', 'userId', 'appId', 'email', 'profile', 'creationDate'])
                expect(actualUserB.username, 'user B username').to.eq(usernameUserB)
                expect(actualUserB.userId, 'user B userId').to.eq(userIdUserB)
                expect(actualUserB.appId, 'user B appId').to.eq(appId)
                expect(actualUserB.email, 'user B email').to.eq(email)
                expect(actualUserB.profile, 'user B profile').to.deep.eq(profile)

                const nextPageToken = constructNextPageToken({ username: tokenUsername, 'app-id': appId })

                // list users with next page token should return 1 user
                cy
                  .request({
                    method: 'GET',
                    url: APP_ENDPOINT + appId + '/users?nextPageToken=' + nextPageToken,
                    auth: {
                      bearer: accessToken
                    }
                  })
                  .then(function (response) {
                    expect(response.status, 'status').to.eq(200)
                    expect(response.body, 'paginated users result keys').to.have.keys(['users'])
                    expect(response.body.users, 'paginated users array').to.have.length(1)
                    expect(response.body.users[0], 'paginated user').to.deep.equal(expectedPaginatedUser)

                    cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
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
            url: APP_ENDPOINT + 'fake-app-id',
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
            url: APP_ENDPOINT + 'fake-app-id',
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
            url: APP_ENDPOINT + 'fake-app-id',
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
            url: APP_ENDPOINT + 'fake-app-id',
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
            url: APP_ENDPOINT + 'fake-app-id',
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

    describe('ListUsers failures', function () {
      beforeEach(function () {
        createAdmin(this.currentTest).then(function () {
          const email = 'fake@email.com'
          const profile = { hello: 'world!' }
          return signUp(this.currentTest, email, profile)
        })
      })

      it('App ID is incorrect length', function () {
        cy
          .request({
            method: 'GET',
            url: APP_ENDPOINT + 'a'.repeat(37) + '/users',
            failOnStatusCode: false,
            auth: {
              bearer: this.test.accessToken
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('App ID is incorrect length.')

            cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
          })
      })

      it('App not found', function () {
        cy
          .request({
            method: 'GET',
            url: APP_ENDPOINT + '000000000000000000000000000000000000' + '/users',
            failOnStatusCode: false,
            auth: {
              bearer: this.test.accessToken
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(404)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('App not found.')

            cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
          })
      })

      it('Next page token as malformed string', function () {
        cy
          .request({
            method: 'GET',
            url: APP_ENDPOINT + this.test.appId + '/users?nextPageToken=' + 'string',
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

      it('Next page token with no username', function () {
        const nextPageToken = constructNextPageToken({ username: undefined, 'app-id': this.test.appId })

        cy
          .request({
            method: 'GET',
            url: APP_ENDPOINT + this.test.appId + '/users?nextPageToken=' + nextPageToken,
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

      it('Next page token with extra key', function () {
        const lastEvaluatedKeyString = JSON.stringify({ username: this.test.username, 'app-id': this.test.appId, 'extra-key': 'hello' })
        const nextPageToken = Buffer.from(lastEvaluatedKeyString).toString('base64')

        cy
          .request({
            method: 'GET',
            url: APP_ENDPOINT + this.test.appId + '/users?nextPageToken=' + nextPageToken,
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

      it('Next page token with incorrect app ID', function () {
        const nextPageToken = constructNextPageToken({ username: this.test.username, 'app-id': '000000000000000000000000000000000000' })

        cy
          .request({
            method: 'GET',
            url: APP_ENDPOINT + this.test.appId + '/users?nextPageToken=' + nextPageToken,
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

describe('ListApps', function () {
  const { endpoint } = Cypress.env()
  const APP_ENDPOINT = endpoint + '/admin/apps/'
  const DELETE_ADMIN_ENDPOINT = endpoint + '/admin/delete-admin'

  describe('Success Tests', function () {
    it('Default behavior', function () {
      createAdmin(this.test).then(function () {
        const {
          appId,
          accessToken
        } = this.test

        cy
          .request({
            method: 'GET',
            url: APP_ENDPOINT,
            auth: {
              bearer: accessToken
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(200)

            expect(response.body, 'apps response').to.have.keys(['apps'])
            expect(response.body.apps, 'apps array').to.have.lengthOf(1)

            const app = response.body.apps[0]

            expect(app, 'app keys').to.have.keys(['appId', 'appName', 'creationDate', 'paymentsMode', 'encryptionMode'])

            expect(app.appId, 'app appId').to.eq(appId)
            expect(app.appName, 'app name').to.eq('Trial')
            expect(app.paymentsMode, 'paymentsMode').to.eq('disabled')
            expect(app.encryptionMode, 'encryptionMode').to.eq('end-to-end')

            cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
          })
      })
    })

    it('Pagination Token', function () {
      createAdmin(this.test).then(function () {
        const {
          appId,
          accessToken,
          adminId
        } = this.test

        cy
          .request({
            method: 'GET',
            url: APP_ENDPOINT,
            auth: {
              bearer: accessToken
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(200)

            expect(response.body, 'apps response').to.have.keys(['apps'])
            expect(response.body.apps, 'apps array').to.have.lengthOf(1)

            const app = response.body.apps[0]

            expect(app, 'app keys').to.have.keys(['appId', 'appName', 'creationDate', 'paymentsMode', 'encryptionMode'])
            expect(app.appId, 'app appId').to.eq(appId)
            expect(app.appName, 'app name').to.eq('Trial')
            expect(app.paymentsMode, 'paymentsMode').to.eq('disabled')
            expect(app.encryptionMode, 'encryptionMode').to.eq('end-to-end')

            const nextPageToken = constructNextPageToken({ 'admin-id': adminId, 'app-name': 'Trial' })

            cy
              .request({
                method: 'GET',
                url: APP_ENDPOINT + '?nextPageToken=' + nextPageToken,
                auth: {
                  bearer: accessToken
                }
              })
              .then(function (response) {
                expect(response.status, 'status').to.eq(200)

                expect(response.body, 'apps response').to.have.keys(['apps'])
                expect(response.body.apps, 'apps array').to.have.lengthOf(0)

                cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
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
            url: APP_ENDPOINT + 'fake-app-id',
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
            url: APP_ENDPOINT + 'fake-app-id',
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
            url: APP_ENDPOINT + 'fake-app-id',
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
            url: APP_ENDPOINT + 'fake-app-id',
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
            url: APP_ENDPOINT + 'fake-app-id',
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

    describe('ListApps failures', function () {
      beforeEach(function () { createAdmin(this.currentTest) })

      it('Next page token as malformed string', function () {
        cy
          .request({
            method: 'GET',
            url: APP_ENDPOINT + '?nextPageToken=' + 'string',
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

      it('Next page token with no admin ID', function () {
        const nextPageToken = constructNextPageToken({ 'admin-id': undefined, 'app-name': 'Trial' })

        cy
          .request({
            method: 'GET',
            url: APP_ENDPOINT + '?nextPageToken=' + nextPageToken,
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

      it('Next page token with extra key', function () {
        const nextPageToken = constructNextPageToken({ 'admin-id': this.test.adminId, 'app-name': 'Trial', 'extra-key': 'hello' })

        cy
          .request({
            method: 'GET',
            url: APP_ENDPOINT + '?nextPageToken=' + nextPageToken,
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

      it('Next page token with incorrect admin ID', function () {
        const nextPageToken = constructNextPageToken({ 'admin-id': '000000000000000000000000000000000000', 'app-name': 'Trial' })

        cy
          .request({
            method: 'GET',
            url: APP_ENDPOINT + '?nextPageToken=' + nextPageToken,
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
