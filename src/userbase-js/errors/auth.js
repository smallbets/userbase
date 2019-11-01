import statusCodes from '../statusCodes'

class UsernameAlreadyExists extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'UsernameAlreadyExists'
    this.message = 'Username already exists.'
    this.status = statusCodes['Conflict']
  }
}

class UsernameCannotBeBlank extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'UsernameCannotBeBlank'
    this.message = 'Username cannot be blank.'
    this.status = statusCodes['Bad Request']
  }
}

class UsernameTooLong extends Error {
  constructor(maxLen, ...params) {
    super(maxLen, ...params)

    this.name = 'UsernameTooLong'
    this.message = `Username too long. Must be a max of ${maxLen} characters.`
    this.status = statusCodes['Bad Request']
  }
}

class UsernameMustBeString extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'UsernameMustBeString'
    this.message = 'Username must be a string.'
    this.status = statusCodes['Bad Request']
  }
}

class PasswordCannotBeBlank extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'PasswordCannotBeBlank'
    this.message = 'Password cannot be blank.'
    this.status = statusCodes['Bad Request']
  }
}

class PasswordTooShort extends Error {
  constructor(minLen, ...params) {
    super(minLen, ...params)

    this.name = 'PasswordTooShort'
    this.message = `Password too short. Must be a minimum of ${minLen} characters.`
    this.status = statusCodes['Bad Request']
  }
}

class PasswordTooLong extends Error {
  constructor(maxLen, ...params) {
    super(maxLen, ...params)

    this.name = 'PasswordTooLong'
    this.message = `Password too long. Must be a max of ${maxLen} characters.`
    this.status = statusCodes['Bad Request']
  }
}

class PasswordMustBeString extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'PasswordMustBeString'
    this.message = 'Password must be a string.'
    this.status = statusCodes['Bad Request']
  }
}

class UsernameOrPasswordMismatch extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'UsernameOrPasswordMismatch'
    this.message = 'Username or password mismatch.'
    this.status = statusCodes['Unauthorized']
  }
}

class UserCanceledSignIn extends Error {
  constructor(username, ...params) {
    super(...params)

    this.name = 'UserCanceledSignIn'
    this.message = 'Canceled.'
    this.status = statusCodes['Bad Request']
    this.username = username
  }
}

class SessionAlreadyExists extends Error {
  constructor(username, ...params) {
    super(...params)

    this.name = 'SessionAlreadyExists'
    this.message = 'Session already exists.'
    this.status = statusCodes['Bad Request']
    this.username = username
  }
}

class NoSessionAvailable extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'NoSessionAvailable'
    this.message = 'No session available.'
    this.status = statusCodes['Bad Request']
  }
}

class UserNotSignedIn extends Error {
  constructor(username, ...params) {
    super(...params)

    this.name = 'UserNotSignedIn'
    this.message = 'User is not signed in.'
    this.status = statusCodes['Bad Request']
    this.username = username
  }
}

class SessionInvalid extends Error {
  constructor(username, ...params) {
    super(...params)

    this.name = 'SessionInvalid'
    this.message = 'Session invalid.'
    this.status = statusCodes['Unauthorized']
    this.username = username
  }
}

class AppIdInvalid extends Error {
  constructor(status, username, ...params) {
    super(...params)

    this.name = 'AppIdInvalid'
    this.message = 'App ID invalid.'
    this.status = status
    this.username = username
  }
}

export default {
  UsernameAlreadyExists,
  UsernameCannotBeBlank,
  UsernameTooLong,
  UsernameMustBeString,
  PasswordCannotBeBlank,
  PasswordTooShort,
  PasswordTooLong,
  PasswordMustBeString,
  UsernameOrPasswordMismatch,
  UserCanceledSignIn,
  SessionAlreadyExists,
  NoSessionAvailable,
  UserNotSignedIn,
  SessionInvalid,
  AppIdInvalid
}
