import { getRandomString } from '../../support/utils'

const USER_ENDPOINT = Cypress.env('endpoint') + '/admin/users/'

// makes a new App ID and Access Token available for each test
const createAdmin = function (that, signUp) {
  const randomAdmin = 'test-admin-' + getRandomString() + '@test.com'
  const password = getRandomString()

  const { endpoint } = Cypress.env()

  cy
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
          that.currentTest.appId = appId

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
              that.currentTest.accessToken = accessToken

              signUp(that)
            })
        })
    })
}

const beforeEachHook = function () {
  cy.visit('./cypress/integration/index.html').then(function (win) {

    // callback to sign up a user invoked after new admin + app are created
    function signUp(that) {
      expect(win).to.have.property('userbase')
      const userbase = win.userbase
      that.currentTest.userbase = userbase

      const { endpoint } = Cypress.env()
      win._userbaseEndpoint = endpoint
      userbase.init({ appId: that.currentTest.appId })

      const randomUser = 'test-user-' + getRandomString()
      const password = getRandomString()
      const rememberMe = 'none'

      function signUpWrapper() {
        return new Cypress.Promise((resolve, reject) => {
          userbase
            .signUp({
              username: randomUser,
              password,
              rememberMe
            })
            .then((user) => resolve(user))
            .catch((e) => reject(e))
        })
      }

      cy.wrap(null).then(() => {
        return signUpWrapper().then((user) => {
          that.currentTest.username = randomUser
          that.currentTest.password = password
          that.currentTest.userId = user.userId
        })
      })
    }

    createAdmin(this, signUp)
  })
}

