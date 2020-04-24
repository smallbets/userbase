## [1.3.0] - 2020-04-02
## Added
- signUp(), signIn(), and init() return the user’s authToken which can be passed to a 3rd party server to verify the user is signed in to Userbase via the Admin API.
- browser compatibility list included in README along with a polyfill recommendation for Internet Explorer.

## Fixed
- init() throws WebCryptoUnavailable if the Web Crypto API is not available instead of ServiceUnavailable.

## Changed
- signIn() throws UserPendingDeletion if user tries to sign in while the user is pending deletion instead of UsernameOrPasswordMismatch.
- Axios dependency replaced by native XMLHttpRequest.
- Internal usage of .includes() replaced with .indexOf() !== -1 to support wider number of browsers without need for polyfill.

## Removed
- Babel runtime corejs3 dependency.
- ProfileKeyMustBeString error from signUp() and updateUser() since javascript automatically converts keys object keys to strings anyway.

## [1.2.0] - 2020-02-29
## Added
- signIn() and init() return the user’s protectedProfile which can be set via the Admin API server-side.

## [1.1.2] - 2020-02-23
## Fixed
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
