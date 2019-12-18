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

  it.only('Check db status with existing user', function () {
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
          // debugger
          cy.log('DB status:' + JSON.stringify(items) + 'changeHandler Called ' + String(spy.callCount) + 'times')
        }
      }
      const spy = cy.spy(spyChangeHandler, 'changeHandler')
      const randomString = function () { return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) }
      const randomDB = randomString() + "-db"
      cy.log(randomDB)

      userbase.init({ appId: info.appId, endpoint: info.endpoint, keyNotFoundHandler })
      userbase.signIn(info.username, info.password)
        .then((user) => {
          // cy.log('user', user)
          userbase.openDatabase(randomDB, spyChangeHandler.changeHandler)
            .then(() => {

              expect(spy, 'Checks if the changeHandler has being called first time').to.be.called
              itemsToInsert.forEach((item, index) => {
                userbase.insertItem(randomDB, item, index.toString())
                  .then(() => {
                    cy.log('inserting ' + JSON.stringify(item) + ' ' + index.toString())
                    expect(spy, 'Checks if the changeHandler has being called inserting').to.be.called
                    userbase.deleteItem(randomDB, index.toString())
                      .then(() => {
                        cy.log('deleting ' + JSON.stringify(item) + ' ' + index.toString())
                        expect(spy, 'Checks if the changeHandler has being called deleting').to.be.called
                      })
                  })
              })
              cy.wait(1000)
            })
        })
        .catch((e) => {
          cy.log('error', e)
        })
    })
  })

  it('Cleanup the DB', function () {
    cy.window().then(({ userbase }) => {
      function keyNotFoundHandler() {
        userbase.importKey(info.key)
      }
      const spyChangeHandler = {
        changeHandler: function (items) {
          if (spy.callCount == 1) {
            // expect(items).to.be.empty
          }
          // debugger
          cy.log('DB status:' + JSON.stringify(items) + 'changeHandler Called ' + String(spy.callCount) + 'times')
        }
      }
      const spy = cy.spy(spyChangeHandler, 'changeHandler')

      const itemsToInsert = [
        { 'item0': "item0" },
        { 'item1': 2 },
        { 'item2': { 'key': 'value' } },
        { 'item3': 3 }
      ]

      userbase.init({ appId: info.appId, endpoint: info.endpoint, keyNotFoundHandler })
      userbase.signIn(info.username, info.password)
        .then((user) => {
          userbase.openDatabase(info.dbName, spyChangeHandler.changeHandler)
            .then(() => {
              itemsToInsert.forEach((item, index) => {
                userbase.deleteItem(info.dbName, index.toString())
                  .then(() => {
                    cy.wait(1002)
                    cy.log('deleting ' + JSON.stringify(item) + ' ' + index.toString())
                    expect(spy, 'Checks if the changeHandler has being called deleting').to.be.called
                    cy.wait(1003)
                  })
              })
            })
        })
    })
  })


})
