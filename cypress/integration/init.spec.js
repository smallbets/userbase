import { getRandomString } from '../support/utils'

const TEN_SECONDS = 1000 * 10
const ONE_HOUR = 60 * 60 * 1000
const TWENTY_FOUR_HOURS = 24 * ONE_HOUR

const updateUserWrapper = (userbase, params) => {
  return cy.wrap(null).then(() => {
    return new Cypress.Promise((resolve, reject) => {
      userbase
        .updateUser(params)
        .then(() => resolve())
        .catch((e) => reject(e))
    })
  })
}

const signOutWrapper = (userbase) => {
  return cy.wrap(null).then(() => {
    return new Cypress.Promise((resolve, reject) => {
      userbase
        .signOut()
        .then(() => resolve())
        .catch((e) => reject(e))
    })
  })
}

const signInWrapper = (userbase, params) => {
  return cy.wrap(null).then(() => {
    return new Cypress.Promise((resolve, reject) => {
      userbase
        .signIn(params)
        .then((user) => resolve(user))
        .catch((e) => reject(e))
    })
  })
}

const signUpWrapper = (userbase, params) => {
  return cy.wrap(null).then(() => {
    return new Cypress.Promise((resolve, reject) => {
      userbase
        .signUp(params)
        .then((user) => resolve(user))
        .catch((e) => reject(e))
    })
  })
}

const initWrapper = (userbase, params, expectError = false) => {
  return cy.wrap(null).then(() => {
    return new Cypress.Promise((resolve, reject) => {
      userbase
        .init(params)
        .then((session) => expectError ? reject(session) : resolve(session))
        .catch((e) => expectError ? resolve(e) : reject(e))
    })
  })
}

const reloadWrapper = () => {
  return cy.reload().then(() => {
    cy.visit('./cypress/integration/index.html').then((win) => {
      const { endpoint } = Cypress.env()
      win._userbaseEndpoint = endpoint
      return win.userbase
    })
  })
}

const beforeEachHook = function () {
  cy.visit('./cypress/integration/index.html').then(async function (win) {
    expect(win).to.have.property('userbase')
    const userbase = win.userbase

    const { appId, endpoint } = Cypress.env()
    win._userbaseEndpoint = endpoint

    this.currentTest.userbase = userbase
    this.currentTest.appId = appId
  })
}

