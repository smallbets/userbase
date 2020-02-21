/// <reference types="Cypress" />

describe('Update User Testing', function () {
  let info = {}
  let randomInfo, profile, email
  const newUsername = 'testuser6'
  const newPassword = 'validpassword'

  beforeEach(() => {
    info = Cypress.env()
    cy.visit('./cypress/integration/index.html').then((win) => {
      expect(win).to.have.property('userbase')
      cy.clearLocalStorage()
    })

    profile = {
      a: 'a',
      b: 'b',
      c: 'c',
    }

    email = 'legit.email@example.com'

    cy.getRandomInfoWithParams(email, profile, 'local').then((loginInfo) => {
      randomInfo = loginInfo
    })
  })

  after(() => {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signIn({ username: newUsername, password: newPassword }).then(() => {
        return userbase.deleteUser().then(() => {
          console.log('Cleaning up updated user')
          window.localStorage.clear()
        })
      }).catch(() => { })
    })
  })

  it('Update user\'s e-mail, password and profile', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        email = 'another.legit.email@example.com'
        profile = {
          b: 'x',
          c: 'c',
          d: 'y',
        }

        const updateInfo = {
          username: newUsername,
          currentPassword: randomInfo.password,
          newPassword,
          email,
          profile,
        }

        const newLoginInfo = {
          ...randomInfo,
          password: newPassword,
          username: newUsername,
        }

        return userbase.updateUser(updateInfo).then(() => {
          return userbase.signOut().then(() => {
            return userbase.signIn(newLoginInfo).then(user => {
              expect(user.username, 'user.username').to.exists
              expect(user.username, 'user.username to be the one signed up').to.equal(newUsername)
              expect(user.email, 'user.email should be the new one').to.equal(email)
              expect(user.profile, 'user.profile should be the new one').to.deep.equal(profile)

              return userbase.deleteUser().then(() => {})
            })
          })
        })
      })
    })
  })

  it('Update user\'s info, ParamsMustBeObject', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const newPassword = 'validpassword'
        email = 'another.legit.email@example.com'
        profile = {
          b: 'x',
          c: 'c',
          d: 'y',
        }

        return userbase.updateUser(user.username, randomInfo.password, newPassword, email, profile).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ParamsMustBeObject')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, ParamsMissing', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        return userbase.updateUser({}).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ParamsMissing')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, UsernameAlreadyExists', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })
      let secondUserRandomInfo

      cy.getRandomInfoWithParams(null, null, 'local').then((loginInfo) => {
        secondUserRandomInfo = loginInfo

        return userbase.signUp(secondUserRandomInfo).then((secondUser) => {
          cy.log(secondUser)
          console.log(secondUser)

          return userbase.signOut(() => {

            return userbase.signUp(randomInfo).then((user) => {
              cy.log(user)
              console.log(user)

              const updateInfo = {
                username: secondUser.username,
              }

              return userbase.updateUser(updateInfo).then(() => {
                expect(true, 'updateUser should not be successful').to.be.false
              }).catch(error => {
                expect(error).to.be.a('Error')
                expect(error.name).to.be.equal('UsernameAlreadyExists')
              }).finally(() => {
                return userbase.deleteUser().then(() => {
                  return userbase.signIn(secondUserRandomInfo).then(() => {
                    return userbase.deleteUser().then(() => {})
                  })
                })
              })
            })
          })
        })
      })
    })
  })

  it('Update user\'s info, UsernameMustBeString', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const updateInfo = {
          username: 0,
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('UsernameMustBeString')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, UsernameCannotBeBlank', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const updateInfo = {
          username: '',
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('UsernameCannotBeBlank')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, UsernameTooLong', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const updateInfo = {
          username: 'a'.repeat(101),
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('UsernameTooLong')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, CurrentPasswordMissing', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const updateInfo = {
          newPassword,
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('CurrentPasswordMissing')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, CurrentPasswordIncorrect', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const updateInfo = {
          currentPassword: 'incorrectpassword',
          newPassword,
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('CurrentPasswordIncorrect')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, PasswordAttemptLimitExceeded', function () {

  })

  it('Update user\'s info, PasswordMustBeString', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const updateInfo = {
          currentPassword: randomInfo.password,
          newPassword: 0,
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('PasswordMustBeString')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, PasswordCannotBeBlank', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const updateInfo = {
          currentPassword: randomInfo.password,
          newPassword: '',
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('PasswordCannotBeBlank')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, PasswordTooShort', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const updateInfo = {
          currentPassword: randomInfo.password,
          newPassword: 'short',
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('PasswordTooShort')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, PasswordTooLong', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        let longPassword = ''
        for (let i = 0; i <= 1000; i++) longPassword += Math.floor(Math.random() * 10)

        const updateInfo = {
          currentPassword: randomInfo.password,
          newPassword: longPassword,
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('PasswordTooLong')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, EmailNotValid', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const updateInfo = {
          email: 'invalid@email',
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('EmailNotValid')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, ProfileMustBeObject', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const updateInfo = {
          profile: 'not an object',
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ProfileMustBeObject')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, ProfileCannotBeEmpty', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const updateInfo = {
          profile: {},
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ProfileCannotBeEmpty')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, ProfileHasTooManyKeys', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const profileWithTooManyKeys = {}
        for (let i = 0; i <= 1001; i++) profileWithTooManyKeys[i] = 'a'

        const updateInfo = {
          profile: profileWithTooManyKeys,
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ProfileHasTooManyKeys')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, ProfileKeyMustBeString', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const o = {}
        const profileWithObjectAsKey = {}
        profileWithObjectAsKey[o] = 'a'

        const updateInfo = {
          profile: profileWithObjectAsKey,
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ProfileKeyMustBeString')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, ProfileKeyTooLong', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const keyTooLong = 'a'.repeat(21)

        const profileWithKeyTooLong = {}
        profileWithKeyTooLong[keyTooLong] = 'a'

        const updateInfo = {
          profile: profileWithKeyTooLong,
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ProfileKeyTooLong')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, ProfileValueMustBeString', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const profileWithNonStringValues = {
          a: 0
        }

        const updateInfo = {
          profile: profileWithNonStringValues,
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ProfileValueMustBeString')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, ProfileValueTooLong', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        let valueTooLong = ''
        for (let i = 0; i <= 1001; i++) valueTooLong += 'a'

        const profileWithValueTooLong = {
          valueTooLong
        }

        const updateInfo = {
          profile: profileWithValueTooLong,
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ProfileValueTooLong')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, ProfileValueCannotBeBlank', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      return userbase.signUp(randomInfo).then((user) => {
        cy.log(user)
        console.log(user)

        const profileWithBlankValue = {
          a: ''
        }

        const updateInfo = {
          profile: profileWithBlankValue,
        }

        return userbase.updateUser(updateInfo).then(() => {
          expect(true, 'updateUser should not be successful').to.be.false
        }).catch(error => {
          expect(error).to.be.a('Error')
          expect(error.name).to.be.equal('ProfileValueCannotBeBlank')
        }).finally(() => {
          return userbase.deleteUser().then(() => {})
        })
      })
    })
  })

  it('Update user\'s info, UserNotSignedIn', function () {
    cy.window().then((window) => {
      const { userbase } = window
      window._userbaseEndpoint = info.endpoint
      userbase.init({ appId: info.appId })

      const updateInfo = {
        profile,
      }

      return userbase.updateUser(updateInfo).then(() => {
        expect(true, 'updateUser should not be successful').to.be.false
      }).catch(error => {
        expect(error).to.be.a('Error')
        expect(error.name).to.be.equal('UserNotSignedIn')
      })
    })
  })

  it('Update user\'s info, AppIdNotSet', function () {

  })

  it('Update user\'s info, AppIdNotValid', function () {

  })

  it('Update user\'s info, UserNotFound', function () {

  })

  it('Update user\'s info, TooManyRequests', function () {

  })

  it('Update user\'s info, ServiceUnavailable', function () {

  })
})
