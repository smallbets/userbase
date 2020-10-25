import statusCodes from '../statusCodes'

class DatabaseNameMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'DatabaseNameMissing'
    this.message = 'Database name missing.'
    this.status = statusCodes['Bad Request']
  }
}

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
    this.message = `Database name cannot be more than ${maxLength} characters.`
    this.status = statusCodes['Bad Request']
  }
}

class DatabaseNameRestricted extends Error {
  constructor(databaseName, ...params) {
    super(databaseName, ...params)

    this.name = 'DatabaseNameRestricted'
    this.message = `Database name '${databaseName}' is restricted. It is used internally by userbase-js.`
    this.status = statusCodes['Forbidden']
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

class ChangeHandlerMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ChangeHandlerMissing'
    this.message = 'Change handler missing.'
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

class DatabaseNotFound extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'DatabaseNotFound'
    this.message = 'Database not found. Find available databases using getDatabases().'
    this.status = statusCodes['Not Found']
  }
}

class DatabaseIsReadOnly extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'DatabaseIsReadOnly'
    this.message = 'Database is read only. Must have permission to write to database.'
    this.status = statusCodes['Forbidden']
  }
}

class DatabaseIdMustBeString extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'DatabaseIdMustBeString'
    this.message = 'Database id must be a string.'
    this.status = statusCodes['Bad Request']
  }
}

class DatabaseIdCannotBeBlank extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'DatabaseIdCannotBeBlank'
    this.message = 'Database id cannot be blank.'
    this.status = statusCodes['Bad Request']
  }
}

class DatabaseIdNotAllowed extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'DatabaseIdNotAllowed'
    this.message = 'Database id not allowed. Cannot provide both databaseName and databaseId, can only provide one.'
    this.status = statusCodes['Bad Request']
  }
}

class DatabaseIdNotAllowedForOwnDatabase extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'DatabaseIdNotAllowedForOwnDatabase'
    this.message = "Tried to open the user's own database using its databaseId rather than its databaseName. The databaseId should only be used to open databases shared from other users."
    this.status = statusCodes['Forbidden']
  }
}

class DatabaseIdInvalidLength extends Error {
  constructor(length, ...params) {
    super(length, ...params)

    this.name = 'DatabaseIdInvalidLength'
    this.message = `Database id invalid length. Must be ${length} characters.`
    this.status = statusCodes['Bad Request']
  }
}

class ReadOnlyMustBeBoolean extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ReadOnlyMustBeBoolean'
    this.message = 'Read only value must be a boolean.'
    this.status = statusCodes['Bad Request']
  }
}

class ReadOnlyParamNotAllowed extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ReadOnlyParamNotAllowed'
    this.message = 'Read only parameter not allowed when revoking access to a database.'
    this.status = statusCodes['Bad Request']
  }
}

class ResharingAllowedParamNotAllowed extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ResharingAllowedParamNotAllowed'
    this.message = 'Resharing allowed parameter not allowed when revoking access to a database.'
    this.status = statusCodes['Bad Request']
  }
}

class ResharingAllowedMustBeBoolean extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ResharingAllowedMustBeBoolean'
    this.message = 'Resharing allowed value must be a boolean.'
    this.status = statusCodes['Bad Request']
  }
}

class ResharingNotAllowed extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ResharingNotAllowed'
    this.message = 'Resharing not allowed. Must have permission to reshare the database with another user.'
    this.status = statusCodes['Forbidden']
  }
}

class ResharingWithWriteAccessNotAllowed extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ResharingWithWriteAccessNotAllowed'
    this.message = 'Resharing with write access not allowed. Must have permission to write to the database to reshare the database with write access another user.'
    this.status = statusCodes['Forbidden']
  }
}

class SharingWithSelfNotAllowed extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'SharingWithSelfNotAllowed'
    this.message = 'Sharing database with self is not allowed. Must share database with another user.'
    this.status = statusCodes['Bad Request']
  }
}

class ModifyingOwnPermissionsNotAllowed extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ModifyingOwnPermissionsNotAllowed'
    this.message = "Modifying own database permissions not allowed. Must modify another user's permissions."
    this.status = statusCodes['Bad Request']
  }
}

class ModifyingOwnerPermissionsNotAllowed extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ModifyingOwnerPermissionsNotAllowed'
    this.message = "Modifying the owner of a database's permissions is not allowed."
    this.status = statusCodes['Forbidden']
  }
}

