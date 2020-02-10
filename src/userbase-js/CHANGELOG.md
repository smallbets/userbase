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