describe('Init Tests', function () {

  describe('Success Tests', function () {
    beforeEach(function () { beforeEachHook() })

    it('Default', async function () {
      const result = await this.test.userbase.init({ appId: this.test.appId })
      expect(result, 'result').to.deep.equal({})
    })

    it('Idempotent call', async function () {
      await this.test.userbase.init({ appId: this.test.appId })
      const result = await this.test.userbase.init({ appId: this.test.appId })
      expect(result, 'result').to.deep.equal({})
    })

    it('Resume session after signUp rememberMe=session', function () {
      const { userbase, appId } = this.test

      userbase.init({ appId })

      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const params = {
        username,
        password,
        rememberMe: 'session',
      }

      signUpWrapper(userbase, params).then((userFromSignUp) => {

        // reload the page so init can resume session
        reloadWrapper().then((newUserbase) => {

          const startTime = Date.now()

          // attempt to resume session
          initWrapper(newUserbase, { appId }).then((session) => {

            // expected return values
            expect(session, 'session').to.have.key('user')

            const { user } = session
            expect(user, 'user').to.deep.equal(userFromSignUp)

            // expected session storage values
            expect(sessionStorage.length, 'sessionStorage length').to.eq(2)
            expect(localStorage.length, 'localStorage length').to.eq(0)

            const userbaseCurrentSessionString = sessionStorage.getItem('userbaseCurrentSession')
            expect(userbaseCurrentSessionString, 'userbaseCurrentSessionString').to.be.a('string')

            const userbaseCurrentSession = JSON.parse(userbaseCurrentSessionString)
            expect(userbaseCurrentSession, 'userbaseCurrentSession').to.deep.equal({
              username,
              signedIn: true,
              sessionId: userbaseCurrentSession.sessionId,
              creationDate: userbaseCurrentSession.creationDate, // this is the session creationDate, not user creationDate from above
              expirationDate: userbaseCurrentSession.expirationDate,
            })

            const { sessionId, expirationDate } = userbaseCurrentSession
            const sessionCreationTime = new Date(userbaseCurrentSession.creationDate).getTime()
            const expirationTime = new Date(expirationDate).getTime()

            expect(sessionId, 'sessionId').to.be.a('string').that.has.lengthOf(32)
            expect(sessionCreationTime, 'session creation date').to.be.within(startTime - TEN_SECONDS, startTime + TEN_SECONDS)
            expect(expirationTime, 'expiration date').to.be.within(sessionCreationTime - TEN_SECONDS + TWENTY_FOUR_HOURS, sessionCreationTime + TEN_SECONDS + TWENTY_FOUR_HOURS)

            // clean up
            newUserbase.deleteUser()
          })
        })
      })
    })

    it('Resume session after signUp rememberMe=local', function () {
      const { userbase, appId } = this.test

      userbase.init({ appId })

      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const params = {
        username,
        password,
        rememberMe: 'local',
      }

      signUpWrapper(userbase, params).then((userFromSignUp) => {

        // reload the page so init can resume session
        reloadWrapper().then((newUserbase) => {

          const startTime = Date.now()

          // attempt to resume session
          initWrapper(newUserbase, { appId }).then((session) => {

            // expected return values
            expect(session, 'session').to.have.key('user')

            const { user } = session
            expect(user, 'user').to.deep.equal(userFromSignUp)

            // expected session storage values
            expect(sessionStorage.length, 'sessionStorage length').to.eq(0)
            expect(localStorage.length, 'localStorage length').to.eq(2)

            const userbaseCurrentSessionString = localStorage.getItem('userbaseCurrentSession')
            expect(userbaseCurrentSessionString, 'userbaseCurrentSessionString').to.be.a('string')

            const userbaseCurrentSession = JSON.parse(userbaseCurrentSessionString)
            expect(userbaseCurrentSession, 'userbaseCurrentSession').to.deep.equal({
              username,
              signedIn: true,
              sessionId: userbaseCurrentSession.sessionId,
              creationDate: userbaseCurrentSession.creationDate, // this is the session creationDate, not user creationDate from above
              expirationDate: userbaseCurrentSession.expirationDate,
            })

            const { sessionId, expirationDate } = userbaseCurrentSession
            const sessionCreationTime = new Date(userbaseCurrentSession.creationDate).getTime()
            const expirationTime = new Date(expirationDate).getTime()

            expect(sessionId, 'sessionId').to.be.a('string').that.has.lengthOf(32)
            expect(sessionCreationTime, 'session creation date').to.be.within(startTime - TEN_SECONDS, startTime + TEN_SECONDS)
            expect(expirationTime, 'expiration date').to.be.within(sessionCreationTime - TEN_SECONDS + TWENTY_FOUR_HOURS, sessionCreationTime + TEN_SECONDS + TWENTY_FOUR_HOURS)

            // clean up
            newUserbase.deleteUser()
          })
        })
      })
    })

    it('Resume session after signUp rememberMe=none', function () {
      const { userbase, appId } = this.test

      userbase.init({ appId })

      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const params = {
        username,
        password,
        rememberMe: 'none',
      }

      signUpWrapper(userbase, params).then(() => {

        // reload the page so init can resume session
        reloadWrapper().then((newUserbase) => {

          // attempt to resume session
          initWrapper(newUserbase, { appId }).then((session) => {

            expect(session, 'session').to.deep.eq({})

            // clean up
            signInWrapper(newUserbase, params).then(() => {
              newUserbase.deleteUser()
            })
          })
        })
      })
    })

    it('Resume session after signUp rememberMe=session + signOut', function () {
      const { userbase, appId } = this.test

      userbase.init({ appId })

      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const params = {
        username,
        password,
        rememberMe: 'session',
      }

      signUpWrapper(userbase, params).then(() => {
        signOutWrapper(userbase).then(() => {

          // reload the page so init can resume session
          reloadWrapper().then((newUserbase) => {

            // attempt to resume session
            initWrapper(newUserbase, { appId }).then((session) => {
              expect(session, 'session').to.deep.eq({ lastUsedUsername: username })

              // expected session storage values
              expect(sessionStorage.length, 'sessionStorage length').to.eq(2)
              expect(localStorage.length, 'localStorage length').to.eq(0)

              const userbaseCurrentSessionString = sessionStorage.getItem('userbaseCurrentSession')
              expect(userbaseCurrentSessionString, 'userbaseCurrentSessionString').to.be.a('string')

              const userbaseCurrentSession = JSON.parse(userbaseCurrentSessionString)
              expect(userbaseCurrentSession, 'userbaseCurrentSession').to.deep.equal({
                username,
                signedIn: false,
              })

              // clean up
              signInWrapper(newUserbase, params).then(() => {
                newUserbase.deleteUser()
              })
            })
          })
        })
      })
    })

    it('Resume session after signUp rememberMe=local + signOut', function () {
      const { userbase, appId } = this.test

      userbase.init({ appId })

      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const params = {
        username,
        password,
        rememberMe: 'local',
      }

      signUpWrapper(userbase, params).then(() => {
        signOutWrapper(userbase).then(() => {

          // reload the page so init can resume session
          reloadWrapper().then((newUserbase) => {

            // attempt to resume session
            initWrapper(newUserbase, { appId }).then((session) => {

              expect(session, 'session').to.deep.eq({ lastUsedUsername: username })

              // expected session storage values
              expect(sessionStorage.length, 'sessionStorage length').to.eq(0)
              expect(localStorage.length, 'localStorage length').to.eq(2)

              const userbaseCurrentSessionString = localStorage.getItem('userbaseCurrentSession')
              expect(userbaseCurrentSessionString, 'userbaseCurrentSessionString').to.be.a('string')

              const userbaseCurrentSession = JSON.parse(userbaseCurrentSessionString)
              expect(userbaseCurrentSession, 'userbaseCurrentSession').to.deep.equal({
                username,
                signedIn: false,
              })

              // clean up
              signInWrapper(newUserbase, params).then(() => {
                newUserbase.deleteUser()
              })
            })
          })
        })
      })
    })

    it('Resume session after signIn rememberMe=session', function () {
      const { userbase, appId } = this.test

      userbase.init({ appId })

      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const params = {
        username,
        password,
        rememberMe: 'session',
      }

      signUpWrapper(userbase, { ...params, rememberMe: 'none' }).then(() => {
        signOutWrapper(userbase).then(() => {
          signInWrapper(userbase, params).then((userFromSignIn) => {

            // reload the page so init can resume session
            reloadWrapper().then((newUserbase) => {

              const startTime = Date.now()

              // attempt to resume session
              initWrapper(newUserbase, { appId }).then((session) => {

                // expected return values
                expect(session, 'session').to.have.key('user')

                const { user } = session
                expect(user, 'user').to.deep.equal(userFromSignIn)

                // expected session storage values
                expect(sessionStorage.length, 'sessionStorage length').to.eq(2)
                expect(localStorage.length, 'localStorage length').to.eq(0)

                const userbaseCurrentSessionString = sessionStorage.getItem('userbaseCurrentSession')
                expect(userbaseCurrentSessionString, 'userbaseCurrentSessionString').to.be.a('string')

                const userbaseCurrentSession = JSON.parse(userbaseCurrentSessionString)
                expect(userbaseCurrentSession, 'userbaseCurrentSession').to.deep.equal({
                  username,
                  signedIn: true,
                  sessionId: userbaseCurrentSession.sessionId,
                  creationDate: userbaseCurrentSession.creationDate, // this is the session creationDate, not user creationDate from above
                  expirationDate: userbaseCurrentSession.expirationDate,
                })

                const { sessionId, expirationDate } = userbaseCurrentSession
                const sessionCreationTime = new Date(userbaseCurrentSession.creationDate).getTime()
                const expirationTime = new Date(expirationDate).getTime()

                expect(sessionId, 'sessionId').to.be.a('string').that.has.lengthOf(32)
                expect(sessionCreationTime, 'session creation date').to.be.within(startTime - TEN_SECONDS, startTime + TEN_SECONDS)
                expect(expirationTime, 'expiration date').to.be.within(sessionCreationTime - TEN_SECONDS + TWENTY_FOUR_HOURS, sessionCreationTime + TEN_SECONDS + TWENTY_FOUR_HOURS)

                // clean up
                newUserbase.deleteUser()
              })
            })
          })
        })
      })
    })

    it('Resume session after signIn rememberMe=local', function () {
      const { userbase, appId } = this.test

      userbase.init({ appId })

      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const params = {
        username,
        password,
        rememberMe: 'local',
      }

      signUpWrapper(userbase, { ...params, rememberMe: 'none' }).then(() => {
        signOutWrapper(userbase).then(() => {
          signInWrapper(userbase, params).then((userFromSignIn) => {

            // reload the page so init can resume session
            reloadWrapper().then((newUserbase) => {

              const startTime = Date.now()

              // attempt to resume session
              initWrapper(newUserbase, { appId }).then((session) => {

                // expected return values
                expect(session, 'session').to.have.key('user')

                const { user } = session
                expect(user, 'user').to.deep.equal(userFromSignIn)

                // expected session storage values
                expect(sessionStorage.length, 'sessionStorage length').to.eq(0)
                expect(localStorage.length, 'localStorage length').to.eq(2)

                const userbaseCurrentSessionString = localStorage.getItem('userbaseCurrentSession')
                expect(userbaseCurrentSessionString, 'userbaseCurrentSessionString').to.be.a('string')

                const userbaseCurrentSession = JSON.parse(userbaseCurrentSessionString)
                expect(userbaseCurrentSession, 'userbaseCurrentSession').to.deep.equal({
                  username,
                  signedIn: true,
                  sessionId: userbaseCurrentSession.sessionId,
                  creationDate: userbaseCurrentSession.creationDate, // this is the session creationDate, not user creationDate from above
                  expirationDate: userbaseCurrentSession.expirationDate,
                })

                const { sessionId, expirationDate } = userbaseCurrentSession
                const sessionCreationTime = new Date(userbaseCurrentSession.creationDate).getTime()
                const expirationTime = new Date(expirationDate).getTime()

                expect(sessionId, 'sessionId').to.be.a('string').that.has.lengthOf(32)
                expect(sessionCreationTime, 'session creation date').to.be.within(startTime - TEN_SECONDS, startTime + TEN_SECONDS)
                expect(expirationTime, 'expiration date').to.be.within(sessionCreationTime - TEN_SECONDS + TWENTY_FOUR_HOURS, sessionCreationTime + TEN_SECONDS + TWENTY_FOUR_HOURS)

                // clean up
                newUserbase.deleteUser()
              })
            })
          })
        })
      })
    })

    it('Resume session after signIn rememberMe=none', function () {
      const { userbase, appId } = this.test

      userbase.init({ appId })

      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const params = {
        username,
        password,
        rememberMe: 'none',
      }

      signUpWrapper(userbase, params).then(() => {
        signOutWrapper(userbase).then(() => {
          signInWrapper(userbase, params).then(() => {

            // reload the page so init can resume session
            reloadWrapper().then((newUserbase) => {

              // attempt to resume session
              initWrapper(newUserbase, { appId }).then((session) => {

                expect(session, 'session').to.deep.eq({})

                // clean up
                signInWrapper(newUserbase, params).then(() => {
                  newUserbase.deleteUser()
                })
              })
            })
          })
        })
      })
    })

    it('Resume session after signIn rememberMe=session + signOut', function () {
      const { userbase, appId } = this.test

      userbase.init({ appId })

      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const params = {
        username,
        password,
        rememberMe: 'session',
      }

      signUpWrapper(userbase, { ...params, rememberMe: 'none' }).then(() => {
        signOutWrapper(userbase).then(() => {
          signInWrapper(userbase, params).then(() => {
            signOutWrapper(userbase).then(() => {

              // reload the page so init can resume session
              reloadWrapper().then((newUserbase) => {

                // attempt to resume session
                initWrapper(newUserbase, { appId }).then((session) => {
                  expect(session, 'session').to.deep.eq({ lastUsedUsername: username })

                  // expected session storage values
                  expect(sessionStorage.length, 'sessionStorage length').to.eq(2)
                  expect(localStorage.length, 'localStorage length').to.eq(0)

                  const userbaseCurrentSessionString = sessionStorage.getItem('userbaseCurrentSession')
                  expect(userbaseCurrentSessionString, 'userbaseCurrentSessionString').to.be.a('string')

                  const userbaseCurrentSession = JSON.parse(userbaseCurrentSessionString)
                  expect(userbaseCurrentSession, 'userbaseCurrentSession').to.deep.equal({
                    username,
                    signedIn: false,
                  })

                  // clean up
                  signInWrapper(newUserbase, params).then(() => {
                    newUserbase.deleteUser()
                  })
                })
              })
            })
          })
        })
      })
    })

    it('Resume session after signIn rememberMe=local + signOut', function () {
      const { userbase, appId } = this.test

      userbase.init({ appId })

      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const params = {
        username,
        password,
        rememberMe: 'local',
      }

      signUpWrapper(userbase, { ...params, rememberMe: 'none' }).then(() => {
        signOutWrapper(userbase).then(() => {
          signInWrapper(userbase, params).then(() => {
            signOutWrapper(userbase).then(() => {

              // reload the page so init can resume session
              reloadWrapper().then((newUserbase) => {

                // attempt to resume session
                initWrapper(newUserbase, { appId }).then((session) => {

                  expect(session, 'session').to.deep.eq({ lastUsedUsername: username })

                  // expected session storage values
                  expect(sessionStorage.length, 'sessionStorage length').to.eq(0)
                  expect(localStorage.length, 'localStorage length').to.eq(2)

                  const userbaseCurrentSessionString = localStorage.getItem('userbaseCurrentSession')
                  expect(userbaseCurrentSessionString, 'userbaseCurrentSessionString').to.be.a('string')

                  const userbaseCurrentSession = JSON.parse(userbaseCurrentSessionString)
                  expect(userbaseCurrentSession, 'userbaseCurrentSession').to.deep.equal({
                    username,
                    signedIn: false,
                  })

                  // clean up
                  signInWrapper(newUserbase, params).then(() => {
                    newUserbase.deleteUser()
                  })
                })
              })
            })
          })
        })
      })
    })

    it('Resume session after changing username rememberMe=session', function () {
      const { userbase, appId } = this.test

      userbase.init({ appId })

      const username1 = 'test-user-' + getRandomString()
      const password = getRandomString()
      const params = {
        username: username1,
        password,
        rememberMe: 'session',
      }

      signUpWrapper(userbase, params).then((userFromSignUp) => {
        const username2 = 'test-user-' + getRandomString()

        updateUserWrapper(userbase, { username: username2 }).then(() => {

          // reload the page so init can resume session
          reloadWrapper().then((newUserbase) => {

            const startTime = Date.now()

            // attempt to resume session
            initWrapper(newUserbase, { appId }).then((session) => {

              // expected return values
              expect(session, 'session').to.have.key('user')

              const { user } = session
              expect(user, 'user').to.deep.equal({ ...userFromSignUp, username: username2 })

              // expected session storage values
              expect(sessionStorage.length, 'sessionStorage length').to.eq(2)
              expect(localStorage.length, 'localStorage length').to.eq(0)

              const userbaseCurrentSessionString = sessionStorage.getItem('userbaseCurrentSession')
              expect(userbaseCurrentSessionString, 'userbaseCurrentSessionString').to.be.a('string')

              const userbaseCurrentSession = JSON.parse(userbaseCurrentSessionString)
              expect(userbaseCurrentSession, 'userbaseCurrentSession').to.deep.equal({
                username: username2,
                signedIn: true,
                sessionId: userbaseCurrentSession.sessionId,
                creationDate: userbaseCurrentSession.creationDate, // this is the session creationDate, not user creationDate from above
                expirationDate: userbaseCurrentSession.expirationDate,
              })

              const { sessionId, expirationDate } = userbaseCurrentSession
              const sessionCreationTime = new Date(userbaseCurrentSession.creationDate).getTime()
              const expirationTime = new Date(expirationDate).getTime()

              expect(sessionId, 'sessionId').to.be.a('string').that.has.lengthOf(32)
              expect(sessionCreationTime, 'session creation date').to.be.within(startTime - TEN_SECONDS, startTime + TEN_SECONDS)
              expect(expirationTime, 'expiration date').to.be.within(sessionCreationTime - TEN_SECONDS + TWENTY_FOUR_HOURS, sessionCreationTime + TEN_SECONDS + TWENTY_FOUR_HOURS)

              // clean up
              newUserbase.deleteUser()
            })
          })
        })
      })
    })

    it('Resume session after changing username rememberMe=local', function () {
      const { userbase, appId } = this.test

      userbase.init({ appId })

      const username1 = 'test-user-' + getRandomString()
      const password = getRandomString()
      const params = {
        username: username1,
        password,
        rememberMe: 'local',
      }

      signUpWrapper(userbase, params).then((userFromSignUp) => {
        const username2 = 'test-user-' + getRandomString()

        updateUserWrapper(userbase, { username: username2 }).then(() => {

          // reload the page so init can resume session
          reloadWrapper().then((newUserbase) => {

            const startTime = Date.now()

            // attempt to resume session
            initWrapper(newUserbase, { appId }).then((session) => {

              // expected return values
              expect(session, 'session').to.have.key('user')

              const { user } = session
              expect(user, 'user').to.deep.equal({ ...userFromSignUp, username: username2 })

              // expected session storage values
              expect(sessionStorage.length, 'sessionStorage length').to.eq(0)
              expect(localStorage.length, 'localStorage length').to.eq(2)

              const userbaseCurrentSessionString = localStorage.getItem('userbaseCurrentSession')
              expect(userbaseCurrentSessionString, 'userbaseCurrentSessionString').to.be.a('string')

              const userbaseCurrentSession = JSON.parse(userbaseCurrentSessionString)
              expect(userbaseCurrentSession, 'userbaseCurrentSession').to.deep.equal({
                username: username2,
                signedIn: true,
                sessionId: userbaseCurrentSession.sessionId,
                creationDate: userbaseCurrentSession.creationDate, // this is the session creationDate, not user creationDate from above
                expirationDate: userbaseCurrentSession.expirationDate,
              })

              const { sessionId, expirationDate } = userbaseCurrentSession
              const sessionCreationTime = new Date(userbaseCurrentSession.creationDate).getTime()
              const expirationTime = new Date(expirationDate).getTime()

              expect(sessionId, 'sessionId').to.be.a('string').that.has.lengthOf(32)
              expect(sessionCreationTime, 'session creation date').to.be.within(startTime - TEN_SECONDS, startTime + TEN_SECONDS)
              expect(expirationTime, 'expiration date').to.be.within(sessionCreationTime - TEN_SECONDS + TWENTY_FOUR_HOURS, sessionCreationTime + TEN_SECONDS + TWENTY_FOUR_HOURS)

              // clean up
              newUserbase.deleteUser()
            })
          })
        })
      })
    })

    it('Set session length', function () {
      const { userbase, appId } = this.test

      userbase.init({ appId })

      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const params = {
        username,
        password,
      }

      signUpWrapper(userbase, params).then((userFromSignUp) => {

        // reload the page so init can resume session
        reloadWrapper().then((newUserbase) => {

          const NUM_HOURS = 1
          const HOURS_MS = NUM_HOURS * 60 * 60 * 1000

          const startTime = Date.now()

          // attempt to resume session
          initWrapper(newUserbase, { appId, sessionLength: NUM_HOURS }).then((session) => {

            // expected return values
            expect(session, 'session').to.have.key('user')

            const { user } = session
            expect(user, 'user').to.deep.equal(userFromSignUp)

            // expected session storage values
            expect(sessionStorage.length, 'sessionStorage length').to.eq(2)
            expect(localStorage.length, 'localStorage length').to.eq(0)

            const userbaseCurrentSessionString = sessionStorage.getItem('userbaseCurrentSession')
            expect(userbaseCurrentSessionString, 'userbaseCurrentSessionString').to.be.a('string')

            const userbaseCurrentSession = JSON.parse(userbaseCurrentSessionString)
            expect(userbaseCurrentSession, 'userbaseCurrentSession').to.deep.equal({
              username,
              signedIn: true,
              sessionId: userbaseCurrentSession.sessionId,
              creationDate: userbaseCurrentSession.creationDate, // this is the session creationDate, not user creationDate from above
              expirationDate: userbaseCurrentSession.expirationDate,
            })

            const { sessionId, expirationDate } = userbaseCurrentSession
            const sessionCreationTime = new Date(userbaseCurrentSession.creationDate).getTime()
            const expirationTime = new Date(expirationDate).getTime()

            expect(sessionId, 'sessionId').to.be.a('string').that.has.lengthOf(32)
            expect(sessionCreationTime, 'session creation date').to.be.within(startTime - TEN_SECONDS, startTime + TEN_SECONDS)
            expect(expirationTime, 'expiration date').to.be.within(sessionCreationTime - TEN_SECONDS + HOURS_MS, sessionCreationTime + TEN_SECONDS + HOURS_MS)

            // clean up
            newUserbase.deleteUser()
          })
        })
      })
    })

    it('Set session length to max', function () {
      const { userbase, appId } = this.test

      userbase.init({ appId })

      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const params = {
        username,
        password,
      }

      signUpWrapper(userbase, params).then((userFromSignUp) => {

        // reload the page so init can resume session
        reloadWrapper().then((newUserbase) => {

          const NUM_HOURS = 365 * 24
          const HOURS_MS = NUM_HOURS * 60 * 60 * 1000

          const startTime = Date.now()

          // attempt to resume session
          initWrapper(newUserbase, { appId, sessionLength: NUM_HOURS }).then((session) => {

            // expected return values
            expect(session, 'session').to.have.key('user')

            const { user } = session
            expect(user, 'user').to.deep.equal(userFromSignUp)

            // expected session storage values
            expect(sessionStorage.length, 'sessionStorage length').to.eq(2)
            expect(localStorage.length, 'localStorage length').to.eq(0)

            const userbaseCurrentSessionString = sessionStorage.getItem('userbaseCurrentSession')
            expect(userbaseCurrentSessionString, 'userbaseCurrentSessionString').to.be.a('string')

            const userbaseCurrentSession = JSON.parse(userbaseCurrentSessionString)
            expect(userbaseCurrentSession, 'userbaseCurrentSession').to.deep.equal({
              username,
              signedIn: true,
              sessionId: userbaseCurrentSession.sessionId,
              creationDate: userbaseCurrentSession.creationDate, // this is the session creationDate, not user creationDate from above
              expirationDate: userbaseCurrentSession.expirationDate,
            })

            const { sessionId, expirationDate } = userbaseCurrentSession
            const sessionCreationTime = new Date(userbaseCurrentSession.creationDate).getTime()
            const expirationTime = new Date(expirationDate).getTime()

            expect(sessionId, 'sessionId').to.be.a('string').that.has.lengthOf(32)
            expect(sessionCreationTime, 'session creation date').to.be.within(startTime - TEN_SECONDS, startTime + TEN_SECONDS)
            expect(expirationTime, 'expiration date').to.be.within(sessionCreationTime - TEN_SECONDS + HOURS_MS, sessionCreationTime + TEN_SECONDS + HOURS_MS)

            // clean up
            newUserbase.deleteUser()
          })
        })
      })
    })

  })

  describe('Failure Tests', function () {
    beforeEach(function () { beforeEachHook() })

    it('Missing params object', async function () {
      try {
        await this.test.userbase.init()
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ParamsMustBeObject')
        expect(e.message, 'error message').to.equal('Parameters passed to function must be placed inside an object.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Incorrect params type', async function () {
      try {
        await this.test.userbase.init(false)
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('ParamsMustBeObject')
        expect(e.message, 'error message').to.equal('Parameters passed to function must be placed inside an object.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('App ID missing', async function () {
      try {
        await this.test.userbase.init({})
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('AppIdMissing')
        expect(e.message, 'error message').to.equal('Application ID missing.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('App ID already set', async function () {
      try {
        await this.test.userbase.init({ appId: 'test-id' })
        await this.test.userbase.init({ appId: 'test-id2' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('AppIdAlreadySet')
        expect(e.message, 'error message').to.equal('Application ID already set.')
        expect(e.status, 'error status').to.equal(409)
      }
    })

    it('App ID must be a string', async function () {
      try {
        await this.test.userbase.init({ appId: 123 })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('AppIdMustBeString')
        expect(e.message, 'error message').to.equal('Application ID must be a string.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('App ID cannot be blank', async function () {
      try {
        await this.test.userbase.init({ appId: '' })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('AppIdCannotBeBlank')
        expect(e.message, 'error message').to.equal('Application ID cannot be blank.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Update user handler must be function', async function () {
      try {
        await this.test.userbase.init({ appId: this.test.appId, updateUserHandler: 1 })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('UpdateUserHandlerMustBeFunction')
        expect(e.message, 'error message').to.equal('Update user handler must be a function.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Session length must be number', async function () {
      try {
        await this.test.userbase.init({ appId: this.test.appId, sessionLength: false })
        throw new Error('should have failed')
      } catch (e) {
        expect(e.name, 'error name').to.equal('SessionLengthMustBeNumber')
        expect(e.message, 'error message').to.equal('Session length must be a number.')
        expect(e.status, 'error status').to.equal(400)
      }
    })

    it('Session length too short', function () {
      const { userbase, appId } = this.test

      userbase.init({ appId })

      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const params = {
        username,
        password,
        rememberMe: 'session',
      }

      signUpWrapper(userbase, params).then(() => {

        // reload the page so init can resume session
        reloadWrapper().then((newUserbase) => {

          const expectError = true

          // attempt to resume session
          initWrapper(newUserbase, { appId, sessionLength: 0.001 }, expectError).then((e) => {
            expect(e.name, 'error name').to.equal('SessionLengthTooShort')
            expect(e.message, 'error message').to.equal(`Session length cannot be shorter than 5 minutes.`)
            expect(e.status, 'error status').to.equal(400)

            // clean up
            initWrapper(newUserbase, { appId }).then(() => {
              newUserbase.deleteUser()
            })
          })
        })
      })
    })

    it('Session length too long', function () {
      const { userbase, appId } = this.test

      userbase.init({ appId })

      const username = 'test-user-' + getRandomString()
      const password = getRandomString()
      const params = {
        username,
        password,
        rememberMe: 'session',
      }

      signUpWrapper(userbase, params).then(() => {

        // reload the page so init can resume session
        reloadWrapper().then((newUserbase) => {

          const expectError = true

          // attempt to resume session
          initWrapper(newUserbase, { appId, sessionLength: (365 * 24) + 1 }, expectError).then((e) => {
            expect(e.name, 'error name').to.equal('SessionLengthTooLong')
            expect(e.message, 'error message').to.equal(`Session length cannot be longer than 1 year.`)
            expect(e.status, 'error status').to.equal(400)

            // clean up
            initWrapper(newUserbase, { appId }).then(() => {
              newUserbase.deleteUser()
            })
          })
        })
      })
    })
  })

})
