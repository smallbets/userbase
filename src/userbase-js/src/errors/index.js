import auth from './auth'
import db from './db'
import config from './config'
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

class Reconnecting extends ServiceUnavailable {
  constructor(...params) {
    super(...params)

    this.message = 'Reconnecting.'
  }
}

class UnknownServiceUnavailable extends ServiceUnavailable {
  constructor(e, ...params) {
    super(e, ...params)

    console.error('Userbase error. Please report this to support@userbase.com.\n\n', e)
  }
}

class ParamsMustBeObject extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ParamsMustBeObject'
    this.message = 'Parameters passed to function must be placed inside an object.'
    this.status = statusCodes['Bad Request']
  }
}

class TooManyRequests extends Error {
  constructor(retryDelay, ...params) {
    super(retryDelay, ...params)

    const retryDelaySeconds = Math.floor(retryDelay / 1000)

    this.name = 'TooManyRequests'
    this.message = `Too many requests in a row. Please try again in ${retryDelaySeconds} second${retryDelaySeconds !== 1 ? 's' : ''}.`
    this.status = statusCodes['Too Many Requests']
  }
}

export default {
  ...auth,
  ...db,
  ...config,
  AppIdNotSet,
  InternalServerError,
  ServiceUnavailable,
  Timeout,
  Reconnecting,
  UnknownServiceUnavailable,
  ParamsMustBeObject,
  TooManyRequests
}
