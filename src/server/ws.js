import uuidv4 from 'uuid/v4'
import memcache from './memcache'
import logger from './logger'

class Connection {
  constructor(userId, socket) {
    this.userId = userId
    this.socket = socket
    this.lastSeqNo = -1
    this.id = uuidv4()
  }

  push(forceEmpty) {
    const transactionLog = memcache.getTransactions(this.userId, this.lastSeqNo, false)
    if (!transactionLog || transactionLog.length == 0) {
      forceEmpty && this.socket.send(JSON.stringify({ transactionLog, route: 'transactionLog' }))
      return
    }
    this.socket.send(JSON.stringify({ transactionLog, route: 'transactionLog' }))
    this.lastSeqNo = transactionLog[transactionLog.length - 1]['seqNo']
  }
}

export default class Connections {
  static register(userId, socket) {
    if (!Connections.sockets) Connections.sockets = {}
    if (!Connections.sockets[userId]) Connections.sockets[userId] = {}

    const connection = new Connection(userId, socket)

    Connections.sockets[userId][connection.id] = connection
    logger.info(`Websocket ${connection.id} connected from user ${userId}`)

    const forceEmpty = true
    this.push(userId, forceEmpty)

    return connection
  }

  static push(userId, forceEmpty = false) {
    if (!Connections.sockets || !Connections.sockets[userId]) return

    for (const conn of Object.values(Connections.sockets[userId])) {
      conn.push(forceEmpty)
    }
  }

  static close(connection) {
    delete Connections.sockets[connection.userId][connection.id]
  }
}
