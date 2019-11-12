import statusCodes from '../statusCodes'

class AppIdMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'AppIdMissing'
    this.message = 'Application ID missing.'
    this.status = statusCodes['Bad Request']
  }
}

export default {
  AppIdMissing,
}
