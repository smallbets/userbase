import path from 'path'
import expressLogger from 'express-pino-logger'
import WebSocket from 'ws'
import http from 'http'
import https from 'https'

import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import logger from './logger'
import setup from './setup'
import admin from './admin'
import user from './user'
import db from './db'
import connections from './ws'
import statusCodes from './statusCodes'
import responseBuilder from './responseBuilder'

const adminPanelDir = '/admin-panel/dist'

const ONE_KB = 1024

// DynamoDB single item limit: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Limits.html#limits-items
const FOUR_HUNDRED_KB = 400 * ONE_KB

if (process.env.NODE_ENV == 'development') {
  logger.warn('Development Mode')
}

async function start(express, app, userbaseConfig = {}) {
  try {
    const {
      httpsKey,
      httpsCert
    } = userbaseConfig

    await setup.init(userbaseConfig)

    const certExists = httpsKey && httpsCert
    const httpPort = userbaseConfig.httpPort || 8080
    const httpsPort = userbaseConfig.httpsPort || 8443

    const server = certExists ?
      https.createServer({ key: httpsKey, cert: httpsCert }, app)
        .listen(httpsPort, () => logger.info(`App listening on https port ${httpsPort}....`)) :
      http.createServer(app)
        .listen(httpPort, () => logger.info(`App listening on http port ${httpPort}....`))

    const wss = new WebSocket.Server({ noServer: true })

    server.on('upgrade', (req, socket, head) => {
      const res = new http.ServerResponse(req)
      res.assignSocket(socket)
      res.on('finish', () => res.socket.destroy())
      req.ws = true
      res.ws = fn => wss.handleUpgrade(req, socket, head, fn)
      app(req, res)
    })

    const heartbeat = function (ws) {
      ws.isAlive = true
    }

    wss.on('connection', (ws, req, res) => {
      ws.isAlive = true

      const userId = res.locals.user['user-id']
      const username = res.locals.user['username']
      const userPublicKey = res.locals.user['public-key']

      const conn = connections.register(userId, ws)
      const connectionId = conn.id

      const salts = {
        encryptionKeySalt: res.locals.user['encryption-key-salt'],
        dhKeySalt: res.locals.user['diffie-hellman-key-salt'],
        hmacKeySalt: res.locals.user['hmac-key-salt']
      }

      const { validationMessage, encryptedValidationMessage } = user.getValidationMessage(userPublicKey)

      ws.send(JSON.stringify({
        route: 'Connection',
        salts,
        encryptedValidationMessage
      }))

      ws.on('close', () => connections.close(conn))

      ws.on('message', async (msg) => {
        ws.isAlive = true

        try {
          if (msg.length > FOUR_HUNDRED_KB || msg.byteLength > FOUR_HUNDRED_KB) return ws.send('Message is too large')

          const request = JSON.parse(msg)

          const requestId = request.requestId
          const action = request.action
          const params = request.params

          let response

          if (action === 'Pong') {
            heartbeat(ws)
            return
          } else if (action === 'SignOut') {
            response = await user.signOut(params.sessionId)
          } else if (!conn.keyValidated) {

            switch (action) {
              case 'ValidateKey': {
                response = await user.validateKey(
                  validationMessage,
                  params.validationMessage,
                  res.locals.user,
                  conn
                )
                break
              }
              case 'RequestSeed': {
                response = await user.requestSeed(
                  userId,
                  userPublicKey,
                  connectionId,
                  params.requesterPublicKey
                )
                break
              }
              default: {
                response = responseBuilder.errorResponse(statusCodes['Unauthorized'], 'Key not validated')
              }
            }

          } else {

            switch (action) {
              case 'ValidateKey':
              case 'RequestSeed': {
                response = responseBuilder.errorResponse(statusCodes['Bad Request'], 'Already validated key')
                break
              }
              case 'UpdateUser': {
                response = await user.updateUser(
                  userId,
                  params.username,
                  params.passwordSecureHash,
                  params.email,
                  params.profile,
                  params.pbkdfKeySalt,
                  params.passwordEncryptedSeed
                )
                break
              }
              case 'DeleteUser': {
                response = await user.deleteUser(userId)
                break
              }
              case 'OpenDatabase': {
                response = await db.openDatabase(
                  userId,
                  connectionId,
                  params.dbNameHash,
                  params.newDatabaseParams
                )
                break
              }
              case 'Insert':
              case 'Update':
              case 'Delete': {
                response = await db.doCommand(
                  action,
                  userId,
                  params.dbNameHash,
                  params.dbId,
                  params.itemKey,
                  params.encryptedItem
                )
                break
              }
              case 'BatchTransaction': {
                response = await db.batchTransaction(userId, params.dbNameHash, params.dbId, params.operations)
                break
              }
              case 'Bundle': {
                response = await db.bundleTransactionLog(params.dbId, params.seqNo, params.bundle)
                break
              }
              case 'GetRequestsForSeed': {
                response = await user.querySeedRequests(userId)
                break
              }
              case 'SendSeed': {
                response = await user.sendSeed(
                  userId,
                  userPublicKey,
                  params.requesterPublicKey,
                  params.encryptedSeed
                )
                break
              }
              default: {
                return ws.send(`Received unkown action ${action}`)
              }
            }
          }

          ws.send(JSON.stringify({
            requestId,
            response,
            route: action
          }))

        } catch (e) {
          logger.error(`Error ${e.name}: ${e.message} in Websocket handling the following message from user ${userId}: ${msg}`)
        }

      })
    })

    setInterval(function ping() {
      wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate()

        ws.isAlive = false
        ws.send(JSON.stringify({ route: 'Ping' }))
      })
    }, 30000)

    app.use(expressLogger({ logger }))
    app.use(bodyParser.json())
    app.use(cookieParser())

    app.get('/api', user.authenticateUser, (req, res) =>
      req.ws
        ? res.ws(socket => wss.emit('connection', socket, req, res))
        : res.send('Not a websocket!')
    )

    app.post('/api/auth/sign-up', user.signUp)
    app.post('/api/auth/sign-in', user.signIn)
    app.post('/api/auth/sign-in-with-session', user.authenticateUser, user.extendSession)
    app.get('/api/auth/server-public-key', user.getServerPublicKey)
    app.post('/api/auth/forgot-password', user.forgotPassword)

    app.use('/admin', express.static(path.join(__dirname + adminPanelDir)))

    app.post('/admin/create-admin', admin.createAdminController)
    app.post('/admin/create-app', admin.authenticateAdmin, admin.createAppController)
    app.post('/admin/sign-in', admin.signInAdmin)
    app.post('/admin/sign-out', admin.authenticateAdmin, admin.signOutAdmin)
    app.post('/admin/list-apps', admin.authenticateAdmin, admin.listApps)
    app.post('/admin/list-app-users', admin.authenticateAdmin, admin.listAppUsers)

    app.get('/ping', function (req, res) {
      res.send('Healthy')
    })

  } catch (e) {
    logger.info(`Unhandled error while launching server: ${e}`)
  }
}

function createAdmin(adminName, password, adminId, storePasswordInSecretsManager = false) {
  return admin.createAdmin(adminName, password, adminId, storePasswordInSecretsManager)
}

function createApp(appName, adminId, appId) {
  return admin.createApp(appName, adminId, appId)
}

export default {
  start,
  createAdmin,
  createApp
}
