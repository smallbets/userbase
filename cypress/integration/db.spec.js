/// <reference types="Cypress" />

describe('DB Testing', function () {
  let info = {}
  // let ephemeralLoginInfo = {}

  beforeEach(() => {
    info = Cypress.env()
    cy.visit('./cypress/integration/index.html').then((win) => {
      expect(win).to.have.property('userbase')
    })
  })

  it('Check db status with existing user', function () {
    cy.window().then(({ userbase }) => {
      function keyNotFoundHandler() {
        userbase.importKey(info.key)
      }

      let util = {}
      function changeHandler(items) {
        cy.log('I am in changeHandler')
        return
      }
      util.changeHandler = changeHandler

      userbase.init({ appId: info.appId, endpoint: info.endpoint, keyNotFoundHandler })
      return userbase.signIn(info.username, info.password)
        .then((user) => {
          cy.log('user', user)
          cy.spy(util, 'changeHandler')
          return userbase.openDatabase(info.dbName, util.changeHandler).then(() => {
            expect(util.changeHandler, 'Checks if the changeHandler has being called with empty array').to.be.calledWith([])
          })
        })
        .catch((e) => {
          cy.log('error', e)
        })
    })
  })

  // it('Check db status with existing user', function () {
  //   cy.window().then(({ userbase }) => {
  //     function keyNotFoundHandler() {
  //       userbase.importKey(info.key)
  //     }

  //     userbase.init({ appId: info.appId, endpoint: info.endpoint, keyNotFoundHandler })
  //     cy.getLoginInfo().then((ephemeralLoginInfo) => {
  //       userbase.signIn(ephemeralLoginInfo.username, ephemeralLoginInfo.password, null, null, null, true).then((user) => {
  //         cy.log('user', user)
  //       })

  //     })
  //   })
  // })

})
