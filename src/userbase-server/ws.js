import connection from './connection'
import setup from './setup'
import uuidv4 from 'uuid/v4'
import db from './db'
import logger from './logger'
import { estimateSizeOfDdbItem } from './utils'
import statusCodes from './statusCodes'

const SECONDS_BEFORE_ROLLBACK_GAP_TRIGGERED = 1000 * 10 // 10s
const TRANSACTION_SIZE_BUNDLE_TRIGGER = 1024 * 50 // 50 KB

class Connection {
  constructor(userId, socket, clientId) {
    this.userId = userId
    this.socket = socket
    this.clientId = clientId
    this.id = uuidv4()
    this.databases = {}
    this.keyValidated = false
    this.requesterPublicKey = undefined
  }

  openDatabase(databaseId, bundleSeqNo) {
    this.databases[databaseId] = {
      bundleSeqNo: bundleSeqNo >= 0 ? bundleSeqNo : -1,
      lastSeqNo: 0,
      transactionLogSize: 0
    }
  }

  validateKey() {
    this.keyValidated = true
  }

  async push(databaseId, dbNameHash, dbKey) {
    const database = this.databases[databaseId]
    if (!database) return

    const payload = {
      route: 'ApplyTransactions',
      transactionLog: [],
      dbId: databaseId
    }

    const openingDatabase = dbNameHash && dbKey
    if (openingDatabase) {
      payload.dbNameHash = dbNameHash
      payload.dbKey = dbKey
    }

    const bundleSeqNo = database.bundleSeqNo
    if (bundleSeqNo >= 0 && database.lastSeqNo === 0) {
      const bundle = await db.getBundle(databaseId, bundleSeqNo)
      payload.bundeSeqNo = bundleSeqNo
      payload.bundle = bundle
      database.lastSeqNo = bundleSeqNo
    }

    let lastSeqNo = database.lastSeqNo

    // get transactions from the last sequence number
    const params = {
      TableName: setup.transactionsTableName,
      KeyConditionExpression: "#dbId = :dbId and #seqNo > :seqNo",
      ExpressionAttributeNames: {
        "#dbId": "database-id",
        "#seqNo": "sequence-no"
      },
      ExpressionAttributeValues: {
        ":dbId": databaseId,
        ":seqNo": lastSeqNo
      }
    }

    const transactionLog = []
    let size = 0
    try {
      const ddbClient = connection.ddbClient()
      let gapInSeqNo = false

      do {
        let transactionLogResponse = await ddbClient.query(params).promise()

        for (let i = 0; i < transactionLogResponse.Items.length && !gapInSeqNo; i++) {
          size += estimateSizeOfDdbItem(transactionLogResponse.Items[i])

          // if there's a gap in sequence numbers and past rollback buffer, rollback all transactions in gap
          gapInSeqNo = transactionLogResponse.Items[i]['sequence-no'] > lastSeqNo + 1
          const secondsSinceCreation = gapInSeqNo && new Date() - new Date(transactionLogResponse.Items[i]['creation-date'])

          if (gapInSeqNo && secondsSinceCreation > SECONDS_BEFORE_ROLLBACK_GAP_TRIGGERED) {
            await this.rollback(lastSeqNo, transactionLogResponse.Items[i]['sequence-no'], databaseId, ddbClient)
          } else if (gapInSeqNo) {
            // at this point must stop querying for more transactions
            continue
          }

          lastSeqNo = transactionLogResponse.Items[i]['sequence-no']

          // don't add rollback transactions to the result set
          if (transactionLogResponse.Items[i]['command'] === 'Rollback') {
            continue
          }

          // add transaction to the result set
          transactionLog.push({
            seqNo: transactionLogResponse.Items[i]['sequence-no'],
            command: transactionLogResponse.Items[i]['command'],
            key: transactionLogResponse.Items[i]['key'],
            record: transactionLogResponse.Items[i]['record'],
            operations: transactionLogResponse.Items[i]['operations'],
            dbId: transactionLogResponse.Items[i]['database-id']
          })
        }

        // paginate over all results
        params.ExclusiveStartKey = transactionLogResponse.LastEvaluatedKey
      } while (params.ExclusiveStartKey && !gapInSeqNo)

    } catch (e) {
      logger.warn(`Failed to push with ${e}`)
      throw new Error(e)
    }

    if (!transactionLog || transactionLog.length == 0) {
      openingDatabase && this.socket.send(JSON.stringify(payload))
      return
    }

    payload.transactionLog = transactionLog

    this.sendPayload(payload, database, size)
  }

