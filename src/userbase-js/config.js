import ws from './ws'

let userbaseAppId = null
const getAppId = () => userbaseAppId

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
  getAppId
}
