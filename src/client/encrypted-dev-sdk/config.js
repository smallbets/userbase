import ws from './ws'

const updateConfig = (newEndpoint) => {
  if (ws.connected) throw new Error('WebSocket already open')
  ws.endpoint = newEndpoint
}

export default {
  updateConfig
}
