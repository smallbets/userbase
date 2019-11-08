/// <reference types="Cypress" />

describe('Configure the env', function () {
  let info = {}
  let infoExistingUser = {}
  beforeEach(() => {
    cy.visit('./cypress/integration/index.html').then((win) => {
      expect(win).to.have.property('userbase')
    })
    cy.getLoginInfo().then((loginInfo) => {
      info = loginInfo
    })
    cy.getLoginInfo(true).then((loginInfo) => {
      infoExistingUser = loginInfo
    })
  })

  it('Check all the endpoints exists', function () {
    cy.window().then(({ userbase }) => {
      expect(userbase)
      expect(userbase).to.respondTo('signIn')
      expect(userbase).to.respondTo('signUp')
      expect(userbase).to.respondTo('signInWithSession')
      expect(userbase).to.respondTo('signOut')
      expect(userbase).to.respondTo('openDatabase')
      expect(userbase).to.respondTo('insert')
      expect(userbase).to.respondTo('update')
      expect(userbase).to.respondTo('delete')
      expect(userbase).to.respondTo('transaction')
    })
  })

  it('Signup/Logout/Signin a new user', function () {
    cy.window().then(({ userbase }) => {
      userbase.configure({ appId: info.appId, endpoint: info.endpoint })
      return userbase.signUp(info.username, info.password).then((user) => {
        cy.log(user)
        expect(user.username, 'user.username').to.exists
        expect(user.username, 'user.username to be the one signed up').to.equal(info.username)
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
          expect(loggedOutSession.username, 'username should be the same after signout').to.equal(info.username)

          cy.clearLocalStorage()
          return userbase.signIn(info.username, info.password).then((user) => {
            cy.log('user', user)
            expect(user.username, 'login should set the username').to.equal(info.username)
            expect(user.key).to.be.not.null
          })
        })
      })
    })
  })
  it('Login without configure', function () {
    cy.window().then(({ userbase }) => {
      return userbase.signIn(infoExistingUser.username, infoExistingUser.password).then((user) => {
        cy.log('user', user)
      }).catch((err) => {
        cy.log(err)
        expect(err.name).to.equal('AppIdNotSet')
        expect(err.status).to.equal(400)
      })
    })
  })
  it('Login', function () {
    cy.window().then(({ userbase }) => {
      cy.log(userbase)
      userbase.configure({ appId: infoExistingUser.appId, endpoint: infoExistingUser.endpoint })
      return userbase.signIn(infoExistingUser.username, infoExistingUser.password)
        .then((user) => {
          cy.log('user', user)
        })
    })
  })
})
