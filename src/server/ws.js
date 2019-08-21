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
      bundleSeqNo: bundleSeqNo ? bundleSeqNo : -1,
      lastSeqNo: -1,
      transactionLogSize: 0
    }
  }

  async initTransactions(databaseId) {
    const database = this.databases[databaseId]
    if (!database) return

    if (database.bundleSeqNo >= 0 && database.lastSeqNo < 0) {
      const bundle = await db.getBundle(this.userId, databaseId, database.bundleSeqNo)
      this.socket.send(JSON.stringify({ bundle, dbId: databaseId, seqNo: database.bundleSeqNo, route: 'ApplyBundle' }))
      database.lastSeqNo = database.bundleSeqNo
    }

    const transactions = memcache.getTransactions(databaseId, database.lastSeqNo, false)
    const transactionLog = transactions.log

    if (!transactionLog || transactionLog.length == 0) {
      return this.socket.send(JSON.stringify({ transactionLog, dbId: databaseId, route: 'ApplyTransactions' }))
    }

    this.finishPushingTransactions(database, transactionLog, transactions.size, databaseId)
  }

  push(databaseId) {
    const database = this.databases[databaseId]
    if (!database) return

    const transactions = memcache.getTransactions(databaseId, database.lastSeqNo, false)
    const transactionLog = transactions.log

    if (!transactionLog || transactionLog.length == 0) return

    this.finishPushingTransactions(database, transactionLog, transactions.size, databaseId)
  }

  finishPushingTransactions(database, transactionLog, size, databaseId) {
    this.socket.send(JSON.stringify({ transactionLog, dbId: databaseId, route: 'ApplyTransactions' }))

    database.lastSeqNo = transactionLog[transactionLog.length - 1]['seqNo']
    database.transactionLogSize += size

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
    console.log(userId, connectionId, databaseId, bundleSeqNo)

    if (!Connections.sockets || !Connections.sockets[userId] || !Connections.sockets[userId][connectionId]) return

    Connections.sockets[userId][connectionId].openDatabase(databaseId, bundleSeqNo)
    logger.info(`Database ${databaseId} opened by user ${userId}`)
  }

  static initTransactions(userId, connectionId, databaseId) {
    if (!Connections.sockets || !Connections.sockets[userId] || !Connections.sockets[userId][connectionId]) return

    Connections.sockets[userId][connectionId].initTransactions(databaseId)
  }

  static push(databaseId, userId) {
    if (!Connections.sockets || !Connections.sockets[userId] || !Connections.sockets[userId]) return

    for (const conn of Object.values(Connections.sockets[userId])) {
      conn.push(databaseId)
    }
  }

  static close(connection) {
    delete Connections.sockets[connection.userId][connection.id]
  }
}
