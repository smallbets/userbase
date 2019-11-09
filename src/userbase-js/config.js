import ws from './ws'
import api from './api'
import errors from './errors'

const DEFAULT_SERVICE_ENDPOINT = 'https://preview.userbase.dev'
ws.endpoint = DEFAULT_SERVICE_ENDPOINT

let userbaseAppId = null
const getAppId = () => {
  if (!userbaseAppId) throw new errors.AppIdNotSet
  return userbaseAppId
}

let serverPublicKey = null
const getServerPublicKey = async () => {
  if (serverPublicKey) {
    return serverPublicKey
  } else {
    serverPublicKey = await api.auth.getServerPublicKey() // eslint-disable-line require-atomic-updates
    return serverPublicKey
  }
}

const configure = ({ appId, endpoint }) => {
  if (!appId && !endpoint) throw new errors.ConfigParametersMissing

  if (appId && appId !== userbaseAppId) {
    if (ws.connected) throw new errors.UserAlreadySignedIn
    userbaseAppId = appId
  }

  if (endpoint && endpoint !== ws.endpoint) {
    if (ws.connected) throw new errors.UserAlreadySignedIn
    ws.endpoint = endpoint
  }
}

export default {
  configure,
  getAppId,
  getServerPublicKey
}
