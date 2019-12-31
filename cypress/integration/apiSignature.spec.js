/// <reference types="Cypress" />

describe('Api signature', function () {

  beforeEach(() => {
    cy.visit('./cypress/integration/index.html').then((win) => {
      expect(win).to.have.property('userbase')
    })
  })

  it('Check all the user enpoints exists', function () {
    cy.window().then(({ userbase }) => {
      expect(userbase).to.be.an('object')
      expect(userbase).to.respondTo('init')
      expect(userbase).to.respondTo('signIn')
      expect(userbase).to.respondTo('signUp')
      expect(userbase).to.respondTo('signOut')
      expect(userbase).to.respondTo('getLastUsedUsername')
      expect(userbase).to.respondTo('importKey')
      expect(userbase).to.respondTo('forgotPassword')
      expect(userbase).to.respondTo('updateUser')
      expect(userbase).to.respondTo('deleteUser')
    })
  })
  it('Check all the DB enpoints exists', function () {
    cy.window().then(({ userbase }) => {
      expect(userbase).to.respondTo('openDatabase')
      expect(userbase).to.respondTo('insertItem')
      expect(userbase).to.respondTo('updateItem')
      expect(userbase).to.respondTo('deleteItem')
      expect(userbase).to.respondTo('transaction')
    })
  })
})
