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
  constructor(userId, socket, clientId, adminId) {
    this.userId = userId
    this.socket = socket
    this.clientId = clientId
    this.id = uuidv4()
    this.adminId = adminId
    this.databases = {}
    this.keyValidated = false
  }

  openDatabase(databaseId, bundleSeqNo, reopenAtSeqNo) {
    this.databases[databaseId] = {
      bundleSeqNo: bundleSeqNo > 0 ? bundleSeqNo : -1,
      lastSeqNo: reopenAtSeqNo || 0,
      transactionLogSize: 0,
      init: reopenAtSeqNo !== undefined // ensures server sends the dbNameHash & key on first ever push, not reopen
    }
  }

  validateKey() {
    this.keyValidated = true
  }

  async push(databaseId, dbNameHash, dbKey, reopenAtSeqNo) {
    const database = this.databases[databaseId]
    if (!database) return

    const payload = {
      route: 'ApplyTransactions',
      transactionLog: [],
      dbId: databaseId
    }

    const reopeningDatabase = reopenAtSeqNo !== undefined

    const openingDatabase = dbNameHash && dbKey && !reopeningDatabase
    if (openingDatabase) {
      payload.dbNameHash = dbNameHash
      payload.dbKey = dbKey
    }

    let lastSeqNo = database.lastSeqNo
    const bundleSeqNo = database.bundleSeqNo

    if (bundleSeqNo > 0 && database.lastSeqNo === 0) {
      const bundle = await db.getBundle(databaseId, bundleSeqNo)
      payload.bundleSeqNo = bundleSeqNo
      payload.bundle = bundle
      lastSeqNo = bundleSeqNo
    }

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

    const ddbTransactionLog = []
    try {
      const ddbClient = connection.ddbClient()
      let gapInSeqNo = false

      do {
        let transactionLogResponse = await ddbClient.query(params).promise()

        for (let i = 0; i < transactionLogResponse.Items.length && !gapInSeqNo; i++) {

          // if there's a gap in sequence numbers and past rollback buffer, rollback all transactions in gap
          gapInSeqNo = transactionLogResponse.Items[i]['sequence-no'] > lastSeqNo + 1
          const secondsSinceCreation = gapInSeqNo && new Date() - new Date(transactionLogResponse.Items[i]['creation-date'])

          // waiting gives opportunity for item to insert into DDB
          if (gapInSeqNo && secondsSinceCreation > SECONDS_BEFORE_ROLLBACK_GAP_TRIGGERED) {
            const rolledBackTransactions = await this.rollback(lastSeqNo, transactionLogResponse.Items[i]['sequence-no'], databaseId, ddbClient)

            for (let j = 0; j < rolledBackTransactions.length; j++) {

              // add transaction to the result set if have not sent it to client yet
              if (rolledBackTransactions[j]['sequence-no'] > database.lastSeqNo) {
                ddbTransactionLog.push(rolledBackTransactions[j])
              }

            }
          } else if (gapInSeqNo) {
            // at this point must stop querying for more transactions
            continue
          }

          lastSeqNo = transactionLogResponse.Items[i]['sequence-no']

          // add transaction to the result set if have not sent it to client yet
          if (transactionLogResponse.Items[i]['sequence-no'] > database.lastSeqNo) {
            ddbTransactionLog.push(transactionLogResponse.Items[i])
          }

        }

        // paginate over all results
        params.ExclusiveStartKey = transactionLogResponse.LastEvaluatedKey
      } while (params.ExclusiveStartKey && !gapInSeqNo)

    } catch (e) {
      logger.warn(`Failed to push to ${databaseId} with ${e}`)
      throw new Error(e)
    }

    if (openingDatabase && database.lastSeqNo !== 0) {
      logger
        .child({ databaseId, connectionId: this.id })
        .warn('When opening database, must send client entire transaction log from tip')
      return
    }

    if (reopeningDatabase && database.lastSeqNo !== reopenAtSeqNo) {
      logger
        .child({ databaseId, connectionId: this.id })
        .warn('When reopening database, must send client entire transaction log from requested seq no')
      return
    }

    if (!openingDatabase && !database.init) {
      logger
        .child({ databaseId, connectionId: this.id })
        .warn('Must finish opening database before sending transactions to client')
      return
    }

    if (!ddbTransactionLog || ddbTransactionLog.length == 0) {
      if (openingDatabase || reopeningDatabase) {
        const msg = JSON.stringify(payload)
        this.socket.send(msg)

        if (payload.bundle) {
          database.lastSeqNo = payload.bundleSeqNo
        }

        database.init = true

        logger
          .child({
            wsRes: {
              connectionId: this.id,
              userId: this.userId,
              adminId: this.adminId,
              databaseId: payload.dbId,
              route: payload.route,
              size: msg.length,
              bundleSeqNo: payload.bundleSeqNo,
              seqNo: database.lastSeqNo
            }
          })
          .info('Sent initial transactions to client')
      }
      return
    }

    this.sendPayload(payload, ddbTransactionLog, database)
  }

  async rollback(lastSeqNo, thisSeqNo, databaseId, ddbClient) {
    const rolledBackTransactions = []

    for (let i = lastSeqNo + 1; i <= thisSeqNo - 1; i++) {
      const rolledbBackItem = {
        'database-id': databaseId,
        'sequence-no': i,
        'command': 'Rollback',
        'creation-date': new Date().toISOString()
      }

      const rollbackParams = {
        TableName: setup.transactionsTableName,
        Item: rolledbBackItem,
        ConditionExpression: 'attribute_not_exists(#databaseId)',
        ExpressionAttributeNames: {
          '#databaseId': 'database-id'
        }
      }

      await ddbClient.put(rollbackParams).promise()

      rolledBackTransactions.push(rolledbBackItem)
    }

    return rolledBackTransactions
  }

  sendPayload(payload, ddbTransactionLog, database) {
    let size = 0

    // only send transactions that have not been sent to client yet
    const indexOfFirstTransactionToSend = ddbTransactionLog.findIndex(transaction => {

      // check database.lastSeqNo bc could have been overwitten while DDB was paginating
      return transaction['sequence-no'] > database.lastSeqNo
    })

    if (indexOfFirstTransactionToSend === -1) return

    const transactionLog = ddbTransactionLog
      .slice(indexOfFirstTransactionToSend)
      .map(transaction => {
        size += estimateSizeOfDdbItem(transaction)

        return {
          seqNo: transaction['sequence-no'],
          command: transaction['command'],
          key: transaction['key'],
          record: transaction['record'],
          operations: transaction['operations'],
          dbId: transaction['database-id']
        }
      })

    if (transactionLog.length === 0) return

    // only send the payload if tx log starts with the next seqNo client is supposed to receive
    const startSeqNo = transactionLog[0]['seqNo']
    if (startSeqNo !== database.lastSeqNo + 1
      && startSeqNo !== payload.bundleSeqNo + 1) return

    let msg
    const buildBundle = database.transactionLogSize + size >= TRANSACTION_SIZE_BUNDLE_TRIGGER
    if (buildBundle) {
      msg = JSON.stringify({ ...payload, transactionLog, buildBundle: true })
      this.socket.send(msg)
      database.transactionLogSize = 0
    } else {
      msg = JSON.stringify({ ...payload, transactionLog })
      this.socket.send(msg)
      database.transactionLogSize += size
    }

    // database.lastSeqNo should be strictly increasing
    const endSeqNo = transactionLog[transactionLog.length - 1]['seqNo']
    database.lastSeqNo = endSeqNo
    database.init = true

    logger
      .child({
        wsRes: {
          connectionId: this.id,
          userId: this.userId,
          adminId: this.adminId,
          databaseId: payload.dbId,
          route: payload.route,
          size: msg.length,
          bundleSeqNo: payload.bundleSeqNo,
          transactionLogSize: database.transactionLogSize,
          buildBundle,
          startSeqNo,
          endSeqNo
        }
      })
      .info('Sent transactions to client')
  }
}

