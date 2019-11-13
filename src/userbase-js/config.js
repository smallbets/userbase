import errors from './errors'
import { parseQueryStringWithoutArrayElems } from './utils'

let userbaseAppId = null
let userbaseEndpoint = 'https://preview.userbase.dev'
let userbaseKeyNotFoundHandler = null
const startingHash = window.location.hash

const getAppId = () => {
  if (!userbaseAppId) throw new errors.AppIdNotSet
  return userbaseAppId
}

const getEndpoint = () => userbaseEndpoint

const getKeyNotFoundHandler = () => userbaseKeyNotFoundHandler

const getUsernameAndTempPasswordFromStartingHash = () => {
  if (startingHash.includes('userbase-username') && startingHash.includes('userbase-tempPassword')) {
    const { username, tempPassword } = parseQueryStringWithoutArrayElems(startingHash.substring(1))
    return { username, tempPassword }
  }
  return null
}

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
  getUsernameAndTempPasswordFromStartingHash,
  configure,
}
