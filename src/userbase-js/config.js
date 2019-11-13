import errors from './errors'

let userbaseAppId = null
let userbaseEndpoint = 'https://preview.userbase.dev'
let userbaseKeyNotFoundHandler = null

const getAppId = () => {
  if (!userbaseAppId) throw new errors.AppIdNotSet
  return userbaseAppId
}

const getEndpoint = () => userbaseEndpoint

const getKeyNotFoundHandler = () => userbaseKeyNotFoundHandler

const setAppId = (appId) => {
  if (!appId) throw new errors.AppIdMissing
  userbaseAppId = appId
}

const setEndpoint = (newEndpoint) => {
  if (!newEndpoint) return
  userbaseEndpoint = newEndpoint
}

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
  getAppId,
  getEndpoint,
  getKeyNotFoundHandler,
  configure,
}
