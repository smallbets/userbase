// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add("login", (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add("drag", { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add("dismiss", { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite("visit", (originalFn, url, options) => { ... })

const randomString = function () { return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) }
const username = randomString() + "-user"
const password = randomString() + "-pass"
const appId = 'a43ae910-fc89-43fe-a7a3-a11a53b49325'
const dbName = 'test'

Cypress.Commands.add("getLoginInfo", () => {
  const loginInfo = {
    'username': username,
    'password': password,
    'appId': appId,
    'db': dbName
  }
  cy.log('in command logininfo:', loginInfo)
  cy.wrap(loginInfo)
})

Cypress.Commands.add("signup", (userbase) => {
  userbase.configure({ appId: appId })
  cy.wrap(userbase.signUp(username, password))
})
