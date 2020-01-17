import errors from './errors'

const VERSION = '/v1'
const DEFAULT_ENDPOINT = 'https://preview.userbase.dev' + VERSION

let userbaseAppId = null
let userbaseEndpoint = DEFAULT_ENDPOINT

const getAppId = () => {
  if (!userbaseAppId) throw new errors.AppIdNotSet
  return userbaseAppId
}

const getEndpoint = () => userbaseEndpoint

const setAppId = (appId) => {
  if (userbaseAppId && userbaseAppId !== appId) throw new errors.AppIdAlreadySet(userbaseAppId)
  if (typeof appId !== 'string') throw new errors.AppIdMustBeString
  if (appId.length === 0) throw new errors.AppIdCannotBeBlank
  userbaseAppId = appId
}

const setEndpoint = (newEndpoint) => {
  if (!newEndpoint) return
  if (userbaseEndpoint !== DEFAULT_ENDPOINT && newEndpoint + VERSION !== userbaseEndpoint) {
    throw new errors.EndpointAlreadySet(userbaseEndpoint)
  }
  userbaseEndpoint = newEndpoint + VERSION
}

const configure = ({ appId, endpoint }) => {
  setAppId(appId)
  setEndpoint(endpoint)
}

export default {
  getAppId,
  getEndpoint,
  configure,
}
