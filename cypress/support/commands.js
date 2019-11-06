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
const username = randomString() + "-user"
const password = randomString() + "-pass"
// const appId = 'a43ae910-fc89-43fe-a7a3-a11a53b49325'
const appId = '5bbf9019-c5c7-4d38-95de-cefcb653f00f'
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

