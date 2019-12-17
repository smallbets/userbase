import statusCodes from '../statusCodes'

class AppIdMustBeString extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'AppIdMustBeString'
    this.message = 'Application ID must be a string.'
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

export default {
  AppIdMustBeString,
  AppIdCannotBeBlank,
}
