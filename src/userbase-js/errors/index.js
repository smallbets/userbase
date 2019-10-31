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

class InternalServerError extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'InternalServerError'
    this.message = 'Internal server error. Please contact support for help.'
    this.status = statusCodes['Internal Server Error']
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

class Timeout extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'Timeout'
    this.message = 'Request timed out. Please try again.'
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
