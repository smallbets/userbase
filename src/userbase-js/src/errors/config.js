import statusCodes from '../statusCodes'

class AppIdAlreadySet extends Error {
  constructor(appId, ...params) {
    super(appId, ...params)

    this.name = 'AppIdAlreadySet'
    this.message = 'Application ID already set.'
    this.status = statusCodes['Conflict']
    this.appId = appId
  }
}

class AppIdMustBeString extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'AppIdMustBeString'
    this.message = 'Application ID must be a string.'
    this.status = statusCodes['Bad Request']
  }
}

class AppIdMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'AppIdMissing'
    this.message = 'Application ID missing.'
    this.status = statusCodes['Bad Request']
  }
}
class AppIdCannotBeBlank extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'AppIdCannotBeBlank'
    this.message = 'Application ID cannot be blank.'
    this.status = statusCodes['Bad Request']
  }
}

class WebCryptoUnavailable extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'WebCryptoUnavailable'
    this.message = 'The WebCrypto API is unavailable. Please make sure your website uses https.'
    this.status = statusCodes['Bad Request']
  }
}

class UpdateUserHandlerMustBeFunction extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'UpdateUserHandlerMustBeFunction'
    this.message = 'Update user handler must be a function.'
    this.status = statusCodes['Bad Request']
  }
}
export default {
  AppIdAlreadySet,
  AppIdMustBeString,
  AppIdMissing,
  AppIdCannotBeBlank,
  WebCryptoUnavailable,
  UpdateUserHandlerMustBeFunction,
}
