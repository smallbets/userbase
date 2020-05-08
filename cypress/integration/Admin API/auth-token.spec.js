import { getRandomString } from '../../support/utils'

function signUp(testReference, email, profile, rememberMe = 'none') {
  return cy.visit('./cypress/integration/index.html').then(function (win) {
    expect(win).to.have.property('userbase')
    const userbase = win.userbase
    testReference.userbase = userbase

    const { endpoint } = Cypress.env()
    win._userbaseEndpoint = endpoint
    userbase.init({ appId: testReference.appId })

    const randomUser = 'test-user-' + getRandomString()
    const password = getRandomString()

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
        testReference.authToken = user.authToken
      })
    })
  })
}

function init(appId) {
  return cy.visit('./cypress/integration/index.html').then(function (win) {
    const userbase = win.userbase

    const { endpoint } = Cypress.env()
    win._userbaseEndpoint = endpoint

    function initWrapper() {
      return new Cypress.Promise((resolve, reject) => {
        userbase.init({ appId })
          .then((session) => resolve(session))
          .catch((e) => reject(e))
      })
    }

    cy.wrap(null).then(() => {
      return initWrapper().then((session) => {
        return session.user.authToken
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
    .then(function () {
      cy
        .request({
          method: 'POST',
          url: endpoint + '/admin/list-apps'
        })
        .then(function (response) {
          const app = response.body[0]
          testReference.appId = app['app-id']
          testReference.appName = app['app-name']

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

describe('VerifyAuthToken', function () {
  const { endpoint } = Cypress.env()
  const AUTH_TOKEN_ENDPOINT = endpoint + '/admin/auth-tokens/'
  const DELETE_ADMIN_ENDPOINT = endpoint + '/admin/delete-admin'

  describe('Success Tests', function () {
    it('After sign up', function () {
      createAdmin(this.test).then(function () {
        const email = 'fake@email.com'
        const profile = { hello: 'world!' }

        signUp(this.test, email, profile).then(function () {
          const {
            accessToken,
            authToken,
            userId,
          } = this.test

          cy
            .request({
              method: 'GET',
              url: AUTH_TOKEN_ENDPOINT + authToken,
              auth: {
                bearer: accessToken
              }
            })
            .then(function (response) {
              expect(response.status, 'status').to.eq(200)
              expect(response.body, 'result').to.deep.eq({ userId })

              cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
            })
        })
      })
    })

    it('After sign in', function () {
      createAdmin(this.test).then(function () {
        const email = 'fake@email.com'
        const profile = { hello: 'world!' }

        signUp(this.test, email, profile).then(function () {
          const {
            userbase,
            username,
            password,
            accessToken,
            userId,
          } = this.test

          function signOutWrapper() {
            return new Cypress.Promise((resolve, reject) => {
              userbase.signOut()
                .then(() => resolve())
                .catch((e) => reject(e))
            })
          }

          cy.wrap(null).then(() => {
            return signOutWrapper().then(() => {

              function signInWrapper() {
                return new Cypress.Promise((resolve, reject) => {
                  userbase.signIn({ username, password })
                    .then(user => resolve(user))
                    .catch(e => reject(e))
                })
              }

              cy.wrap(null).then(() => {
                return signInWrapper().then((user) => {

                  cy
                    .request({
                      method: 'GET',
                      url: AUTH_TOKEN_ENDPOINT + user.authToken,
                      auth: {
                        bearer: accessToken
                      }
                    })
                    .then(function (response) {
                      expect(response.status, 'status').to.eq(200)
                      expect(response.body, 'result').to.deep.eq({ userId })

                      cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
                    })
                })
              })
            })
          })
        })
      })
    })

    it.only('After init', function () {
      createAdmin(this.test).then(function () {
        const email = 'fake@email.com'
        const profile = { hello: 'world!' }
        const rememberMe = 'session'

        signUp(this.test, email, profile, rememberMe).then(function () {
          const {
            appId,
            accessToken,
            userId,
          } = this.test

          cy.reload()
          init(appId).then(function (authToken) {

            cy
              .request({
                method: 'GET',
                url: AUTH_TOKEN_ENDPOINT + authToken,
                auth: {
                  bearer: accessToken
                }
              })
              .then(function (response) {
                expect(response.status, 'status').to.eq(200)
                expect(response.body, 'result').to.deep.eq({ userId })

                cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
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
            url: AUTH_TOKEN_ENDPOINT + 'fake-auth-token',
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
            url: AUTH_TOKEN_ENDPOINT + 'fake-app-id',
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
            url: AUTH_TOKEN_ENDPOINT + 'fake-app-id',
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
            url: AUTH_TOKEN_ENDPOINT + 'fake-app-id',
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
            url: AUTH_TOKEN_ENDPOINT + 'fake-app-id',
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

    describe('VerifyAuthToken failures', function () {
      beforeEach(function () {
        createAdmin(this.currentTest).then(function () {
          const email = 'fake@email.com'
          const profile = { hello: 'world!' }
          return signUp(this.currentTest, email, profile)
        })
      })

      it('Auth Token is incorrect length', function () {
        cy
          .request({
            method: 'GET',
            url: AUTH_TOKEN_ENDPOINT + 'a'.repeat(33),
            failOnStatusCode: false,
            auth: {
              bearer: this.test.accessToken
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('Auth token is incorrect length.')

            cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
          })
      })

      it('Auth Token invalid (user signs out)', function () {
        const { userbase, authToken, accessToken } = this.test

        function signOutWrapper() {
          return new Cypress.Promise((resolve, reject) => {
            userbase.signOut()
              .then(() => resolve())
              .catch((e) => reject(e))
          })
        }

        cy.wrap(null).then(() => {
          return signOutWrapper().then(() => {
            cy
              .request({
                method: 'GET',
                url: AUTH_TOKEN_ENDPOINT + authToken,
                failOnStatusCode: false,
                auth: {
                  bearer: accessToken
                }
              })
              .then(function (response) {
                expect(response.status, 'status').to.eq(401)
                expect(response.body, 'key').to.have.key('message')
                expect(response.body.message, 'message').to.eq('Auth token invalid.')

                cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
              })
          })
        })
      })

      it('User was deleted', function () {
        const { username, userId, appName, accessToken, authToken } = this.test

        cy
          .request({
            method: 'POST',
            url: endpoint + '/admin/delete-user/',
            body: {
              username,
              userId,
              appName
            }
          })
          .then(function () {

            cy
              .request({
                method: 'GET',
                url: AUTH_TOKEN_ENDPOINT + authToken,
                failOnStatusCode: false,
                auth: {
                  bearer: accessToken
                }
              })
              .then(function (response) {
                expect(response.status, 'status').to.eq(404)
                expect(response.body, 'key').to.have.key('message')
                expect(response.body.message, 'message').to.eq('User was deleted.')

                cy.request({ method: 'POST', url: DELETE_ADMIN_ENDPOINT })
              })
          })
      })
    })
  })
})
