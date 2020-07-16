// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands'

// Alternatively you can use CommonJS syntax:
// require('./commands')
// Cypress.on('fail', (error, runnable) => {
//   debugger

//   // we now have access to the err instance
//   // and the mocha runnable this failed on

//   throw error // throw error to have test still fail
// })

// https://github.com/cypress-io/cypress/issues/5029
Cypress.Screenshot.defaults({
  screenshotOnRunFailure: false,
})

require('cypress-skip-and-only-ui/support')
