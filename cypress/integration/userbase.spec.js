/// <reference types="Cypress" />

describe('Configure the env', function () {
  beforeEach(() => {
    cy.visit('./cypress/integration/index.html');
    cy.window().should('have.property', 'userbase')
    cy.wait(200);
  })
  it('Load userbase js', function () {
    cy.window().then((win) => {
      expect(win.userbase).to.exists
    })
  })

  describe('Configure the datababase', function () {
    it('reload userbase', function () {
      cy.window().then((win) => {
        win.userbase.configure({ appId: 'a43ae910-fc89-43fe-a7a3-a11a53b49325' });
        cy.log(win.userbase);
        const randomString = function () { return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) }
        const username = randomString() + "-user"
        const password = randomString() + "-pass"
        win.userbase.signUp(username, password)
          .then((session) => {
            // verify the session
            expect(session.username).not.to.be.undefined;
            expect(session.username).to.equal(false);
            expect(session.signedIn).to.be.true;
            assert.isString(session.seed, 'seed should not be empty')
          })
      })
    })
  })
})
