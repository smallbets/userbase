/// <reference types="Cypress" />

describe('Signup Testing', function () {
  let info = {}

  beforeEach(() => {
    info = Cypress.env()
    cy.visit('./cypress/integration/index.html').then((win) => {
      expect(win).to.have.property('userbase')
      cy.clearLocalStorage()
    })
  })

  it('Signup a new user, rememberMe=none', function () {
    let randomInfo
    cy.getRandomInfoWithParams(null, null, 'none').then((loginInfo) => {
      randomInfo = loginInfo
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })


      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)
        expect(user.username, 'user.username').to.exists
        expect(user.username, 'user.username to be the one signed up').to.equal(randomInfo.username)
        expect(localStorage.length, 'localstorage size').to.equal(0)
        expect(sessionStorage.length, 'sessionStorage size').to.equal(0)

        return userbase.deleteUser()
      })
    })
  })

  it('Signup a new user, rememberMe=local', function () {
    let randomInfo
    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = loginInfo
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        expect(user.username, 'user.username').to.exists
        expect(user.username, 'user.username to be the one signed up').to.equal(randomInfo.username)
        expect(localStorage.length, 'localstorage size').to.be.above(0)
        expect(localStorage.getItem('userbaseCurrentSession'), 'localstorage userbaseCurrentSession').to.be.a('string')
        const userbaseCurrentSession = JSON.parse(localStorage.getItem('userbaseCurrentSession'))
        expect(userbaseCurrentSession, 'localstorage userbaseCurrentSession property username').to.have.property('username')
        expect(userbaseCurrentSession.username, 'localstorage userbaseCurrentSession property username').to.be.equal(randomInfo.username)

        return userbase.deleteUser()
      })
    })
  })

  it('Signup a new user, rememberMe=session', function () {
    let randomInfo
    cy.getRandomInfoWithParams(null, null, 'session').then((loginInfo) => {
      randomInfo = loginInfo
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })


      return userbase.signUp(randomInfo).then((user) => {
        expect(user.username, 'user.username').to.exists
        expect(user.username, 'user.username to be the one signed up').to.equal(randomInfo.username)
        expect(sessionStorage.length, 'sessionstorage size').to.be.above(0)
        expect(sessionStorage.getItem('userbaseCurrentSession'), 'sessionstorage userbaseCurrentSession').to.be.a('string')
        const userbaseCurrentSession = JSON.parse(sessionStorage.getItem('userbaseCurrentSession'))
        expect(userbaseCurrentSession, 'sessionstorage userbaseCurrentSession property username').to.have.property('username')
        expect(userbaseCurrentSession.username, 'sessionstorage userbaseCurrentSession property username').to.be.equal(randomInfo.username)

        sessionStorage.clear()

        return userbase.deleteUser()
      })
    })
  })

  it('Signup a new user, blank username', function () {
    let randomInfo
    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, username: '' }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('UsernameCannotBeBlank')
        })
    })
  })

  it('Signup a new user, null username', function () {
    let randomInfo
    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, username: null }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('UsernameMustBeString')
        })
    })
  })

  it('Signup a new user, undefined username', function () {
    let randomInfo
    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, username: undefined }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('UsernameMustBeString')
        })
    })
  })

  it('Signup a new user, username as number', function () {
    let randomInfo
    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, username: 1234567 }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('UsernameMustBeString')
        })
    })
  })


  it('Signup a new user, username too long', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {

      let longUsername = ''

      for (let i = 0; i <= 60; i++) longUsername += Math.floor(Math.random() * 10)

      randomInfo = { ...loginInfo, username: longUsername }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('UsernameTooLong')
        })
    })
  })

  it('Signup a new user, null password', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, password: null }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('PasswordMustBeString')
        })
    })
  })

  it('Signup a new user, undefined password', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, password: undefined }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('PasswordMustBeString')
        })
    })
  })

  it('Signup a new user, blank password', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, password: '' }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('PasswordCannotBeBlank')
        })
    })
  })

  it('Signup a new user, numeric password', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, password: 12356789 }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('PasswordMustBeString')
        })
    })
  })

  it('Signup a new user, password too short', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, password: 'passw' }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('PasswordTooShort')
        })
    })
  })

  it('Signup a new user, password too long', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      let longPassword = ''

      for (let i = 0; i <= 1000; i++) longPassword += Math.floor(Math.random() * 10)

      randomInfo = { ...loginInfo, password: longPassword }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('PasswordTooLong')
        })
    })
  })

  it('Signup without email', function () {
    let randomInfo
    cy.getRandomInfoWithParams(null, null, 'none').then((loginInfo) => {
      randomInfo = { ...loginInfo, email: null }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })


      return userbase.signUp(randomInfo).then((user) => {
        expect(user.username, 'user.username').to.exists
        expect(user.username, 'user.username to be the one signed up').to.equal(randomInfo.username)
        expect(localStorage.length, 'localstorage size').to.equal(0)

        return userbase.deleteUser()
      })
    })
  })

  it('Signup with an invalid email', function () {
    let randomInfo
    cy.getRandomInfoWithParams(null, null, 'none').then((loginInfo) => {
      randomInfo = { ...loginInfo, email: 'thisisalegitmail' }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('EmailNotValid')
        })
    })
  })

  it('Signup without profile', function () {
    let randomInfo
    cy.getRandomInfoWithParams(null, null, 'none').then((loginInfo) => {
      randomInfo = { ...loginInfo, profile: null }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })


      return userbase.signUp(randomInfo).then((user) => {
        expect(user.username, 'user.username').to.exists
        expect(user.username, 'user.username to be the one signed up').to.equal(randomInfo.username)
        expect(localStorage.length, 'localstorage size').to.equal(0)

        return userbase.deleteUser()
      })
    })
  })

  it('Signup with empty profile', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, profile: {} }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ProfileCannotBeEmpty')
        })
    })
  })

  it('Signup with a null profile', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, profile: null }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ProfileMustBeObject')
        })
    })
  })

  it('Signup with an undefined profile', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, profile: undefined }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ProfileMustBeObject')
        })
    })
  })

  it('Signup with a profile with too many keys', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      let profile = {}

      for (let i = 0; i <= 100; i++) profile[`${i}`] = `value-${i}`

      randomInfo = { ...loginInfo, profile }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ProfileHasTooManyKeys')
        })
    })
  })

  it('Signup with a profile with a key too long', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, profile: { 'profilewithaleytoolong': 'value' } }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ProfileKeyTooLong')
        })
    })
  })

  it('Signup with a profile with a value with 0 length', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, profile: { 'key': '' } }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })


      return userbase.signUp(randomInfo).then((user) => {
        expect(user.username, 'user.username').to.exists
        expect(user.username, 'user.username to be the one signed up').to.equal(randomInfo.username)
        expect(localStorage.length, 'localstorage size').to.equal(0)

        return userbase.deleteUser()
      })
    })
  })

  it('Signup with a profile with a null value', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, profile: { 'key': null } }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })


      return userbase.signUp(randomInfo).then((user) => {
        expect(user.username, 'user.username').to.exists
        expect(user.username, 'user.username to be the one signed up').to.equal(randomInfo.username)

        return userbase.deleteUser()
      })
    })
  })

  it('Signup with a profile with an undefined value', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, profile: { 'key': null } }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })


      return userbase.signUp(randomInfo).then((user) => {
        expect(user.username, 'user.username').to.exists
        expect(user.username, 'user.username to be the one signed up').to.equal(randomInfo.username)

        return userbase.deleteUser()
      })
    })
  })

  it('Signup with a profile with a numeric value', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = { ...loginInfo, profile: { 'key': 12345 } }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ProfileValueMustBeString')
        })
    })
  })

  it('Signup with a profile with a value too long', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      let value = ''

      for (let i = 0; i <= 1000; i++) value += 'a'

      randomInfo = { ...loginInfo, profile: { 'key': value } }
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ProfileValueTooLong')
        })
    })
  })

  it('Signup without passing an object as signup parameter', function () {
    let randomInfo

    cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
      randomInfo = loginInfo
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo.username, randomInfo.password)
        .then(() => {
          expect(true, 'signUp should not be successful').to.be.false
        })
        .catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ParamsMustBeObject')
        })
    })
  })

  it('Signup with an existing username', function () {
    let randomInfo
    cy.getRandomInfoWithParams(null, null, 'none').then((loginInfo) => {
      randomInfo = loginInfo
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })


      return userbase.signUp(randomInfo).then((user) => {
        expect(user.username, 'user.username').to.exists

        return userbase.signUp(randomInfo)
          .then(() => {
            expect(true, 'signUp should not be successful').to.be.false
          })
          .catch(error => {
            expect(error).to.be.a('Error')
            expect(error.name).to.be.equal('UsernameAlreadyExists')
          })
      })
    })
  })

  it('Signup when an user is already signed in', function () {
    let randomInfo
    cy.getRandomInfoWithParams(null, null, 'none').then((loginInfo) => {
      randomInfo = loginInfo
    })

    let randomInfo2
    cy.getRandomInfoWithParams(null, null, 'none').then((loginInfo) => {
      randomInfo2 = loginInfo
    })

    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        expect(user.username, 'user.username').to.exists

        return userbase.signUp(randomInfo2)
          .then(() => {
            expect(true, 'signUp should not be successful').to.be.false
          })
          .catch(error => {
            expect(error).to.be.a('Error')
            expect(error.name).to.be.equal('UserAlreadySignedIn')
          })
      })
    })
  })
})
