import uuidv4 from 'uuid/v4'
import memcache from './memcache'
import db from './db'
import logger from './logger'

const TRANSACTION_SIZE_BUNDLE_TRIGGER = 1024 * 50 // 50 KB

class Connection {
  constructor(userId, bundleSeqNo, socket) {
    this.userId = userId
    this.socket = socket
    this.bundleSeqNo = bundleSeqNo ? bundleSeqNo : -1
    this.lastSeqNo = -1
    this.id = uuidv4()
    this.transactionLogSize = 0
  }

  async push(forceEmpty) {
    if (this.bundleSeqNo >= 0 && this.lastSeqNo < 0) {
      const bundle = await db.getBundle(this.userId, this.bundleSeqNo)
      this.socket.send(JSON.stringify({ bundle, seqNo: this.bundleSeqNo, route: 'ApplyBundle' }))
      this.lastSeqNo = this.bundleSeqNo
    }

    const transactions = memcache.getTransactions(this.userId, this.lastSeqNo, false)
    const transactionLog = transactions.log

    if (!transactionLog || transactionLog.length == 0) {
      forceEmpty && this.socket.send(JSON.stringify({ transactionLog, route: 'ApplyTransactions' }))
      return
    }

    this.socket.send(JSON.stringify({ transactionLog, route: 'ApplyTransactions' }))
    this.lastSeqNo = transactionLog[transactionLog.length - 1]['seqNo']
    this.transactionLogSize += transactions.size

    if (this.transactionLogSize >= TRANSACTION_SIZE_BUNDLE_TRIGGER) {
      this.socket.send(JSON.stringify({ route: 'BuildBundle' }))
      this.transactionLogSize = 0
    }
  }
}

export default class Connections {
  static register(userId, bundleSeqNo, socket) {
    if (!Connections.sockets) Connections.sockets = {}
    if (!Connections.sockets[userId]) Connections.sockets[userId] = {}

    const connection = new Connection(userId, bundleSeqNo, socket)

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
