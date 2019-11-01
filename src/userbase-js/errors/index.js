import auth from './auth'
import db from './db'
import statusCodes from '../statusCodes'

class AppIdNotSet extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'AppIdNotSet'
    this.message = 'App ID not set yet. Make sure to configure app ID.'
    this.status = statusCodes['Bad Request']
  }
}

class ServiceUnavailable extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ServiceUnavailable'
    this.message = 'Service unavailable.'
    this.status = statusCodes['Service Unavailable']
  }
}

class InternalServerError extends ServiceUnavailable {
  constructor(...params) {
    super(...params)

    this.status = statusCodes['Internal Server Error']
  }
}

class Timeout extends ServiceUnavailable {
  constructor(...params) {
    super(...params)

    this.status = statusCodes['Gateway Timeout']
  }
}

export default {
  ...auth,
  ...db,
  AppIdNotSet,
  InternalServerError,
  ServiceUnavailable,
  Timeout
}
