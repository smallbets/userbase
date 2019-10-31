import statusCodes from '../statusCodes'

class DatabaseNameCannotBeBlank extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'DatabaseNameCannotBeBlank'
    this.message = 'Database name cannot be blank.'
    this.status = statusCodes['Bad Request']
  }
}

class DatabaseNameMustBeString extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'DatabaseNameMustBeString'
    this.message = 'Database name must be a string.'
    this.status = statusCodes['Bad Request']
  }
}

class DatabaseNameTooLong extends Error {
  constructor(maxLength, ...params) {
    super(maxLength, ...params)

    this.name = 'DatabaseNameTooLong'
    this.message = `Database name must be less than ${maxLength} characters.`
    this.status = statusCodes['Bad Request']
  }
}

class DatabaseAlreadyOpen extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'DatabaseAlreadyOpen'
    this.message = 'Database is already open.'
    this.status = statusCodes['Bad Request']
  }
}

class AlreadyOpeningDatabase extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'AlreadyOpeningDatabase'
    this.message = 'Already attempting to open database.'
    this.status = statusCodes['Bad Request']
  }
}

class SessionNotConnected extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'SessionNotConnected'
    this.message = 'Session not connected yet. Please sign in.'
    this.status = statusCodes['Bad Request']
  }
}

class KeyNotFound extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'KeyNotFound'
    this.message = 'Key not found.'
    this.status = statusCodes['Bad Request']
  }
}

class ChangeHandlerMustBeFunction extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ChangeHandlerMustBeFunction'
    this.message = 'Change handler must be a function.'
    this.status = statusCodes['Bad Request']
  }
}

export default {
  DatabaseNameCannotBeBlank,
  DatabaseNameMustBeString,
  DatabaseNameTooLong,
  DatabaseAlreadyOpen,
  AlreadyOpeningDatabase,
  SessionNotConnected,
  KeyNotFound,
  ChangeHandlerMustBeFunction
}
