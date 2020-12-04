## [2.4.3] - 2020-12-03
### Added
- Admin can now create a domain whitelist for an app in the admin panel. The SDK catches and throws clean `DomainNotWhitelisted` error when user attempts to use an app ID from a domain that is not on the whitelist.

## [2.4.2] - 2020-12-02
### Fixed
- init() now accepts a parameter `allowServerSideEncryption` in order for the SDK to create and interact with databases in the 'server-side' encryption mode. This prevents a dishonest server from maliciously changing an app's encryption mode to server-side, thereby causing clients to store new data in plaintext.

## [2.4.1] - 2020-11-30
### Changed
- modifyDatabasePermissions() now accepts self if user wants to revoke own access to database.

### Fixed
- If developer provides `changeHandler` that throws when executed, SDK catches the error then passes to console.error and continues, rather than throw ServiceUnavailable.

## [2.4.0] - 2020-11-24
### Added
- Encryption modes 'end-to-end' or 'server-side' set by the admin in the Admin panel are respected by the client. Databases created in 'end-to-end' mode remain end-to-end encrypted same as before (the default behavior). Databases created in 'server-side' mode store the plaintext database encryption key on the server; these databases can be recovered if a user forgets their password and loses access to their device.
- getDatabases() returns a database's `encryptionMode`.
- signIn() returns a boolean `changePassword` if the user needs to change their password to access database and payments functions in the SDK.
- forgotPassword() accepts a new optional parameter `deleteEndToEndEncryptedData` to allow users of an app with encryption mode set to 'end-to-end' who forget their password and lose access to their device to regain access to their account.
- openDatabase(), insertItem(), updateItem(), putTransaction(), uploadFile(), and getFile() all take a new optional parameter `encryptionMode` to override an app's default behavior for a database.

### Fixed
- signIn() signs in correctly when a user provides the correct password but their seed stored in browser storage is incorrect, rather than throw ServiceUnavailable.
- init() returns the `lastUsedUsername` when a user's seed stored in browser storage is incorrect, rather than throw ServiceUnavailable.

## [2.3.0] - 2020-10-26
### Added
- uploadFile() now accepts an optional `progressHandler` callback, which passes total `bytesTransferred` back to the caller every 512 KB uploaded.

### Changed
- `databaseName` can now be up to 100 characters, rather than 50 characters.
- forgotPassword() gives a more user-friendly error message if the user attempts to call it from a device that does not have their key saved.
- signIn() gives a more user-friendly error message if the user attempts to sign in using a temporary password from a device that does not have their key saved.

### Fixed
- typescript file's getDatabases() returns correct object type.

## [2.2.2] - 2020-10-08
### Added
- getDatabases() returns a `databaseId` for all databases, instead of only returning it for databases shared with the user.

### Changed
- shareDatabase() and modifyDatabasePermissions() now accept a `databaseId` even if the user owns the database.

## [2.2.1] - 2020-09-10
### Fixed
- shareDatabase() UserNotVerified error message should recommend seting requireVerified to false rather than true.

## [2.2.0] - 2020-09-08
### Added
- openDatabase() changeHandler for newly created databases passes back attribution data on inserts, updates, and file uploads.

## [2.1.3] - 2020-08-22
### Fixed
- getFile() throws FileNotFound when user attempts to get a file that has been overwritten, rather than ServiceUnavailable.

## [2.1.2] - 2020-08-21
### Added
- getDatabases() now accepts `databaseName` or `databaseId` as a parameter to filter the result.

## [2.1.1] - 2020-08-15
### Fixed
- getFile() works after user has inserted many items into a database instead of throwing FileNotFound.

## [2.1.0] - 2020-08-12
Note: Deprecated. Please use the latest version.

### Added
- uploadFile() to enable file storage.
- getFile() to enable retrieving files.
- items inside the changeHandler() callback passed to openDatabase() provide file metadata if a file is stored on an item.
- `sessionLength` parameter to signUp(), signIn(), and init() allow developer to set custom session duration.
- `updateUserHandler` callback function as a parameter to init() allows developers to listen for changes to users in real-time.

### Fixed
- deleteUser() removes user's seed from browser storage.
- updateUser() throws PasswordCannotBeBlank instead of PasswordMissing when `currentPassword` or `newPassword` is empty string.

## [2.0.1] - 2020-07-02
### Fixed
- signUp(), signIn(), and init() working in Firefox.

