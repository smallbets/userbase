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

class UserAlreadySignedIn extends Error {
  constructor(username, ...params) {
    super(...params)

    this.name = 'UserAlreadySignedIn'
    this.message = 'Already signed in.'
    this.status = statusCodes['Bad Request']
    this.username = username
  }
}

class AppIdNotValid extends Error {
  constructor(status, username, ...params) {
    super(...params)

    this.name = 'AppIdNotValid'
    this.message = 'App ID not valid.'
    this.status = status
    this.username = username
  }
}

class UserNotSignedIn extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'UserNotSignedIn'
    this.message = 'Not signed in.'
    this.status = statusCodes['Bad Request']
  }
}

class UserNotFound extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'UserNotFound'
    this.message = 'User not found.'
    this.status = statusCodes['Not Found']
  }
}

class EmailNotValid extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'EmailNotValid'
    this.message = 'Email not valid.'
    this.status = statusCodes['Bad Request']
  }
}

class ProfileMustBeObject extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ProfileMustBeObject'
    this.message = 'Profile must be a flat JSON object.'
    this.status = statusCodes['Bad Request']
  }
}

class ProfileCannotBeEmpty extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ProfileCannotBeEmpty'
    this.message = 'Profile cannot be empty.'
    this.status = statusCodes['Bad Request']
  }
}

class ProfileHasTooManyKeys extends Error {
  constructor(maxKeys, ...params) {
    super(maxKeys, ...params)

    this.name = 'ProfileHasTooManyKeys'
    this.message = `Profile has too many keys. Must have a max of ${maxKeys} keys.`
    this.status = statusCodes['Bad Request']
  }
}

class ProfileKeyMustBeString extends Error {
  constructor(key, ...params) {
    super(key, ...params)

    this.name = 'ProfileKeyMustBeString'
    this.message = 'Profile key must be a string.'
    this.status = statusCodes['Bad Request']
    this.key = key
  }
}

class ProfileKeyTooLong extends Error {
  constructor(maxLen, key, ...params) {
    super(maxLen, key, ...params)

    this.name = 'ProfileKeyTooLong'
    this.message = `Profile key too long. Must be a max of ${maxLen} characters.`
    this.status = statusCodes['Bad Request']
    this.key = key
  }
}

class ProfileValueMustBeString extends Error {
  constructor(key, value, ...params) {
    super(key, value, ...params)

    this.name = 'ProfileValueMustBeString'
    this.message = 'Profile value must be a string.'
    this.status = statusCodes['Bad Request']
    this.key = key
    this.value = value
  }
}

class ProfileValueTooLong extends Error {
  constructor(maxLen, key, value, ...params) {
    super(maxLen, key, value, ...params)

    this.name = 'ProfileValueTooLong'
    this.message = `Profile value too long. Must be a max of ${maxLen} characters.`
    this.status = statusCodes['Bad Request']
    this.key = key
    this.value = value
  }
}

class RememberMeMustBeBoolean extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'RememberMeMustBeBoolean'
    this.message = 'Remember me value must be a boolean.'
    this.status = statusCodes['Bad Request']
  }
}

class ParamsMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ParamsMissing'
    this.message = 'Parameters expected are missing.'
    this.status = statusCodes['Bad Request']
  }
}

class TrialExceededLimit extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'TrialExceededLimit'
    this.message = 'Trial exceeded limit of users.'
    this.status = statusCodes['Payment Required']
  }
}

class CurrentPasswordMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'CurrentPasswordMissing'
    this.message = 'Current password missing.'
    this.status = statusCodes['Bad Request']
  }
}

class CurrentPasswordIncorrect extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'CurrentPasswordIncorrect'
    this.message = 'Current password is incorrect.'
    this.status = statusCodes['Unauthorized']
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
  UserAlreadySignedIn,
  AppIdNotValid,
  UserNotSignedIn,
  UserNotFound,
  EmailNotValid,
  ProfileMustBeObject,
  ProfileCannotBeEmpty,
  ProfileHasTooManyKeys,
  ProfileKeyMustBeString,
  ProfileKeyTooLong,
  ProfileValueMustBeString,
  ProfileValueTooLong,
  RememberMeMustBeBoolean,
  ParamsMissing,
  TrialExceededLimit,
  CurrentPasswordMissing,
  CurrentPasswordIncorrect
}