  async rollback(lastSeqNo, thisSeqNo, databaseId, ddbClient) {
    for (let i = lastSeqNo + 1; i <= thisSeqNo - 1; i++) {
      const rollbackParams = {
        TableName: setup.transactionsTableName,
        Item: {
          'database-id': databaseId,
          'sequence-no': i,
          'command': 'Rollback',
          'creation-date': new Date().toISOString()
        },
        ConditionExpression: 'attribute_not_exists(#databaseId)',
        ExpressionAttributeNames: {
          '#databaseId': 'database-id'
        }
      }

      await ddbClient.put(rollbackParams).promise()
    }
  }

  sendPayload(payload, database, size) {
    const { transactionLog } = payload

    if (database.transactionLogSize + size >= TRANSACTION_SIZE_BUNDLE_TRIGGER) {
      this.socket.send(JSON.stringify({ ...payload, buildBundle: true }))
      database.transactionLogSize = 0
    } else {
      this.socket.send(JSON.stringify(payload))
      database.transactionLogSize += size
    }
    database.lastSeqNo = transactionLog[transactionLog.length - 1]['seqNo']
  }

  openSeedRequest(requesterPublicKey) {
    this.requesterPublicKey = requesterPublicKey
  }

  sendSeedRequest(requesterPublicKey) {
    if (!this.keyValidated) return

    const payload = {
      route: 'ReceiveRequestForSeed',
      requesterPublicKey
    }

    this.socket.send(JSON.stringify(payload))
  }

  sendSeed(senderPublicKey, requesterPublicKey, encryptedSeed) {
    if (this.requesterPublicKey !== requesterPublicKey) return

    const payload = {
      route: 'ReceiveSeed',
      encryptedSeed,
      senderPublicKey
    }

    this.socket.send(JSON.stringify(payload))
  }

  deleteSeedRequest() {
    delete this.requesterPublicKey
  }
}

export default class Connections {
  static register(userId, socket, clientId) {
    if (!Connections.sockets) Connections.sockets = {}
    if (!Connections.sockets[userId]) Connections.sockets[userId] = {}

    if (!Connections.uniqueClients) Connections.uniqueClients = {}
    if (!Connections.uniqueClients[clientId]) {
      Connections.uniqueClients[clientId] = true
    } else {
      logger.warn(`User ${userId} attempted to open multiple socket connections from client ${clientId}`)
      socket.close(statusCodes['Client Already Connected'])
      return false
    }

    const connection = new Connection(userId, socket, clientId)

    Connections.sockets[userId][connection.id] = connection
    logger.info(`Websocket ${connection.id} connected from user ${userId}`)

    return connection
  }

  static openDatabase(userId, connectionId, databaseId, bundleSeqNo, dbNameHash, dbKey) {
    if (!Connections.sockets || !Connections.sockets[userId] || !Connections.sockets[userId][connectionId]) return

    const conn = Connections.sockets[userId][connectionId]
    conn.openDatabase(databaseId, bundleSeqNo)
    logger.info(`Database ${databaseId} opened on connection ${connectionId}`)

    conn.push(databaseId, dbNameHash, dbKey)
    return true
  }

  static push(transaction, userId) {
    if (!Connections.sockets || !Connections.sockets[userId]) return

    for (const conn of Object.values(Connections.sockets[userId])) {
      const database = conn.databases[transaction['database-id']]

      // don't need to requery DDB if sending transaction with the next sequence no
      if (database && transaction['sequence-no'] === database.lastSeqNo + 1) {
        const payload = {
          route: 'ApplyTransactions',
          transactionLog: [{
            seqNo: transaction['sequence-no'],
            command: transaction['command'],
            key: transaction['key'],
            record: transaction['record'],
            operations: transaction['operations'],
            dbId: transaction['database-id']
          }],
          dbId: transaction['database-id']
        }

        conn.sendPayload(payload, database, estimateSizeOfDdbItem(transaction))
      } else {
        conn.push(transaction['database-id'])
      }
    }
  }

  static sendSeedRequest(userId, connectionId, requesterPublicKey) {
    if (!Connections.sockets || !Connections.sockets[userId] || !Connections.sockets[userId][connectionId]) return

    const conn = Connections.sockets[userId][connectionId]
    conn.openSeedRequest(requesterPublicKey)

    for (const connection of Object.values(Connections.sockets[userId])) {
      connection.sendSeedRequest(requesterPublicKey)
    }
  }

  static sendSeed(userId, senderPublicKey, requesterPublicKey, encryptedSeed) {
    if (!Connections.sockets || !Connections.sockets[userId]) return

    for (const conn of Object.values(Connections.sockets[userId])) {
      conn.sendSeed(senderPublicKey, requesterPublicKey, encryptedSeed)
    }
  }

  static close(connection) {
    delete Connections.sockets[connection.userId][connection.id]
    delete Connections.uniqueClients[connection.clientId]
  }
}
