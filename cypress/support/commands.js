// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

const randomString = function () { return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) }
const randomUsername = randomString() + "-user"
const randomPassword = randomString() + "-pass"

Cypress.Commands.add("getLoginInfo", () => {
  const loginInfo = {
    'username': randomUsername,
    'password': randomPassword,
  }
  cy.log('getting new login info:', loginInfo)
  cy.wrap(loginInfo)
})

Cypress.Commands.add("getRandomInfoWithParams", (showKeyHandler, email, profile, rememberMe, backUpKey) => {
  class RandomInfo {
    constructor() {
      this.username = randomString() + "-userrand",
      this.password = randomString() + "-pass",
      this.email = email,
      this.profile = profile,
      this.rememberMe = rememberMe,
      this.backUpKey = backUpKey
    }
  }
  RandomInfo.prototype.showKeyHandler = showKeyHandler
  cy.wrap(new RandomInfo())
})
