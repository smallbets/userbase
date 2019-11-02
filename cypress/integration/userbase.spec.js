/// <reference types="Cypress" />

describe('Configure the env', function () {
  let userbase = {}
  let info = {}
  beforeEach(() => {
    cy.visit('./cypress/integration/index.html');
    cy.window().then((win) => {
      userbase = win.userbase
    })
    cy.window().should('have.property', 'userbase')
    cy.wait(200)
    cy.getLoginInfo().then((loginInfo) => {
      info = loginInfo
    })
  })
  it('Load userbase js', function () {
    expect(userbase).to.haveOwnProperty('signIn')
  })

  let database = []
  let sess = {}
  const databaseChange = function (items) {
    // clear the database variable
    database = []

    // copy all the iterms to the database
    for (let i = 0; i < items.length; i++) {
      database.push(items[i])
    }
  }


  it('Signup the user', function () {
    cy.signup(userbase).then((session) => {
      sess = session
      expect(session.username, 'session.username').not.to.be.false
      expect(session.username, 'session.username to be equal to username').to.equal(info.username)
      expect(session.signedIn, 'user has to be signed in').to.be.true
      expect(session.seed, 'seed should not be empty').not.to.be.empty
      return userbase.openDatabase(info.db, databaseChange)
    })
  })
  // it('Fill the database', function () {
  //   userbase.configure({ appId: info.appId })
  //   return userbase.openDatabase(info.db, databaseChange)
  //   })
  it('Sign in', function () {
      userbase.configure({ appId: info.appId })
      // user has to be already signed up to login
      cy.log('sess: ', sess)
      userbase.signIn(info.username, info.password).then()
  })
})

  // return win.userbase.signIn(username, password).then( (session) => {
  //   expect(true).to.be.false
      // return win.userbase.openDatabase('test', databaseChange).then(() => { expect(true).to.be.false } )
