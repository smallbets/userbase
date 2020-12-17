import request from 'request-promise-native'
import logger from './logger'

export default class Peers {
  static buildNotifications(notify) {
    const notifications = []

    for (let i = 0; i < Peers.ipAddresses.length; i++) {
      const ipAddress = Peers.ipAddresses[i]
      notifications.push(notify(ipAddress))
    }

    return notifications
  }

  static async broadcastTransaction(transaction, userId, connectionId) {
    // best effort notify all other peers of transaction
    const notify = async (ipAddress) => {
      try {
        await request({
          method: 'POST',
          uri: `http://${ipAddress}:9000/internal/notify-transaction`,
          body: {
            transaction,
            userId,
            connectionId,
          },
          json: true
        }).promise()

      } catch (e) {
        logger
          .child({ databaseId: transaction['database-id'], userId, connectionId, ipAddress, err: e })
          .warn('Failed to notify db update')
      }
    }

    await Promise.all(this.buildNotifications(notify))
  }

  static async broadcastUpdatedUser(updatedUser) {
    // best effort notify all other peers of updated user
    const notify = async (ipAddress) => {
      try {
        await request({
          method: 'POST',
          uri: `http://${ipAddress}:9000/internal/notify-updated-user`,
          body: {
            updatedUser
          },
          json: true
        }).promise()

      } catch (e) {
        logger
          .child({ userId: updatedUser.userId, ipAddress, err: e })
          .warn('Failed to notify user update')
      }
    }

    await Promise.all(this.buildNotifications(notify))
  }
}
