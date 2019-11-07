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

  if (appId !== userbaseAppId) {
    userbaseAppId = appId
  }
}

const configure = ({ appId, endpoint }) => {
  setAppId(appId)
  setEndpoint(endpoint)
}

export default {
  getEndpoint,
  getAppId,
  configure
}
