/// <reference types="Cypress" />

describe('Login - Signup Testing', function () {
  let info = {}

  beforeEach(() => {
    info = Cypress.env()
    cy.visit('./cypress/integration/index.html').then((win) => {
      expect(win).to.have.property('userbase')
      cy.clearLocalStorage()
    })
  })

  it('Check all the endpoints exists', function () {
    cy.window().then(({ userbase }) => {
      expect(userbase)
      expect(userbase).to.respondTo('signIn')
      expect(userbase).to.respondTo('signUp')
      expect(userbase).to.respondTo('signOut')
      expect(userbase).to.respondTo('updateUser')
      expect(userbase).to.respondTo('deleteUser')
      expect(userbase).to.respondTo('openDatabase')
      expect(userbase).to.respondTo('insertItem')
      expect(userbase).to.respondTo('updateItem')
      expect(userbase).to.respondTo('deleteItem')
      expect(userbase).to.respondTo('putTransaction')
    })
  })

  it('Signup/Logout/Signin a new user in same browser, rememberMe=local', function () {

    let randomInfo
    let loginInfo
    cy.getRandomInfoWithParams(null, null, 'local').then((userInfo) => {
      randomInfo = userInfo
      loginInfo = { username: userInfo.username, password: userInfo.password }
    })

    cy.window().then(({ userbase, window }) => {
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })
      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        expect(user.username, 'user.username').to.exists
        expect(user.username, 'user.username to be the one signed up').to.equal(randomInfo.username)
        const currentSession = JSON.parse(localStorage.getItem('userbaseCurrentSession'))
        cy.log('session current user', localStorage.getItem('userbaseCurrentSession'))
        expect(currentSession).to.exist
        expect(currentSession).to.haveOwnProperty('signedIn')
        expect(currentSession.signedIn, 'signedIn should be true').to.be.true
        expect(currentSession.sessionId, 'sessionId should exists').to.be.not.null
        expect(currentSession.creationDate, 'creationDate should exists').to.be.not.null
        let creationTime = new Date(currentSession.creationDate)
        let now = new Date()
        expect(now >= creationTime, 'creationDate should be in the past').to.be.true
        return userbase.signOut().then(() => {
          const loggedOutSession = JSON.parse(localStorage.getItem('userbaseCurrentSession'))
          cy.log(loggedOutSession)
          expect(loggedOutSession.signedIn, 'session should have signedIn set to false').to.be.false
          expect(loggedOutSession.username, 'username should be the same after signout').to.equal(randomInfo.username)
          cy.clearLocalStorage()
          return userbase.signIn(loginInfo).then((user) => {
            cy.log('user', user)
            expect(user.username, 'login should set the username').to.exist.and.to.equal(randomInfo.username)
            return userbase.deleteUser().then(() => {
              window.sessionStorage.clear()
            })
          })

        })
      })
    })
  })

  it('Signup/Logout/Signin a new user in same browser, rememberMe=session', function () {
    let randomInfo
    let loginInfo
    cy.getRandomInfoWithParams(null, null, 'session').then((userInfo) => {
      randomInfo = userInfo
      loginInfo = { username: userInfo.username, password: userInfo.password }
    })

    cy.window().then(({ userbase, window }) => {
      window.sessionStorage.clear()
      cy.clearLocalStorage()
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })
      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        expect(user.username, 'user.username').to.exists
        expect(user.username, 'user.username to be the one signed up').to.equal(randomInfo.username)
        expect(sessionStorage.length, 'sessionStorage size').to.equal(2)
        return userbase.signOut().then(() => {
          const loggedOutSession = JSON.parse(sessionStorage.getItem('userbaseCurrentSession'))
          cy.log(loggedOutSession)
          expect(loggedOutSession.signedIn, 'session should have signedIn set to false').to.be.false
          expect(loggedOutSession.username, 'username should be the same after signout').to.equal(randomInfo.username)
          window.sessionStorage.clear()
          return userbase.signIn(loginInfo).then((user) => {
            cy.log('user', user)
            expect(user.username, 'login should set the username').to.exist.and.to.equal(randomInfo.username)
            return userbase.deleteUser().then(() => {
              window.sessionStorage.clear()
            })
          })
        })
      })
    })
  })

  it('Signin with + character in username', function () {
    cy.getRandomInfoWithParams(null, null, 'none').then((randomInfo) => {
      cy.window().then((window) => {
        const { userbase } = window
        window._userbaseEndpoint = info.endpoint
        userbase.init({ appId: info.appId })

        randomInfo.username += '+'

        return userbase.signUp(randomInfo).then((user) => {
          expect(user.username, 'user.username').to.exists
          expect(user.username, 'user.username to be the one signed up').to.equal(randomInfo.username)

          return userbase.signOut().then(() => {
            return userbase.signIn(randomInfo).then((loggedInUser) => {
              expect(loggedInUser.username, 'loggedInUser.username').to.exists
              expect(loggedInUser.username, 'loggedInUser.username to be the one signed in').to.equal(randomInfo.username)

              return userbase.deleteUser()
            })
          })
        })
      })
    })

  })

})
