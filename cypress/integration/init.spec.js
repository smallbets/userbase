/// <reference types="Cypress" />


describe('userbase.init function', function () {

  beforeEach(function () {
    cy.visit('./cypress/integration/index.html').then(async function (win) {
      expect(win).to.have.property('userbase')
      const userbase = win.userbase
      // debugger
      this.currentTest.userbase = userbase

      const { appId, endpoint } = Cypress.env()
      await userbase.init({ appId, endpoint }).then((session) => {
        console.log(session)
      })
      // debugger
    })
  })



  it('Check init function', async function () {
    // https://userbase.dev/docs/sdk/init/
    const userbase = this.test.userbase
    const randomUser = 'test-user-' + Math.random().toString().substring(2)
    const password = Math.random().toString().substring(2)
    const email = null
    const profile = null
    const showKeyHandler = () => { }
    const rememberMe = false
    const backUpKey = true
    const { appId, endpoint } = Cypress.env()

    await userbase.signUp(randomUser, password, email, profile, showKeyHandler, rememberMe, backUpKey).then((user) => {
      // cy.log('user:', user)

    })
    await userbase.signOut().then(() => {
      console.log("successfully loggedout")
    })
    await userbase.init({ appId, endpoint })
      .then((session) => {
        console.log(session)
      })
      .catch((e) => {
        console.log(e)
      })

  })

})
