import errors from './errors'

const VERSION = '/v1'
const DEFAULT_ENDPOINT = 'https://preview.userbase.dev' + VERSION

let userbaseAppId = null
window._userbaseEndpoint = DEFAULT_ENDPOINT

const getAppId = () => {
  if (!userbaseAppId) throw new errors.AppIdNotSet
  return userbaseAppId
}

const getEndpoint = () => window._userbaseEndpoint

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
