import errors from './errors'

let userbaseEndpoint = 'https://preview.userbase.dev'
const getEndpoint = () => userbaseEndpoint
const setEndpoint = (newEndpoint) => {
  if (!newEndpoint) return
  userbaseEndpoint = newEndpoint
}

let userbaseAppId = null
const getAppId = () => {
  if (!userbaseAppId) throw new errors.AppIdNotSet
  return userbaseAppId
}
const setAppId = (appId) => {
  if (!appId) throw new errors.AppIdMissing
  userbaseAppId = appId
}

let userbaseKeyNotFoundHandler = null
const getKeyNotFoundHandler = () => userbaseKeyNotFoundHandler
const setKeyNotFoundHandler = (keyNotFoundHandler) => {
  if (keyNotFoundHandler && typeof keyNotFoundHandler !== 'function') {
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
  getEndpoint,
  getAppId,
  getKeyNotFoundHandler,
  configure
}
