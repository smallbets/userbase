// loads userbase on window object
window.cordova.require('cordova-plugin-userbase.userbase-js')

var scrypt = function (passwordArrayBuffer, saltArrayBuffer, N, r, p, dkLen) {
  return new Promise(function (resolve, reject) {
    function successCallback(passwordHash) {
      resolve(passwordHash)
    }

    function errorCallback(e) {
      reject(e)
    }

    // convert Uint8 Arrays into arrays of Uint8
    var password = Array.prototype.slice.call(passwordArrayBuffer)
    var salt = Array.prototype.slice.call(saltArrayBuffer)

    var options = { N, r, p, dkLen }

    window.cordova.exec(successCallback, errorCallback, "ScryptPlugin", "scrypt", [password, salt, options])
  })
}

var signUp = window.userbase.signUp
window.userbase.signUp = function (params) {
  if (typeof params === 'object') params.passwordHashAlgo = scrypt
  return signUp(params)
}

var signIn = window.userbase.signIn
window.userbase.signIn = function (params) {
  if (typeof params === 'object') params.passwordHashAlgo = scrypt
  return signIn(params)
}

var updateUser = window.userbase.updateUser
window.userbase.updateUser = function (params) {
  if (typeof params === 'object') params.passwordHashAlgo = scrypt
  return updateUser(params)
}
