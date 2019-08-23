import uuidv4 from 'uuid/v4'
import memcache from './memcache'
import db from './db'
import logger from './logger'

const TRANSACTION_SIZE_BUNDLE_TRIGGER = 1024 * 50 // 50 KB

class Connection {
  constructor(userId, socket) {
    this.userId = userId
    this.socket = socket
    this.id = uuidv4()
    this.databases = {}
  }

  openDatabase(databaseId, bundleSeqNo) {
    this.databases[databaseId] = {
      bundleSeqNo: bundleSeqNo >= 0 ? bundleSeqNo : -1,
      lastSeqNo: -1,
      transactionLogSize: 0
    }
  }

  async push(databaseId, forceEmpty) {
    const database = this.databases[databaseId]
    if (!database) return

    const payload = {
      route: 'ApplyTransactions',
      transactionLog: [],
      dbId: databaseId
    }

    const bundleSeqNo = database.bundleSeqNo
    if (bundleSeqNo >= 0 && database.lastSeqNo < 0) {
      const bundle = await db.getBundle(databaseId, bundleSeqNo)
      payload.bundeSeqNo = bundleSeqNo
      payload.bundle = bundle
      database.lastSeqNo = bundleSeqNo
    }

    const transactions = memcache.getTransactions(databaseId, database.lastSeqNo, false)
    const transactionLog = transactions.log

    if (!transactionLog || transactionLog.length == 0) {
      forceEmpty && this.socket.send(JSON.stringify(payload))
      return
    }

    payload.transactionLog = transactionLog

    this.socket.send(JSON.stringify(payload))

    database.lastSeqNo = transactionLog[transactionLog.length - 1]['seqNo']
    database.transactionLogSize += transactions.size

    if (database.transactionLogSize >= TRANSACTION_SIZE_BUNDLE_TRIGGER) {
      this.socket.send(JSON.stringify({ dbId: databaseId, route: 'BuildBundle' }))
      database.transactionLogSize = 0
    }
  }
}

export default class Connections {
  static register(userId, socket) {
    if (!Connections.sockets) Connections.sockets = {}
    if (!Connections.sockets[userId]) Connections.sockets[userId] = {}

    const connection = new Connection(userId, socket)

    Connections.sockets[userId][connection.id] = connection
    logger.info(`Websocket ${connection.id} connected from user ${userId}`)

    return connection
  }

  static openDatabase(userId, connectionId, databaseId, bundleSeqNo) {
    if (!Connections.sockets || !Connections.sockets[userId] || !Connections.sockets[userId][connectionId]) return

    Connections.sockets[userId][connectionId].openDatabase(databaseId, bundleSeqNo)
    logger.info(`Database ${databaseId} opened by user ${userId}`)

    const forceEmpty = true
    this.push(databaseId, userId, forceEmpty)
    return true
  }

  static push(databaseId, userId, forceEmpty = false) {
    if (!Connections.sockets || !Connections.sockets[userId] || !Connections.sockets[userId]) return

    for (const conn of Object.values(Connections.sockets[userId])) {
      conn.push(databaseId, forceEmpty)
    }
  }

  static close(connection) {
    delete Connections.sockets[connection.userId][connection.id]
  }
}
