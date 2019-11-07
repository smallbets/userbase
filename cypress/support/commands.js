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
const username = "n12hp7bacobv9p5t1vxvbn-user"
const password = "z7ld6m0r18cqs1pjbycw9-pass"

const appId = 'e249839a-03e3-4f42-b7c5-898f3ba10071'
const dbName = 'test'
const endpoint = 'http://localhost:3000'

Cypress.Commands.add("getLoginInfo", (existing=false) => {
  const loginInfo = {
    'username': existing ? username : randomUsername,
    'password': existing ? password : randomPassword,
    'appId': appId,
    'db': dbName,
    'endpoint': endpoint
  }
  cy.log('getting new login info:', loginInfo)
  cy.wrap(loginInfo)
})
