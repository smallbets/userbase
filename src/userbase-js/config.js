import ws from './ws'
import api from './api'

const DEFAULT_SERVICE_ENDPOINT = 'https://demo.encrypted.dev'
ws.endpoint = DEFAULT_SERVICE_ENDPOINT

let userbaseAppId = null
const getAppId = () => userbaseAppId

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
  if (ws.connected) throw new Error('WebSocket already open')

  if (appId) {
    if (userbaseAppId) throw new Error('App ID already set')
    userbaseAppId = appId
  }

  if (endpoint) {
    ws.endpoint = endpoint
  }
}

export default {
  configure,
  getAppId,
  getServerPublicKey
}
