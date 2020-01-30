import request from 'request-promise-native'
import logger from './logger'

export default class Peers {
  static async broadcast(transaction, userId) {
    const notifications = []

    for (let i = 0; i < Peers.ipAddresses.length; i++) {
      const ipAddress = Peers.ipAddresses[i]

      // best effort notify all other peers of transaction
      const notify = async () => {
        try {
          await request({
            method: 'POST',
            uri: `http://${ipAddress}:9000/internal/notify-transaction`,
            body: {
              transaction,
              userId
            },
            json: true
          }).promise()

        } catch (e) {
          logger
            .child({ userId, databaseId: transaction['database-id'], ipAddress, error: e })
            .warn('Failed to notify db update')
        }
      }

      notifications.push(notify())
    }

    await Promise.all(notifications)
  }
}
