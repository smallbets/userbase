/// <reference types="Cypress" />

describe('Configure the env', function () {
  let userbase = {}
  let info = {}
  beforeEach(() => {
    cy.visit('./cypress/integration/index.html', {
      onLoad: (contentWindow) => {
        if (contentWindow.userbase) {
          userbase = contentWindow.userbase
        }
      }
    })
    cy.getLoginInfo().then((loginInfo) => {
      info = loginInfo
    })
  })
  it('Check all the endpoints exists', function () {
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

  it('Sign in', function () {
    // use the standard appId, already created
    userbase.configure({ appId: info.appId })
    // user has to be already signed up to login
    userbase.signIn(info.username, info.password)
    // Simulate user input of the seed
    const seedStub = () => {
      return info.seed
    }
    cy.window().then((win) => {
      cy.stub(win, 'prompt', seedStub).as('seedStubNotNull')
      cy.get('@seedStubNotNull').should('be.calledOnce').then(() => {
        const currentSession = JSON.parse(localStorage.getItem('userbaseCurrentSession'))
        expect(currentSession.username)
        .to.be.equal(sess.username)
        expect(currentSession.signedIn)
        .to.be.true
        expect(currentSession.sessionId)
        .not.to.be.empty
        .and.to.be.string()
      })
    })
  })
})
