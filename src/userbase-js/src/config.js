import errors from './errors'

const VERSION = '/v1'
const DEFAULT_ENDPOINT = 'https://v1.userbase.com' + VERSION

let userbaseAppId = null
window._userbaseEndpoint = DEFAULT_ENDPOINT

const getAppId = () => {
  if (!userbaseAppId) throw new errors.AppIdNotSet
  return userbaseAppId
}

let cachedEndpoint
const getEndpoint = () => {
  // prevent unsafe override of window object by only allowing single endpoint to be used
  if (cachedEndpoint && cachedEndpoint !== window._userbaseEndpoint) {
    throw new errors.ServiceUnavailable
  }
  cachedEndpoint = window._userbaseEndpoint
  return cachedEndpoint
}

const setAppId = (appId) => {
  if (userbaseAppId && userbaseAppId !== appId) throw new errors.AppIdAlreadySet(userbaseAppId)
  if (typeof appId !== 'string') throw new errors.AppIdMustBeString
  if (appId.length === 0) throw new errors.AppIdCannotBeBlank
  userbaseAppId = appId
}

const configure = ({ appId }) => {
  setAppId(appId)
}

export default {
  getAppId,
  getEndpoint,
  configure,
}
