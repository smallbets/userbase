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
// const username = "cwe2jo26sbss59c5bjw7a-user"
// const password = "wbgrd2jifcfwvinslb4g8-pass"
// const key = "CKLjtFyavUQkr5lCevkvpCggVoaoo0tTuCAG8h99dGo="

// const appId = '7d51fec4-4bc4-4650-a3da-bffa7a5786ce'
const appId = '25191a7e-1f94-42f9-b084-bea47f6e019f'
const dbName = 'test'
const endpoint = 'http://localhost:3000'

Cypress.Commands.add("getLoginInfo", () => {
  const loginInfo = {
    'username': randomUsername,
    'password': randomPassword,
    'appId': appId,
    'db': dbName,
    'endpoint': endpoint
  }
  cy.log('getting new login info:', loginInfo)
  cy.wrap(loginInfo)
})
