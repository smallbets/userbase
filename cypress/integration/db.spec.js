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
      function changeHandler(items) {
        // cy.log('I am the changeHandler, just changed:', items)
        // expect(items).to.deep.equal(itemsToInsert)
      }
      util.changeHandler = changeHandler

      userbase.init({ appId: info.appId, endpoint: info.endpoint, keyNotFoundHandler })
      return userbase.signIn(info.username, info.password)
        .then((user) => {
          cy.log('user', user)
          cy.spy(util, 'changeHandler')
          userbase.openDatabase(info.dbName, util.changeHandler).then(() => {
            expect(util.changeHandler, 'Checks if the changeHandler has being called with empty array').to.be.called
            cy.wait(5000)
            itemsToInsert.forEach((item, index) => {
              userbase.insertItem(info.dbName, item, index.toString()).then((item) => {
                cy.log('Inserted: ', item)
                cy.wait(2000)
                userbase.deleteItem(info.dbName, index.toString()).then((item) => {
                  cy.wait(2000)
                  cy.log('Deleted: ', item)
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