class ModifyingPermissionsNotAllowed extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ModifyingPermissionsNotAllowed'
    this.message = "Modifying another user's permissions is not allowed. Must have permission to reshare the database with another user."
    this.status = statusCodes['Forbidden']
  }
}

class GrantingWriteAccessNotAllowed extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'GrantingWriteAccessNotAllowed'
    this.message = 'Granting write access not allowed. Must have permission to write to the database to grant write access to another user.'
    this.status = statusCodes['Forbidden']
  }
}

class RequireVerifiedMustBeBoolean extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'RequireVerifiedMustBeBoolean'
    this.message = 'Require verified value must be a boolean.'
    this.status = statusCodes['Bad Request']
  }
}

class RevokeMustBeBoolean extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'RevokeMustBeBoolean'
    this.message = 'Revoke value must be a boolean.'
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

class ItemInvalid extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ItemInvalid'
    this.message = 'Item must be serializable to JSON.'
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
    this.message = `Item id cannot be more than ${maxLength} characters.`
    this.status = statusCodes['Bad Request']
  }
}

class ItemIdMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ItemIdMissing'
    this.message = 'Item id missing.'
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

class FileMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'FileMissing'
    this.message = 'File missing.'
    this.status = statusCodes['Bad Request']
  }
}

class FileMustBeFile extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'FileMustBeFile'
    this.message = 'File must be a file.'
    this.status = statusCodes['Bad Request']
  }
}

class FileCannotBeEmpty extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'FileCannotBeEmpty'
    this.message = 'File cannot be empty.'
    this.status = statusCodes['Bad Request']
  }
}

class FileUploadConflict extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'FileUploadConflict'
    this.message = 'File upload conflict.'
    this.status = statusCodes['Conflict']
  }
}

class FileNotFound extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'FileNotFound'
    this.message = 'File not found.'
    this.status = statusCodes['Not Found']
  }
}

class FileIdMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'FileIdMissing'
    this.message = 'File id missing.'
    this.status = statusCodes['Bad Request']
  }
}

class FileIdMustBeString extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'FileIdMustBeString'
    this.message = 'File id must be a string.'
    this.status = statusCodes['Bad Request']
  }
}

class FileIdCannotBeBlank extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'FileIdCannotBeBlank'
    this.message = 'File id cannot be blank.'
    this.status = statusCodes['Bad Request']
  }
}

class FileIdTooLong extends Error {
  constructor(maxLength, ...params) {
    super(maxLength, ...params)

    this.name = 'FileIdTooLong'
    this.message = `File id cannot be more than ${maxLength} characters.`
    this.status = statusCodes['Bad Request']
  }
}

class RangeMustBeObject extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'RangeMustBeObject'
    this.message = 'Range param provided must be object.'
    this.status = statusCodes['Bad Request']
  }
}

class RangeMissingStart extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'RangeMissingStart'
    this.message = 'Range param missing start.'
    this.status = statusCodes['Bad Request']
  }
}

class RangeMissingEnd extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'RangeMissingEnd'
    this.message = 'Range param missing end.'
    this.status = statusCodes['Bad Request']
  }
}

class RangeStartMustBeNumber extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'RangeStartMustBeNumber'
    this.message = 'Range start provided must be a number.'
    this.status = statusCodes['Bad Request']
  }
}

class RangeEndMustBeNumber extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'RangeEndMustBeNumber'
    this.message = 'Range end provided must be a number.'
    this.status = statusCodes['Bad Request']
  }
}

class RangeStartMustBeGreaterThanZero extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'RangeStartMustBeGreaterThanZero'
    this.message = 'Range start provided must be greater than 0.'
    this.status = statusCodes['Bad Request']
  }
}

class RangeEndMustBeGreaterThanRangeStart extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'RangeEndMustBeGreaterThanRangeStart'
    this.message = 'Range end provided must be greater than range start.'
    this.status = statusCodes['Bad Request']
  }
}

class RangeEndMustBeLessThanFileSize extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'RangeEndMustBeLessThanFileSize'
    this.message = 'Range end provided must be less than file size.'
    this.status = statusCodes['Bad Request']
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

class CommandNotRecognized extends Error {
  constructor(command, ...params) {
    super(command, ...params)

    this.name = 'CommandNotRecognized'
    this.message = `Command '${command}' not recognized.`
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

class OperationsExceedLimit extends Error {
  constructor(limit, ...params) {
    super(limit, ...params)

    this.name = 'OperationsExceedLimit'
    this.message = `Operations exceed limit. Only allowed ${limit} operations.`
    this.status = statusCodes['Bad Request']
  }
}

class UserNotVerified extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'UserNotVerified'
    this.message = 'User not verified. Either verify user before sharing database, or set requireVerified to false.'
    this.status = statusCodes['Forbidden']
  }
}

