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
      expect(userbase).to.respondTo('insertItem')
      expect(userbase).to.respondTo('updateItem')
      expect(userbase).to.respondTo('deleteItem')
      expect(userbase).to.respondTo('transaction')
    })
  })

  it('Signup/Logout/Signin a new user in same browser, rememberMe=true, backUpKey=true', function () {
    function showKeyHandler(seedString, rememberMe) {
      cy.log('seedString is:', seedString)
      cy.log('rememberMe is:', rememberMe)
      return
    }
    let randomInfo
    cy.getRandomInfoWithParams(showKeyHandler, null, null, true, true).then((loginInfo) => {
      randomInfo = loginInfo
    })

    cy.window().then(({ userbase }) => {
      userbase.init({ appId: info.appId, endpoint: info.endpoint })
      userbase.signUp(randomInfo.username, randomInfo.password, randomInfo.email, randomInfo.profile, randomInfo.showKeyHandler, randomInfo.rememberMe, randomInfo.backUpKey).then((user) => {
        cy.log(user)
        expect(user.username, 'user.username').to.exists
        expect(user.username, 'user.username to be the one signed up').to.equal(randomInfo.username)
        expect(user.key, 'user has to be signed in').not.to.be.empty
        const currentSession = JSON.parse(localStorage.getItem('userbaseCurrentSession'))
        cy.log('session current user', localStorage.getItem('userbaseCurrentSession'))
        expect(currentSession.signedIn, 'signedIn should be true').to.be.true
        expect(currentSession.sessionId, 'sessionId should exists').to.be.not.null
        expect(currentSession.creationDate, 'creationDate should exists').to.be.not.null
        let creationTime = new Date(currentSession.creationDate)
        let now = new Date()
        expect(now >= creationTime, 'creationDate should be in the past').to.be.true
        userbase.signOut().then(() => {
          const loggedOutSession = JSON.parse(localStorage.getItem('userbaseCurrentSession'))
          cy.log(loggedOutSession)

          expect(loggedOutSession.signedIn, 'session should have signedIn set to false').to.be.false
          expect(loggedOutSession.username, 'username should be the same after signout').to.equal(randomInfo.username)

          cy.clearLocalStorage()
          userbase.signIn(randomInfo.username, randomInfo.password).then((user) => {
            cy.log('user', user)
            expect(user.username, 'login should set the username').to.exist.and.to.equal(randomInfo.username)
            expect(user.key, 'user key should be the same as before').to.be.not.null
          })

        })
      })
    })
  })

  it('Signup/Logout/Signin a new user in same browser, rememberMe=false, backUpKey=true', function () {
    const showKeyHandler = function showKeyHandler(seedString, rememberMe) {
      cy.log('seedString is:', seedString)
      cy.log('rememberMe is:', rememberMe)
      return
    }
    let randomInfo
    cy.getRandomInfoWithParams(showKeyHandler, null, null, false, true).then((loginInfo) => {
      randomInfo = loginInfo
    })

    cy.window().then(({ userbase }) => {
      userbase.init({ appId: info.appId, endpoint: info.endpoint })
      userbase.signUp(randomInfo.username, randomInfo.password, randomInfo.email, randomInfo.profile, randomInfo.showKeyHandler, randomInfo.rememberMe, randomInfo.backUpKey).then((user) => {
        cy.log(user)
        expect(user.username, 'user.username').to.exists
        expect(user.username, 'user.username to be the one signed up').to.equal(randomInfo.username)
        expect(user.key, 'user has to be signed in').not.to.be.empty
        expect(localStorage.length, 'localstorage size').to.equal(0)
        let signUpKey = user.key
        userbase.signOut().then(() => {
          userbase.signIn(randomInfo.username, randomInfo.password).then((user) => {
            cy.log('user', user)
            expect(user.username, 'login should set the username').to.exist.and.to.equal(randomInfo.username)
            expect(user.key, 'user key should be the same as before').to.be.not.null
            expect(user.key).to.be.equal(signUpKey)
          })

        })
      })
    })
  })

  it.only('Signup/Logout/Signin a new user in same browser, rememberMe=false, backUpKey=false', function () {

    let randomInfo
    cy.getRandomInfoWithParams(null, null, null, false, false).then((loginInfo) => {
      randomInfo = loginInfo
    })
    let readKey = 'some'
    cy.window().then(({ userbase }) => {
      userbase.init({ appId: info.appId, endpoint: info.endpoint })

      cy.get('.userbase-display-key').invoke('text').then((shownKey) => {
        readKey = shownKey.trim()
        cy.get('#userbase-show-key-modal-close-button').click()
        cy.get('#userbase-secret-key-input').should('exist')
        cy.get('#userbase-secret-key-input').type(readKey)
      })

      cy.get('.userbase-button').click()

      userbase.signUp(randomInfo.username, randomInfo.password, randomInfo.email, randomInfo.profile, randomInfo.showKeyHandler, randomInfo.rememberMe, randomInfo.backUpKey).then((user) => {
        expect(user).to.exist
        expect(user).to.haveOwnProperty('username')
        expect(user.username).to.equal(randomInfo.username)

        userbase.signOut().then(() => {
          userbase.signIn(randomInfo.username, randomInfo.password).then((user) => {
            expect(user, 'In signin').to.exist
            expect(user, 'In signin').to.haveOwnProperty('username')
            expect(user.username).to.equal(randomInfo.username)

          })
        })
      })
    })
  })
})