## [2.0.0] - 2020-06-23
Note: Deprecated. Please use the latest version.

### Added
- shareDatabase() to enable database sharing between users.
- modifyDatabasePermissions() for access control to databases shared between users.
- getVerificationMessage() and verifyUser() to enable users to prevent man-in-the-middle (MITM) attacks when sharing databases.
- getDatabases() now returns the `databaseId` of databases shared with the user, database metadata, as well as the users who have access to the database.
- openDatabase(), insertItem(), updateItem(), deleteItem(), and putTransaction() accept a `databaseId` as a parameter in place of a `databaseName` for databases the user has received access to from other users.

## [1.4.1] - 2020-05-20
### Changed
- init() now returns immediately if the user's session has expired rather than make a request to the Userbase server to find out it has expired.

## [1.4.0] - 2020-05-04
### Added
- purchaseSubscription(), cancelSubscription(), resumeSubscription(), and updatePaymentMethod() functions to enable developers to accept subscription payments from their users.
- getDatabases() enables developers to get all of a user's databases.
- signUp(), signIn(), and init() return `paymentsMode`, the app's payments mode set by the admin, `creationDate`, the date the user was created, and `trialExpirationDate`, the date the user's trial expires.
- signIn() and init() return `subscriptionStatus`, the user's subscription status, and `cancelSubscriptionAt`, the date the user's subscription is set to be canceled.

### Fixed
- Network errors throw ServiceUnavailable instead of never returning.

### Changed
- openDatabase() now requires the user to pay for a subscription to an app that has payments enabled in the admin panel.

## [1.3.0] - 2020-04-02
### Added
- signUp(), signIn(), and init() return the user’s authToken which can be passed to a 3rd party server to verify the user is signed in to Userbase via the Admin API.
- browser compatibility list included in README along with a polyfill recommendation for Internet Explorer.

### Fixed
- init() throws WebCryptoUnavailable if the Web Crypto API is not available instead of ServiceUnavailable.

### Changed
- signIn() throws UserPendingDeletion if user tries to sign in while the user is pending deletion instead of UsernameOrPasswordMismatch.
- Axios dependency replaced by native XMLHttpRequest.
- Internal usage of .includes() replaced with .indexOf() !== -1 to support wider number of browsers without need for polyfill.

### Removed
- Babel runtime corejs3 dependency.
- ProfileKeyMustBeString error from signUp() and updateUser() since javascript automatically converts keys object keys to strings anyway.

## [1.2.0] - 2020-02-29
### Added
- signIn() and init() return the user’s protectedProfile which can be set via the Admin API server-side.

## [1.1.2] - 2020-02-23
### Fixed
- window variable is no longer referenced in global scope so the client can be built server-side via Gatsby.

## [1.1.1] - 2020-02-18
### Changed
- insertItem(), updateItem(), and putTransaction() now only throw ItemMissing if an `item` param is not explicitly provided.
- insertItem(), updateItem(), and putTransaction() with an item set to undefined (or any other data type that cannot be serialized to JSON via `JSON.stringify`) now throw ItemInvalid instead of throwing ItemMissing.

### Fixed
- signIn() with a username that includes a "`+`" character now works instead of throwing UsernameOrPasswordMismatch.
- insertItem(), updateItem(), and putTransaction() with an item set to false, null, 0, or a 0 length string now work instead of throwing ItemMissing.
- DatabaseNameTooLong and ItemIdTooLong error messages are now more accurate.
- OperationsExceedLimit now throws error status 400 (Bad Request) instead of 409 (conflict).


## [1.1.0] - 2020-02-10
### Added
- forgotPassword() enables users to have a temporary password sent to their email. They can use it to sign in from a device they've signed in from before with `rememberMe` set to `'local'` and change their password.
- signIn() returns usedTempPassword boolean.
- SDK functions throw "Missing" error when a required parameter is left off the params object.

## [1.0.1] - 2020-01-31
### Added
- signUp(), signIn(), and init() return the user's userId.
- SDK functions throw TooManyRequests error when rate limit is reached.
- console.error() verbose output to the dev console on unknown errors.

### Changed
- if session or local storage are unavailable, fallback to memory storage (same behavior as rememberMe = 'none') rather than throw ServiceUnavailable.

### Fixed
- 0 length profile object values now throw ProfileValueCannotBeBlank instead of ServiceUnavailable.
- falsey profile object values (null, undefined, 0, or false) now throw ProvileValueMustBeString.