describe('GetUser', function () {
  const { endpoint } = Cypress.env()
  const USER_ENDPOINT = endpoint + '/admin/users/'

  describe('Success Tests', function () {
    beforeEach(function () { beforeEachHook() })

    it('Default behavior', function () {
      const {
        userId,
        username,
        appId,
        accessToken
      } = this.test

      cy
        .request({
          method: 'GET',
          url: USER_ENDPOINT + userId,
          auth: {
            bearer: accessToken
          }
        })
        .then(function (response) {
          expect(response.status, 'status').to.eq(200)

          expect(response.body, 'keys').to.have.keys(['username', 'userId', 'appId', 'creationDate'])

          expect(response.body.username, 'username').to.eq(username)
          expect(response.body.userId, 'userId').to.eq(userId)
          expect(response.body.appId, 'appId').to.eq(appId)

          cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
        })
    })

  })

  describe('Failure Tests', function () {

    describe('Authorization', function () {

      it('Authorization header missing', function () {
        cy
          .request({
            method: 'GET',
            url: USER_ENDPOINT + 'fake-user-id',
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
            url: USER_ENDPOINT + 'fake-user-id',
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
            url: USER_ENDPOINT + 'fake-user-id',
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
            url: USER_ENDPOINT + 'fake-user-id',
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
            url: USER_ENDPOINT + 'fake-user-id',
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

    describe('GetUser failures', function () {
      beforeEach(function () { beforeEachHook() })

      it('User ID is incorrect length', function () {
        cy
          .request({
            method: 'GET',
            url: USER_ENDPOINT + 'fake-user-id',
            failOnStatusCode: false,
            auth: {
              bearer: this.test.accessToken
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('User ID is incorrect length.')

            cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
          })
      })

      it('User not found', function () {
        cy
          .request({
            method: 'GET',
            url: USER_ENDPOINT + '000000000000000000000000000000000000',
            failOnStatusCode: false,
            auth: {
              bearer: this.test.accessToken
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(404)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('User not found.')

            cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
          })
      })

    })

  })

})

describe('UpdateUser', function () {
  describe('Success Tests', function () {
    beforeEach(function () { beforeEachHook() })

    it('Default behavior', function () {
      const {
        userId,
        accessToken
      } = this.test

      cy
        .request({
          method: 'POST',
          url: USER_ENDPOINT + userId,
          auth: {
            bearer: accessToken
          },
          body: {
            protectedProfile: {
              'Hello': 'World!'
            }
          }
        })
        .then(function (response) {
          expect(response.status, 'status').to.eq(200)
          expect(response.body, 'no body').to.be.undefined

          cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
        })
    })

    it('GetUser after UpdateUser sets protected profile', function () {
      const {
        userId,
        username,
        appId,
        accessToken
      } = this.test

      const protectedProfile = { 'Hello': 'World!' }

      cy
        .request({
          method: 'POST',
          url: USER_ENDPOINT + userId,
          auth: {
            bearer: accessToken
          },
          body: {
            protectedProfile
          }
        })
        .then(function (response) {
          expect(response.status, 'status').to.eq(200)
          expect(response.body, 'no body').to.be.undefined

          cy
            .request({
              method: 'GET',
              url: USER_ENDPOINT + userId,
              auth: {
                bearer: accessToken
              }
            })
            .then(function (response) {
              expect(response.status, 'status').to.eq(200)

              expect(response.body, 'keys').to.have.keys(['username', 'userId', 'appId', 'creationDate', 'protectedProfile'])

              expect(response.body.username, 'username').to.eq(username)
              expect(response.body.userId, 'userId').to.eq(userId)
              expect(response.body.appId, 'appId').to.eq(appId)
              expect(response.body.protectedProfile, 'protectedProfile').to.deep.equal(protectedProfile)

              cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
            })
        })
    })

    it('userbase.signIn after UpdateUser sets protected profile', function () {
      const {
        userId,
        username,
        password,
        userbase,
        accessToken
      } = this.test

      const protectedProfile = { 'Hello': 'World!' }

      function signOut() {
        return new Cypress.Promise(function (resolve, reject) {
          userbase.signOut()
            .then(() => resolve())
            .catch((e) => reject(e))
        })
      }

      cy.wrap(null).then(() => {
        return signOut().then(function () {
          cy
            .request({
              method: 'POST',
              url: USER_ENDPOINT + userId,
              auth: {
                bearer: accessToken
              },
              body: {
                protectedProfile
              }
            })
            .then(function (response) {
              expect(response.status, 'status').to.eq(200)
              expect(response.body, 'no body').to.be.undefined

              function signIn() {
                return new Cypress.Promise(function (resolve, reject) {
                  userbase.signIn({ username, password, rememberMe: 'none' })
                    .then((user) => resolve(user))
                    .catch((e) => reject(e))
                })
              }

              cy.wrap(null).then(() => {
                return signIn().then(function (user) {
                  expect(user, 'keys').to.have.keys(['userId', 'username', 'protectedProfile'])

                  expect(user.userId, 'userId').to.eq(userId)
                  expect(user.username, 'username').to.eq(username)
                  expect(user.protectedProfile, 'protectedProfile').to.deep.equal(protectedProfile)

                  cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
                })
              })

            })
        })
      })
    })

    it('Protected profile as false', function () {
      const {
        userId,
        accessToken
      } = this.test

      cy
        .request({
          method: 'POST',
          url: USER_ENDPOINT + userId,
          auth: {
            bearer: accessToken
          },
          body: {
            protectedProfile: false
          }
        })
        .then(function (response) {
          expect(response.status, 'status').to.eq(200)
          expect(response.body, 'no body').to.be.undefined

          cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
        })
    })

    it('Protected profile as null', function () {
      const {
        userId,
        accessToken
      } = this.test

      cy
        .request({
          method: 'POST',
          url: USER_ENDPOINT + userId,
          auth: {
            bearer: accessToken
          },
          body: {
            protectedProfile: null
          }
        })
        .then(function (response) {
          expect(response.status, 'status').to.eq(200)
          expect(response.body, 'no body').to.be.undefined

          cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
        })
    })

    it('GetUser after UpdateUser sets protected profile to false', function () {
      const {
        userId,
        username,
        appId,
        accessToken
      } = this.test

      const protectedProfile = { 'Hello': 'World!' }

      cy
        .request({
          method: 'POST',
          url: USER_ENDPOINT + userId,
          auth: {
            bearer: accessToken
          },
          body: {
            protectedProfile
          }
        })
        .then(function (response) {
          expect(response.status, 'status').to.eq(200)
          expect(response.body, 'no body').to.be.undefined

          cy
            .request({
              method: 'POST',
              url: USER_ENDPOINT + userId,
              auth: {
                bearer: accessToken
              },
              body: {
                protectedProfile: false
              }
            })
            .then(function (response) {
              expect(response.status, 'status').to.eq(200)
              expect(response.body, 'no body').to.be.undefined

              cy
                .request({
                  method: 'GET',
                  url: USER_ENDPOINT + userId,
                  auth: {
                    bearer: accessToken
                  }
                })
                .then(function (response) {
                  expect(response.status, 'status').to.eq(200)

                  expect(response.body, 'keys').to.have.keys(['username', 'userId', 'appId', 'creationDate'])

                  expect(response.body.username, 'username').to.eq(username)
                  expect(response.body.userId, 'userId').to.eq(userId)
                  expect(response.body.appId, 'appId').to.eq(appId)

                  cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
                })
            })
        })
    })

    it('GetUser after UpdateUser sets protected profile to null', function () {
      const {
        userId,
        username,
        appId,
        accessToken
      } = this.test

      const protectedProfile = { 'Hello': 'World!' }

      cy
        .request({
          method: 'POST',
          url: USER_ENDPOINT + userId,
          auth: {
            bearer: accessToken
          },
          body: {
            protectedProfile
          }
        })
        .then(function (response) {
          expect(response.status, 'status').to.eq(200)
          expect(response.body, 'no body').to.be.undefined

          cy
            .request({
              method: 'POST',
              url: USER_ENDPOINT + userId,
              auth: {
                bearer: accessToken
              },
              body: {
                protectedProfile: null
              }
            })
            .then(function (response) {
              expect(response.status, 'status').to.eq(200)
              expect(response.body, 'no body').to.be.undefined

              cy
                .request({
                  method: 'GET',
                  url: USER_ENDPOINT + userId,
                  auth: {
                    bearer: accessToken
                  }
                })
                .then(function (response) {
                  expect(response.status, 'status').to.eq(200)

                  expect(response.body, 'keys').to.have.keys(['username', 'userId', 'appId', 'creationDate'])

                  expect(response.body.username, 'username').to.eq(username)
                  expect(response.body.userId, 'userId').to.eq(userId)
                  expect(response.body.appId, 'appId').to.eq(appId)

                  cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
                })
            })
        })
    })

    it('userbase.signIn after UpdateUser sets protected profile to false', function () {
      const {
        userId,
        username,
        password,
        userbase,
        accessToken
      } = this.test

      const protectedProfile = { 'Hello': 'World!' }

      function signOut() {
        return new Cypress.Promise(function (resolve, reject) {
          userbase.signOut()
            .then(() => resolve())
            .catch((e) => reject(e))
        })
      }

      cy.wrap(null).then(() => {
        return signOut().then(function () {
          cy
            .request({
              method: 'POST',
              url: USER_ENDPOINT + userId,
              auth: {
                bearer: accessToken
              },
              body: {
                protectedProfile
              }
            })
            .then(function (response) {
              expect(response.status, 'status').to.eq(200)
              expect(response.body, 'no body').to.be.undefined


              cy
                .request({
                  method: 'POST',
                  url: USER_ENDPOINT + userId,
                  auth: {
                    bearer: accessToken
                  },
                  body: {
                    protectedProfile: false
                  }
                })
                .then(function (response) {
                  expect(response.status, 'status').to.eq(200)
                  expect(response.body, 'no body').to.be.undefined

                  function signIn() {
                    return new Cypress.Promise(function (resolve, reject) {
                      userbase.signIn({ username, password, rememberMe: 'none' })
                        .then((user) => resolve(user))
                        .catch((e) => reject(e))
                    })
                  }

                  cy.wrap(null).then(() => {
                    return signIn().then(function (user) {
                      expect(user, 'keys').to.have.keys(['userId', 'username'])

                      expect(user.userId, 'userId').to.eq(userId)
                      expect(user.username, 'username').to.eq(username)

                      cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
                    })
                  })

                })
            })
        })
      })
    })

    it('userbase.signIn after UpdateUser sets protected profile to null', function () {
      const {
        userId,
        username,
        password,
        userbase,
        accessToken
      } = this.test

      const protectedProfile = { 'Hello': 'World!' }

      function signOut() {
        return new Cypress.Promise(function (resolve, reject) {
          userbase.signOut()
            .then(() => resolve())
            .catch((e) => reject(e))
        })
      }

      cy.wrap(null).then(() => {
        return signOut().then(function () {
          cy
            .request({
              method: 'POST',
              url: USER_ENDPOINT + userId,
              auth: {
                bearer: accessToken
              },
              body: {
                protectedProfile
              }
            })
            .then(function (response) {
              expect(response.status, 'status').to.eq(200)
              expect(response.body, 'no body').to.be.undefined


              cy
                .request({
                  method: 'POST',
                  url: USER_ENDPOINT + userId,
                  auth: {
                    bearer: accessToken
                  },
                  body: {
                    protectedProfile: null
                  }
                })
                .then(function (response) {
                  expect(response.status, 'status').to.eq(200)
                  expect(response.body, 'no body').to.be.undefined

                  function signIn() {
                    return new Cypress.Promise(function (resolve, reject) {
                      userbase.signIn({ username, password, rememberMe: 'none' })
                        .then((user) => resolve(user))
                        .catch((e) => reject(e))
                    })
                  }

                  cy.wrap(null).then(() => {
                    return signIn().then(function (user) {
                      expect(user, 'keys').to.have.keys(['userId', 'username'])

                      expect(user.userId, 'userId').to.eq(userId)
                      expect(user.username, 'username').to.eq(username)

                      cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
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
            method: 'POST',
            url: USER_ENDPOINT + 'fake-user-id',
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
            method: 'POST',
            url: USER_ENDPOINT + 'fake-user-id',
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
            method: 'POST',
            url: USER_ENDPOINT + 'fake-user-id',
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
            method: 'POST',
            url: USER_ENDPOINT + 'fake-user-id',
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
            method: 'POST',
            url: USER_ENDPOINT + 'fake-user-id',
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

    describe('UpdateUser failures', function () {
      beforeEach(function () { beforeEachHook() })

      it('User ID is incorrect length', function () {
        const {
          accessToken
        } = this.test

        cy
          .request({
            method: 'POST',
            url: USER_ENDPOINT + 'fake-user-id',
            failOnStatusCode: false,
            auth: {
              bearer: accessToken
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('User ID is incorrect length.')

            cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
          })
      })

      it('User not found', function () {
        const {
          accessToken
        } = this.test

        cy
          .request({
            method: 'POST',
            url: USER_ENDPOINT + '000000000000000000000000000000000000',
            failOnStatusCode: false,
            auth: {
              bearer: accessToken
            },
            body: {
              protectedProfile: {
                hello: 'world'
              }
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(404)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('User not found.')

            cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
          })
      })

      it('Protected profile missing', function () {
        const {
          userId,
          accessToken
        } = this.test

        cy
          .request({
            method: 'POST',
            url: USER_ENDPOINT + userId,
            failOnStatusCode: false,
            auth: {
              bearer: accessToken
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'key').to.have.key('message')
            expect(response.body.message, 'message').to.eq('Protected profile missing.')

            cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
          })
      })

      it('ProfileMustBeObject', function () {
        const {
          userId,
          accessToken
        } = this.test

        cy
          .request({
            method: 'POST',
            url: USER_ENDPOINT + userId,
            failOnStatusCode: false,
            auth: {
              bearer: accessToken
            },
            body: {
              protectedProfile: 'error'
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'key').to.have.keys(['name', 'message'])
            expect(response.body.name, 'name').to.eq('ProfileMustBeObject')
            expect(response.body.message, 'message').to.eq('Profile must be a flat JSON object.')

            cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
          })
      })

      it('ProfileCannotBeEmpty', function () {
        const {
          userId,
          accessToken
        } = this.test

        cy
          .request({
            method: 'POST',
            url: USER_ENDPOINT + userId,
            failOnStatusCode: false,
            auth: {
              bearer: accessToken
            },
            body: {
              protectedProfile: {}
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'key').to.have.keys(['name', 'message'])
            expect(response.body.name, 'name').to.eq('ProfileCannotBeEmpty')
            expect(response.body.message, 'message').to.eq('Profile cannot be empty.')

            cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
          })
      })

      it('ProfileHasTooManyKeys', function () {
        const {
          userId,
          accessToken
        } = this.test

        const maxKeys = 100
        const protectedProfile = {}
        for (let i = 0; i <= maxKeys; i++) protectedProfile[i] = 'hello'

        cy
          .request({
            method: 'POST',
            url: USER_ENDPOINT + userId,
            failOnStatusCode: false,
            auth: {
              bearer: accessToken
            },
            body: {
              protectedProfile
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'key').to.have.keys(['name', 'message', 'maxKeys'])
            expect(response.body.name, 'name').to.eq('ProfileHasTooManyKeys')
            expect(response.body.message, 'message').to.eq(`Profile has too many keys. Must have a max of ${maxKeys} keys.`)
            expect(response.body.maxKeys, 'maxKeys').to.eq(maxKeys)

            cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
          })
      })

      it('ProfileKeyTooLong', function () {
        const {
          userId,
          accessToken
        } = this.test

        const maxKeyLength = 20
        const a = 'a'.repeat(maxKeyLength + 1)

        cy
          .request({
            method: 'POST',
            url: USER_ENDPOINT + userId,
            failOnStatusCode: false,
            auth: {
              bearer: accessToken
            },
            body: {
              protectedProfile: {
                [a]: 'hello'
              }
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'keys').to.have.keys(['key', 'name', 'message', 'maxLen'])
            expect(response.body.key, 'key').to.eq(a)
            expect(response.body.name, 'name').to.eq('ProfileKeyTooLong')
            expect(response.body.message, 'message').to.eq(`Profile key too long. Must be a max of ${maxKeyLength} characters.`)
            expect(response.body.maxLen, 'maxLen').to.eq(maxKeyLength)

            cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
          })
      })

      it('ProfileValueMustBeString', function () {
        const {
          userId,
          accessToken
        } = this.test

        cy
          .request({
            method: 'POST',
            url: USER_ENDPOINT + userId,
            failOnStatusCode: false,
            auth: {
              bearer: accessToken
            },
            body: {
              protectedProfile: {
                'hello': 0
              }
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'keys').to.have.keys(['key', 'value', 'name', 'message'])
            expect(response.body.name, 'name').to.eq('ProfileValueMustBeString')
            expect(response.body.message, 'message').to.eq('Profile value must be a string.')
            expect(response.body.key, 'key').to.eq('hello')
            expect(response.body.value, 'value').to.eq(0)

            cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
          })
      })

      it('ProfileValueCannotBeBlank', function () {
        const {
          userId,
          accessToken
        } = this.test

        cy
          .request({
            method: 'POST',
            url: USER_ENDPOINT + userId,
            failOnStatusCode: false,
            auth: {
              bearer: accessToken
            },
            body: {
              protectedProfile: {
                'hello': ''
              }
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'keys').to.have.keys(['key', 'name', 'message'])
            expect(response.body.name, 'name').to.eq('ProfileValueCannotBeBlank')
            expect(response.body.message, 'message').to.eq('Profile value cannot be blank.')
            expect(response.body.key, 'key').to.eq('hello')

            cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
          })
      })

      it('ProfileValueTooLong', function () {
        const {
          userId,
          accessToken
        } = this.test

        const maxValueLength = 1000
        const a = 'a'.repeat(maxValueLength + 1)

        cy
          .request({
            method: 'POST',
            url: USER_ENDPOINT + userId,
            failOnStatusCode: false,
            auth: {
              bearer: accessToken
            },
            body: {
              protectedProfile: {
                hello: a
              }
            }
          })
          .then(function (response) {
            expect(response.status, 'status').to.eq(400)
            expect(response.body, 'keys').to.have.keys(['key', 'value', 'name', 'message', 'maxLen'])
            expect(response.body.name, 'name').to.eq('ProfileValueTooLong')
            expect(response.body.message, 'message').to.eq(`Profile value too long. Must be a max of ${maxValueLength} characters.`)
            expect(response.body.key, 'key').to.eq('hello')
            expect(response.body.value, 'value').to.eq(a)
            expect(response.body.maxLen, 'maxLen').to.eq(maxValueLength)

            cy.request({ method: 'POST', url: Cypress.env('endpoint') + '/admin/delete-admin' })
          })
      })

    })

  })

})
