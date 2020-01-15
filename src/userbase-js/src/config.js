import errors from './errors'

const VERSION = '/v1'
const DEFAULT_ENDPOINT = 'https://preview.userbase.dev' + VERSION

let userbaseAppId = null
let userbaseEndpoint = DEFAULT_ENDPOINT
let userbaseKeyNotFoundHandler = null

const getAppId = () => {
  if (!userbaseAppId) throw new errors.AppIdNotSet
  return userbaseAppId
}

const getEndpoint = () => userbaseEndpoint

const getKeyNotFoundHandler = () => userbaseKeyNotFoundHandler

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

const setKeyNotFoundHandler = (keyNotFoundHandler) => {
  if (keyNotFoundHandler !== undefined && typeof keyNotFoundHandler !== 'function') {
    throw new errors.KeyNotFoundHandlerMustBeFunction
  }
  userbaseKeyNotFoundHandler = keyNotFoundHandler
}

const configure = ({ appId, endpoint, keyNotFoundHandler }) => {
  setAppId(appId)
  setEndpoint(endpoint)
  setKeyNotFoundHandler(keyNotFoundHandler)
}

export default {
  getAppId,
  getEndpoint,
  getKeyNotFoundHandler,
  configure,
}
