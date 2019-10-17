import ws from './ws'

let userbaseAppId = null
const getAppId = () => userbaseAppId

const updateConfig = ({ appId, newEndpoint }) => {
  if (ws.connected) throw new Error('WebSocket already open')

  if (appId) {
    if (userbaseAppId) throw new Error('App id already set')
    userbaseAppId = appId
  }

  if (newEndpoint) {
    ws.endpoint = newEndpoint
  }
}

export default {
  updateConfig,
  getAppId
}
