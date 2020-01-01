import errors from './errors'

const VERSION = '/v1'

let userbaseAppId = null
let userbaseEndpoint = 'https://preview.userbase.dev' + VERSION
let userbaseKeyNotFoundHandler = null

const getAppId = () => {
  if (!userbaseAppId) throw new errors.AppIdNotSet
  return userbaseAppId
}

const getEndpoint = () => userbaseEndpoint

const getKeyNotFoundHandler = () => userbaseKeyNotFoundHandler

const setAppId = (appId) => {
  if (typeof appId !== 'string') throw new errors.AppIdMustBeString
  if (appId.length === 0) throw new errors.AppIdCannotBeBlank
  userbaseAppId = appId
}

const setEndpoint = (newEndpoint) => {
  if (!newEndpoint) return
  userbaseEndpoint = newEndpoint + VERSION
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
