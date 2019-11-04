import statusCodes from '../statusCodes'

class ConfigParametersMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'ConfigParametersMissing'
    this.message = 'Configure parameters missing.'
    this.status = statusCodes['Bad Request']
  }
}

export default {
  ConfigParametersMissing,
}
