/// <reference types="Cypress" />

describe('Login - Signup Testing', function () {
  let ephemeralLoginInfo = {}
  let info = {}

  beforeEach(() => {
    info = Cypress.env()
    cy.visit('./cypress/integration/index.html').then((win) => {
      expect(win).to.have.property('userbase')
    })
    cy.getLoginInfo().then((loginInfo) => {
      ephemeralLoginInfo = loginInfo
    })
  })

  it('Check all the endpoints exists', function () {
    cy.window().then(({ userbase }) => {
      expect(userbase)
      expect(userbase).to.respondTo('signIn')
      expect(userbase).to.respondTo('signUp')
      expect(userbase).to.respondTo('signOut')
      expect(userbase).to.respondTo('openDatabase')
      expect(userbase).to.respondTo('insert')
      expect(userbase).to.respondTo('update')
      expect(userbase).to.respondTo('delete')
      expect(userbase).to.respondTo('transaction')
    })
  })

  it('Signup/Logout/Signin a new user in same browser', function () {
    function showKeyHandler(seedString, rememberMe) {
      cy.log('seedString is:', seedString)
      cy.log('rememberMe is:', rememberMe)
      return
    }

    cy.window().then(({ userbase }) => {
      userbase.init({ appId: info.appId, endpoint: info.endpoint })
      return userbase.signUp(ephemeralLoginInfo.username, ephemeralLoginInfo.password, null, null, showKeyHandler, true).then((user) => {
        cy.log(user)
        expect(user.username, 'user.username').to.exists
        expect(user.username, 'user.username to be the one signed up').to.equal(ephemeralLoginInfo.username)
        expect(user.key, 'user has to be signed in').not.to.be.empty
        const currentSession = JSON.parse(localStorage.getItem('userbaseCurrentSession'))
        cy.log('session current user', localStorage.getItem('userbaseCurrentSession'))
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
          expect(loggedOutSession.username, 'username should be the same after signout').to.equal(ephemeralLoginInfo.username)

          cy.clearLocalStorage()
          return userbase.signIn(ephemeralLoginInfo.username, ephemeralLoginInfo.password).then((user) => {
            cy.log('user', user)
            expect(user.username, 'login should set the username').to.exist.and.to.equal(ephemeralLoginInfo.username)
            expect(user.key, 'user key should be the same as before').to.be.not.null
          })

        })
      })
    })
  })
  it('Login existing user in fresh browser', function () {
    cy.window().then(({ userbase }) => {
      userbase.init({ appId: info.appId, endpoint: info.endpoint })
      userbase.signIn(info.username, info.password).then( (user) => {
        cy.log('user content is:', user)
        expect(user).to.exist
        expect(user).to.haveOwnProperty('username')
        expect(user.username).to.equal(info.username)
       expect(user.key).to.equal(info.key)
      })
      cy.get('#userbase-secret-key-input').should('exist')
      cy.get('#userbase-secret-key-input').type(info.key)
      cy.get('.userbase-button').click()
    })
  })

})