export default class Connections {
  static register(userId, socket, clientId, adminId) {
    if (!Connections.sockets) Connections.sockets = {}
    if (!Connections.sockets[userId]) Connections.sockets[userId] = {}

    if (!Connections.uniqueClients) Connections.uniqueClients = {}
    if (!Connections.uniqueClients[clientId]) {
      Connections.uniqueClients[clientId] = true
    } else {
      logger.child({ userId, clientId, adminId }).warn('User attempted to open multiple socket connections from client')
      socket.close(statusCodes['Client Already Connected'])
      return false
    }

    const connection = new Connection(userId, socket, clientId, adminId)

    Connections.sockets[userId][connection.id] = connection
    logger.child({ connectionId: connection.id, userId, clientId, adminId }).info('WebSocket connected')

    return connection
  }

  static openDatabase(userId, connectionId, databaseId, bundleSeqNo, dbNameHash, dbKey, reopenAtSeqNo) {
    if (!Connections.sockets || !Connections.sockets[userId] || !Connections.sockets[userId][connectionId]) return

    const conn = Connections.sockets[userId][connectionId]

    if (!conn.databases[databaseId]) {
      conn.openDatabase(databaseId, bundleSeqNo, reopenAtSeqNo)
      logger.child({ connectionId, databaseId, adminId: conn.adminId }).info('Database opened')
    }

    conn.push(databaseId, dbNameHash, dbKey, reopenAtSeqNo)

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
          dbId: transaction['database-id']
        }

        conn.sendPayload(payload, [transaction], database)
      } else {
        conn.push(transaction['database-id'])
      }
    }
  }

  static close(connection) {
    const { userId, id, clientId, adminId } = connection
    const connectionId = id

    logger.child({ userId, connectionId, clientId, adminId }).info('WebSocket closing')
    delete Connections.sockets[userId][connectionId]
    delete Connections.uniqueClients[clientId]
  }
}
