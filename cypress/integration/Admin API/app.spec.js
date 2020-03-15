import { getRandomString } from '../../support/utils'

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
    .then(function () {
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
              url: APP_ENDPOINT + appId,
              auth: {
                bearer: accessToken
              }
            })
            .then(function (response) {
              expect(response.status, 'status').to.eq(200)

              expect(response.body, 'app keys').to.have.keys(['users', 'appId', 'appName', 'creationDate'])
              expect(response.body.appId, 'app appId').to.eq(appId)
              expect(response.body.appName, 'app name').to.eq('Trial')

              expect(response.body.users, 'app users').to.have.length(1)
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
