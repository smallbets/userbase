/// <reference types="Cypress" />

describe('Configure the env', function () {
  beforeEach(() => {
    cy.visit('./cypress/integration/index.html');
    cy.window().should('have.property', 'userbase')
    cy.wait(200)
  })
  it('Load userbase js', function () {
    cy.window().then((win) => {
      expect(win.userbase).to.exist
    })
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



  // it('Signup the user', function () {
  //   const loginInfo = cy.getLoginInfo()
  //   cy.window().then((win) => {
  //     win.userbase.configure({ appId: 'a43ae910-fc89-43fe-a7a3-a11a53b49325' })
  //     cy.log(win.userbase)
  //     return win.userbase.signUp(loginInfo.username, loginInfo.password)
  //       .then((session) => {
  //         expect(session.username, 'session.username').not.to.be.undefined
  //         expect(session.username, 'session.username to be equal to username').to.equal(loginInfo.username)
  //         expect(session.signedIn, 'user has to be signed in').to.be.true
  //         expect(session.seed, 'seed should not be empty').not.to.be.empty
  //         return win.userbase.openDatabase('test', databaseChange)
  //       })
  //   })
  // })
  it('Fill the database', function () {
    let info = {}

    cy.getLoginInfo().then( (loginInfo) => {
      info = loginInfo
    })

    cy.window().then((win) => {
      cy.signup(win.userbase).then((session) => {
        cy.log('session:', session)
        sess = session
        // cy.wait(3000)
        return win.userbase.openDatabase(info.db, databaseChange)
        })
      })
    })
  it('Sign in', function () {
    let info = {}
    cy.getLoginInfo().then((loginInfo) => {
      info = loginInfo
    })
    cy.window().then( (win) => {
      win.userbase.configure({ appId: info.appId })
      cy.log('sess: ', sess)
      cy.wait(2000)
      win.userbase.signIn(info.username, info.password).then()
    })
  })
})

  // return win.userbase.signIn(username, password).then( (session) => {
  //   expect(true).to.be.false
      // return win.userbase.openDatabase('test', databaseChange).then(() => { expect(true).to.be.false } )
