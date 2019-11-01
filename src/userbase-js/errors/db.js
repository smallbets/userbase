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

class DatabaseAlreadyOpening extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'DatabaseAlreadyOpening'
    this.message = 'Already attempting to open database.'
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

class ChangeHandlerMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ChangeHandlerMissing'
    this.message = 'Change handler must be be provided.'
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

class DatabaseNotOpen extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'DatabaseNotOpen'
    this.message = 'Database is not open.'
    this.status = statusCodes['Bad Request']
  }
}

class ItemMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ItemMissing'
    this.message = 'Item missing.'
    this.status = statusCodes['Bad Request']
  }
}

class ItemTooLarge extends Error {
  constructor(maxKb, ...params) {
    super(maxKb, ...params)

    this.name = 'ItemTooLarge'
    this.message = `Item must be less than ${maxKb} KB.`
    this.status = statusCodes['Bad Request']
  }
}

class ItemIdMustBeString extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ItemIdMustBeString'
    this.message = 'Item id must be a string.'
    this.status = statusCodes['Bad Request']
  }
}

class ItemIdTooLong extends Error {
  constructor(maxLength, ...params) {
    super(maxLength, ...params)

    this.name = 'ItemIdTooLong'
    this.message = `Item id must be less than ${maxLength} characters.`
    this.status = statusCodes['Bad Request']
  }
}

class ItemIdCannotBeBlank extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ItemIdCannotBeBlank'
    this.message = 'Item id cannot be blank.'
    this.status = statusCodes['Bad Request']
  }
}

class ItemAlreadyExists extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ItemAlreadyExists'
    this.message = 'Item with the same id already exists.'
    this.status = statusCodes['Conflict']
  }
}

class ItemDoesNotExist extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ItemDoesNotExist'
    this.message = 'Item with the provided id does not exist.'
    this.status = statusCodes['Not Found']
  }
}

class ItemUpdateConflict extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ItemUpdateConflict'
    this.message = 'Item update conflict.'
    this.status = statusCodes['Conflict']
  }
}

class OperationsMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'OperationsMissing'
    this.message = 'Operations missing.'
    this.status = statusCodes['Bad Request']
  }
}

class OperationsMustBeArray extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'OperationsMustBeArray'
    this.message = 'Operations provided must be an array.'
    this.status = statusCodes['Bad Request']
  }
}

class CommandUnrecognized extends Error {
  constructor(command, ...params) {
    super(command, ...params)

    this.name = 'CommandUnrecognized'
    this.message = `Command '${command}' unrecognized.`
    this.status = statusCodes['Bad Request']
  }
}

class OperationsConflict extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'OperationsConflict'
    this.message = 'Operations conflict. Only allowed 1 operation per item.'
    this.status = statusCodes['Conflict']
  }
}

export default {
  DatabaseNameCannotBeBlank,
  DatabaseNameMustBeString,
  DatabaseNameTooLong,
  DatabaseAlreadyOpen,
  DatabaseAlreadyOpening,
  KeyNotFound,
  ChangeHandlerMissing,
  ChangeHandlerMustBeFunction,
  DatabaseNotOpen,
  ItemMissing,
  ItemTooLarge,
  ItemIdMustBeString,
  ItemIdTooLong,
  ItemIdCannotBeBlank,
  ItemAlreadyExists,
  ItemDoesNotExist,
  ItemUpdateConflict,
  OperationsMissing,
  OperationsMustBeArray,
  OperationsConflict,
  CommandUnrecognized
}