class UserMustBeReverified extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'UserMustBeReverified'
    this.message = 'User must be reverified.'
    this.status = statusCodes['Forbidden']
  }
}

class UserUnableToReceiveDatabase extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'UserUnableToReceiveDatabase'
    this.message = 'User unable to receive database. User must sign in with an updated userbase-js client to be able to receive database.'
    this.status = statusCodes['Forbidden']
  }
}

class VerificationMessageMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'VerificationMessageMissing'
    this.message = 'Verification message missing.'
    this.status = statusCodes['Bad Request']
  }
}

class VerificationMessageCannotBeBlank extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'VerificationMessageCannotBeBlank'
    this.message = 'Verification message cannot be blank.'
    this.status = statusCodes['Bad Request']
  }
}

class VerificationMessageMustBeString extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'VerificationMessageMustBeString'
    this.message = 'Verification message must be a string.'
    this.status = statusCodes['Bad Request']
  }
}

class VerificationMessageInvalid extends Error {
  constructor(maxLength, ...params) {
    super(maxLength, ...params)

    this.name = 'VerificationMessageInvalid'
    this.message = 'Verification message invalid.'
    this.status = statusCodes['Bad Request']
  }
}

class VerifyingSelfNotAllowed extends Error {
  constructor(maxLength, ...params) {
    super(maxLength, ...params)

    this.name = 'VerifyingSelfNotAllowed'
    this.message = 'Verifying self not allowed. Can only verify other users.'
    this.status = statusCodes['Bad Request']
  }
}

class ProgressHandlerMustBeFunction extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ProgressHandlerMustBeFunction'
    this.message = 'Progress handler must be a function.'
    this.status = statusCodes['Bad Request']
  }
}

export default {
  DatabaseNameMissing,
  DatabaseNameCannotBeBlank,
  DatabaseNameMustBeString,
  DatabaseNameTooLong,
  DatabaseNameRestricted,
  DatabaseNotFound,
  DatabaseIsReadOnly,
  DatabaseAlreadyOpening,
  DatabaseIdMustBeString,
  DatabaseIdCannotBeBlank,
  DatabaseIdNotAllowed,
  DatabaseIdNotAllowedForOwnDatabase,
  DatabaseIdInvalidLength,
  ReadOnlyMustBeBoolean,
  ReadOnlyParamNotAllowed,
  ResharingAllowedMustBeBoolean,
  ResharingNotAllowed,
  ResharingWithWriteAccessNotAllowed,
  ResharingAllowedParamNotAllowed,
  SharingWithSelfNotAllowed,
  ModifyingOwnPermissionsNotAllowed,
  ModifyingOwnerPermissionsNotAllowed,
  ModifyingPermissionsNotAllowed,
  GrantingWriteAccessNotAllowed,
  RequireVerifiedMustBeBoolean,
  RevokeMustBeBoolean,
  ChangeHandlerMissing,
  ChangeHandlerMustBeFunction,
  DatabaseNotOpen,
  ItemMissing,
  ItemInvalid,
  ItemTooLarge,
  ItemIdMustBeString,
  ItemIdTooLong,
  ItemIdMissing,
  ItemIdCannotBeBlank,
  ItemAlreadyExists,
  ItemDoesNotExist,
  ItemUpdateConflict,
  FileMissing,
  FileMustBeFile,
  FileCannotBeEmpty,
  FileUploadConflict,
  FileNotFound,
  FileIdMissing,
  FileIdMustBeString,
  FileIdCannotBeBlank,
  FileIdTooLong,
  RangeMustBeObject,
  RangeMissingStart,
  RangeMissingEnd,
  RangeStartMustBeNumber,
  RangeEndMustBeNumber,
  RangeStartMustBeGreaterThanZero,
  RangeEndMustBeGreaterThanRangeStart,
  RangeEndMustBeLessThanFileSize,
  OperationsMissing,
  OperationsMustBeArray,
  OperationsConflict,
  OperationsExceedLimit,
  CommandNotRecognized,
  UserNotVerified,
  UserMustBeReverified,
  UserUnableToReceiveDatabase,
  VerificationMessageMissing,
  VerificationMessageMustBeString,
  VerificationMessageCannotBeBlank,
  VerificationMessageInvalid,
  VerifyingSelfNotAllowed,
  ProgressHandlerMustBeFunction,
}
