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
      const itemsToInsert = [
        { 'item0': "item0" },
        { 'item1': 2 },
        { 'item2': { 'key': 'value' } },
        { 'item3': 3 }
      ]
      const spyChangeHandler = {
        changeHandler: function (items) {
          if (spy.callCount == 1) {
            expect(items).to.be.empty
          }
          cy.log('DB status:' + JSON.stringify(items) + 'changeHandler Called ' + String(spy.callCount) + 'times')
        }
      }
      const spy = cy.spy(spyChangeHandler, 'changeHandler')


      userbase.init({ appId: info.appId, endpoint: info.endpoint, keyNotFoundHandler })
      return userbase.signIn(info.username, info.password)
        .then((user) => {
          cy.log('user', user)
          userbase.openDatabase(info.dbName, spyChangeHandler.changeHandler).then(() => {
            expect(spy, 'Checks if the changeHandler has being called first time').to.be.called
            cy.wait(10000)
            itemsToInsert.forEach((item, index) => {
              userbase.insertItem(info.dbName, item, index.toString()).then((item) => {
                cy.wait(3000)
                expect(spy, 'Checks if the changeHandler has being called inserting').to.be.called
                userbase.deleteItem(info.dbName, index.toString()).then((item) => {
                  cy.wait(3000)
                  expect(spy, 'Checks if the changeHandler has being called deleting').to.be.called
                })
              })
            })
          })
        })
        .catch((e) => {
          cy.log('error', e)
        })
    })
  })

})
