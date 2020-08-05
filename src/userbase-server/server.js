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
import userController from './user'
import db from './db'
import appController from './app'
import connections from './ws'
import statusCodes from './statusCodes'
import responseBuilder from './responseBuilder'
import { trimReq } from './utils'
import stripe from './stripe'

const adminPanelDir = '/admin-panel/dist'

const ONE_KB = 1024

// DynamoDB single item limit: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Limits.html#limits-items
const FOUR_HUNDRED_KB = 400 * ONE_KB

const FIVE_KB = 5 * ONE_KB

const HSTS_MAX_AGE = 63072000 // 2 years

if (process.env.NODE_ENV == 'development') {
  logger.warn('Development Mode')
}

async function start(express, app, userbaseConfig = {}) {
  try {
    const {
      httpsKey,
      httpsCert,
      stripeRedirectUrl
    } = userbaseConfig

    if (stripeRedirectUrl) process.env['STRIPE_REDIRECT_URL'] = stripeRedirectUrl

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
      const adminId = res.locals.admin['admin-id']
      const appId = res.locals.app['app-id']

      const clientId = req.query.clientId

      const conn = connections.register(userId, ws, clientId, adminId, appId)
      if (conn) {
        const connectionId = conn.id

        const connectionLogObject = { userId, connectionId, adminId, appId, route: 'Connection' }
        const validationMessage = userController.sendConnection(connectionLogObject, ws, res.locals.user)

        ws.on('close', () => connections.close(conn))

        ws.on('message', async (msg) => {
          ws.isAlive = true

          const start = Date.now()
          let logChildObject

          try {
            logChildObject = { userId, connectionId, adminId, clientId, appId, size: msg.length || msg.byteLength }

            if (msg.length > FOUR_HUNDRED_KB || msg.byteLength > FOUR_HUNDRED_KB) {
              logger.child(logChildObject).warn('Received large message')
              return ws.send('Message is too large')
            }

            const request = JSON.parse(msg)

            const requestId = request.requestId
            const action = request.action
            const params = request.params || {}

            let response

            if (action === 'Pong') {
              heartbeat(ws)
              return
            }

            logChildObject.requestId = requestId
            logChildObject.action = action
            logger.child(logChildObject).info('Received WebSocket request')

            if (conn.rateLimiter.atCapacity()) {

              response = responseBuilder.errorResponse(statusCodes['Too Many Requests'], { retryDelay: 1000 })

            } else {

              if (action === 'SignOut') {
                response = await userController.signOut(params.sessionId)
              } else if (!conn.keyValidated) {

                switch (action) {
                  case 'ValidateKey': {
                    response = await userController.validateKey(
                      validationMessage,
                      params.validationMessage,
                      conn,
                      res.locals.admin,
                      res.locals.app,
                      res.locals.user,
                      params.ecKeyData,
                    )
                    break
                  }
                  default: {
                    response = responseBuilder.errorResponse(statusCodes['Unauthorized'], 'Key not validated')
                  }
                }

              } else {

                switch (action) {
                  case 'ValidateKey': {
                    response = responseBuilder.errorResponse(statusCodes['Bad Request'], 'Already validated key')
                    break
                  }
                  case 'UpdateUser': {
                    response = await userController.updateUser(
                      connectionId,
                      adminId,
                      userId,
                      params.username,
                      params.currentPasswordToken,
                      params.passwordToken,
                      params.passwordSalts,
                      params.email,
                      params.profile,
                      params.passwordBasedBackup
                    )
                    break
                  }
                  case 'DeleteUser': {
                    response = await userController.deleteUserController(
                      userId,
                      adminId,
                      res.locals.app['app-name'],
                      res.locals.admin['stripe-account-id']
                    )
                    break
                  }
                  case 'OpenDatabase': {
                    response = await db.openDatabase(
                      res.locals.user,
                      res.locals.app,
                      res.locals.admin,
                      connectionId,
                      params.dbNameHash,
                      params.newDatabaseParams,
                      params.reopenAtSeqNo
                    )
                    break
                  }
                  case 'OpenDatabaseByDatabaseId': {
                    response = await db.openDatabaseByDatabaseId(
                      res.locals.user,
                      res.locals.app,
                      res.locals.admin,
                      connectionId,
                      params.databaseId,
                      params.reopenAtSeqNo
                    )
                    break
                  }
                  case 'GetDatabases': {
                    response = await db.getDatabases(logChildObject, res.locals.user['user-id'], params.nextPageToken)
                    break
                  }
                  case 'GetDatabaseUsers': {
                    response = await db.getDatabaseUsers(
                      logChildObject,
                      res.locals.user['user-id'],
                      params.databaseId,
                      params.databaseNameHash,
                      params.nextPageTokenLessThanUserId,
                      params.nextPageTokenMoreThanUserId,
                    )
                    break
                  }
                  case 'GetUserDatabaseByDatabaseNameHash': {
                    response = await db.getUserDatabaseByDbNameHash(
                      logChildObject,
                      res.locals.user['user-id'],
                      params.dbNameHash,
                    )
                    break
                  }
                  case 'GetUserDatabaseByDatabaseId': {
                    response = await db.getUserDatabaseByDatabaseId(
                      logChildObject,
                      res.locals.user['user-id'],
                      params.databaseId,
                    )
                    break
                  }
                  case 'Insert':
                  case 'Update':
                  case 'Delete': {
                    response = await db.doCommand(
                      action,
                      userId,
                      connectionId,
                      params.dbNameHash,
                      params.dbId,
                      params.itemKey,
                      params.encryptedItem
                    )
                    break
                  }
                  case 'BatchTransaction': {
                    response = await db.batchTransaction(userId, connectionId, params.dbNameHash, params.dbId, params.operations)
                    break
                  }
                  case 'Bundle': {
                    response = await db.bundleTransactionLog(userId, connectionId, params.dbId, params.seqNo, params.bundle)
                    break
                  }
                  case 'GetPasswordSalts': {
                    response = await userController.getPasswordSaltsByUserId(userId)
                    break
                  }
                  case 'PurchaseSubscription': {
                    response = await userController.createSubscriptionPaymentSession(
                      logChildObject,
                      res.locals.app,
                      res.locals.admin,
                      res.locals.user,
                      params.successUrl,
                      params.cancelUrl
                    )
                    break
                  }
                  case 'CancelSubscription': {
                    response = await userController.cancelSubscription(
                      logChildObject,
                      res.locals.app,
                      res.locals.admin,
                      res.locals.user
                    )
                    break
                  }
                  case 'ResumeSubscription': {
                    response = await userController.resumeSubscription(
                      logChildObject,
                      res.locals.app,
                      res.locals.admin,
                      res.locals.user
                    )
                    break
                  }
                  case 'UpdatePaymentMethod': {
                    response = await userController.updatePaymentMethod(
                      logChildObject,
                      res.locals.app,
                      res.locals.admin,
                      res.locals.user,
                      params.successUrl,
                      params.cancelUrl
                    )
                    break
                  }
                  case 'ShareDatabase': {
                    response = await db.shareDatabase(
                      logChildObject,
                      res.locals.user,
                      params.databaseId,
                      params.databaseNameHash,
                      params.username,
                      params.readOnly,
                      params.resharingAllowed,
                      params.sharedEncryptedDbKey, // userbase-js >= v2.0.1
                      params.wrappedDbKey,         // userbase-js  = v2.0.0
                      params.ephemeralPublicKey,
                      params.signedEphemeralPublicKey,
                      params.sentSignature,
                      params.recipientEcdsaPublicKey,
                    )
                    break
                  }
                  case 'SaveDatabase': {
                    response = await db.saveDatabase(
                      logChildObject,
                      res.locals.user,
                      params.databaseNameHash,
                      params.encryptedDbKey,
                      params.receivedSignature,
                    )
                    break
                  }
                  case 'ModifyDatabasePermissions': {
                    response = await db.modifyDatabasePermissions(
                      logChildObject,
                      res.locals.user,
                      params.databaseId,
                      params.databaseNameHash,
                      params.username,
                      params.readOnly,
                      params.resharingAllowed,
                      params.revoke,
                    )
                    break
                  }
                  case 'VerifyUser': {
                    response = await db.verifyUser(
                      logChildObject,
                      res.locals.user['user-id'],
                      params.verifiedUsername,
                      params.ecdsaPublicKeyString,
                      params.signedVerificationMessage,
                    )
                    break
                  }
                  default: {
                    logger
                      .child(logChildObject)
                      .error('Received unknown action over WebSocket')
                    return ws.send(`Received unkown action ${action}`)
                  }
                }
              }
            }

            const responseMsg = JSON.stringify({
              requestId,
              response,
              route: action
            })

            logger
              .child({
                ...logChildObject,
                statusCode: response.status,
                size: responseMsg.length,
                responseTime: Date.now() - start,
              })
              .info('Sent response over WebSocket')

            ws.send(responseMsg)

          } catch (e) {
            logger
              .child({ ...logChildObject, err: e, msg })
              .error('Error in Websocket handling message')
          }

        })
      }
    })

    // client first must prove it has access to the user's key by decrypting encryptedFrgotPasswordToken,
    // then can proceed to request email with temp password be sent to user
    wss.on('forgot-password', async (ws, req) => {
      ws.isAlive = true // only gets set once. websocket will terminate automatically in 30-60s
      const start = Date.now()

      const appId = req.query.appId
      const username = req.query.username

      const logChildObject = { appId, username, req: trimReq(req) }
      logger.child(logChildObject).info('Opened forgot-password WebSocket')

      const forgotPasswordTokenResult = await userController.generateForgotPasswordToken(logChildObject, appId, username)

      if (forgotPasswordTokenResult.status !== statusCodes['Success']) {

        ws.send(JSON.stringify({
          route: 'Error',
          status: forgotPasswordTokenResult.status,
          data: forgotPasswordTokenResult.data
        }))
        ws.terminate()

      } else {

        const {
          user,
          app,
          forgotPasswordToken,
          encryptedForgotPasswordToken
        } = forgotPasswordTokenResult.data

        if (user['ecdsa-public-key']) {
          ws.send(JSON.stringify({
            route: 'ReceiveToken',
            ecdsaKeyEncryptionKeySalt: user['ecdsa-key-encryption-key-salt'],
            encryptedEcdsaPrivateKey: user['encrypted-ecdsa-private-key'],
            ecdsaKeyWrapperSalt: user['ecdsa-key-wrapper-salt'],
            wrappedEcdsaPrivateKey: user['wrapped-ecdsa-private-key'],
            forgotPasswordToken,
          }))
        } else {
          ws.send(JSON.stringify({
            route: 'ReceiveEncryptedToken',
            dhKeySalt: user['diffie-hellman-key-salt'],
            encryptedForgotPasswordToken
          }))
        }

        ws.on('message', async (msg) => {
          try {
            if (msg.length > FIVE_KB || msg.byteLength > FIVE_KB) {
              logger.child({ ...logChildObject, size: msg.length }).warn('Received large message over forgot-password')
              return ws.send('Message is too large')
            }

            const request = JSON.parse(msg)
            const { action, params } = request

            if (action === 'ForgotPassword') {
              const forgotPasswordResponse = await userController.forgotPassword(
                logChildObject,
                forgotPasswordToken,
                params.signedForgotPasswordToken || params.forgotPasswordToken,
                user,
                app
              )

              if (forgotPasswordResponse.status !== statusCodes['Success']) {

                ws.send(JSON.stringify({
                  route: 'Error',
                  status: forgotPasswordResponse.status,
                  data: forgotPasswordResponse.data
                }))
                ws.terminate()

              } else {
                const responseMsg = JSON.stringify({ route: 'SuccessfullyForgotPassword', response: forgotPasswordResponse })

                logger
                  .child({
                    ...logChildObject,
                    route: action,
                    statusCode: forgotPasswordResponse.status,
                    size: responseMsg.length,
                    responseTime: Date.now() - start
                  })
                  .info('Forgot password finished')

                ws.send(responseMsg)
                ws.terminate()
              }
            } else {
              throw new Error('Received unknown message')
            }

          } catch (e) {
            logger.child({ ...logChildObject, err: e, msg }).error('Error in forgot-password Websocket')
          }
        })
      }
    })

    setInterval(function ping() {
      wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate()

        ws.isAlive = false
        ws.send(JSON.stringify({ route: 'Ping' }))
      })
    }, 30000)

    // browsers will cache setting to use https for all future requests to server
    app.use(function (req, res, next) {
      res.setHeader('Strict-Transport-Security', `max-age: ${HSTS_MAX_AGE}; includeSubDomains; preload`)
      next()
    })

    app.use(expressLogger({ logger }))
    app.get('/ping', function (req, res) {
      res.send('Healthy')
    })

    // Userbase user API
    const v1Api = express.Router()
    app.use('/v1/api', v1Api)

    v1Api.use(bodyParser.json())

    v1Api.get('/', userController.authenticateUser, (req, res) =>
      req.ws
        ? res.ws(socket => wss.emit('connection', socket, req, res))
        : res.send('Not a websocket!')
    )
    v1Api.post('/auth/sign-up', userController.signUp)
    v1Api.post('/auth/sign-in', userController.signIn)
    v1Api.post('/auth/sign-in-with-session', userController.authenticateUser, userController.extendSession)
    v1Api.get('/auth/server-public-key', userController.getServerPublicKey)
    v1Api.get('/auth/get-password-salts', userController.getPasswordSaltsController)
    v1Api.get('/auth/forgot-password', (req, res) =>
      req.ws
        ? res.ws(socket => wss.emit('forgot-password', socket, req, res))
        : res.send('Not a websocket!')
    )
    v1Api.get('/public-key', userController.getPublicKey)

    // Userbase admin API
    app.use(express.static(path.join(__dirname + adminPanelDir)))
    const v1Admin = express.Router()
    app.use('/v1/admin', v1Admin)

    v1Admin.use(cookieParser())

    v1Admin.post('/stripe/webhook', bodyParser.raw({ type: 'application/json' }), stripe.handleWebhook)
    v1Admin.post('/stripe/test/connect/webhook', bodyParser.raw({ type: 'application/json' }), (req, res) => stripe.handleWebhook(req, res, stripe.WEBHOOK_OPTIONS['TEST_CONNECT']))
    v1Admin.post('/stripe/prod/connect/webhook', bodyParser.raw({ type: 'application/json' }), (req, res) => stripe.handleWebhook(req, res, stripe.WEBHOOK_OPTIONS['PROD_CONNECT']))

    // must come after stripe/webhook to ensure parsing done correctly
    v1Admin.use(bodyParser.json())

    v1Admin.post('/create-admin', admin.createAdminController)
    v1Admin.post('/sign-in', admin.signInAdmin)
    v1Admin.post('/sign-out', admin.authenticateAdmin, admin.signOutAdmin)
    v1Admin.post('/create-app', admin.authenticateAdmin, appController.createAppController)
    v1Admin.post('/list-apps', admin.authenticateAdmin, appController.listApps)
    v1Admin.post('/list-app-users', admin.authenticateAdmin, appController.listAppUsers)
    v1Admin.post('/delete-app', admin.authenticateAdmin, appController.deleteApp)
    v1Admin.post('/permanent-delete-app', admin.authenticateAdmin, appController.permanentDeleteAppController)
    v1Admin.post('/delete-user', admin.authenticateAdmin, admin.deleteUser)
    v1Admin.post('/permanent-delete-user', admin.authenticateAdmin, admin.permanentDeleteUser)
    v1Admin.post('/delete-admin', admin.authenticateAdmin, admin.deleteAdmin)
    v1Admin.post('/update-admin', admin.authenticateAdmin, admin.updateAdmin)
    v1Admin.post('/change-password', admin.authenticateAdmin, admin.changePassword)
    v1Admin.post('/forgot-password', admin.forgotPassword)
    v1Admin.get('/access-tokens', admin.authenticateAdmin, admin.getAccessTokens)
    v1Admin.post('/access-token', admin.authenticateAdmin, admin.generateAccessToken)
    v1Admin.delete('/access-token', admin.authenticateAdmin, admin.deleteAccessToken)
    v1Admin.get('/account', admin.authenticateAdmin, admin.getAdminAccount)

    // endpoints for admin to manage their own account's payments to Userbase
    v1Admin.post('/stripe/create-saas-payment-session', admin.authenticateAdmin, admin.createSaasPaymentSession)
    v1Admin.post('/stripe/update-saas-payment-session', admin.authenticateAdmin, admin.updateSubscriptionPaymentSession)
    v1Admin.post('/stripe/cancel-saas-subscription', admin.authenticateAdmin, admin.cancelSaasSubscription)
    v1Admin.post('/stripe/resume-saas-subscription', admin.authenticateAdmin, admin.resumeSaasSubscription)
    v1Admin.post('/stripe/payments-add-on', admin.authenticateAdmin, admin.subscribeToPaymentsAddOn)
    v1Admin.post('/stripe/cancel-payments-add-on', admin.authenticateAdmin, admin.cancelPaymentsAddOnSubscription)
    v1Admin.post('/stripe/resume-payments-add-on', admin.authenticateAdmin, admin.resumePaymentsAddOnSubscription)

    // endpoints for admin to use payment portal to accept payments from their users
    v1Admin.post('/stripe/connection/:authorizationCode', admin.authenticateAdmin, admin.completeStripeConnection)
    v1Admin.delete('/stripe/connection', admin.authenticateAdmin, admin.disconnectStripeAccount)
    v1Admin.post('/stripe/connected/apps/:appId/test-subscription/:subscriptionPlanId', admin.authenticateAdmin, appController.setTestSubscriptionPlan)
    v1Admin.delete('/stripe/connected/apps/:appId/test-subscription/:subscriptionPlanId', admin.authenticateAdmin, appController.deleteTestSubscriptionPlan)
    v1Admin.post('/stripe/connected/apps/:appId/prod-subscription/:subscriptionPlanId', admin.authenticateAdmin, appController.setProdSubscriptionPlan)
    v1Admin.delete('/stripe/connected/apps/:appId/prod-subscription/:subscriptionPlanId', admin.authenticateAdmin, appController.deleteProdSubscriptionPlan)
    v1Admin.post('/stripe/connected/apps/:appId/enable-test-payments', admin.authenticateAdmin, appController.enableTestPayments)
    v1Admin.post('/stripe/connected/apps/:appId/enable-prod-payments', admin.authenticateAdmin, appController.enableProdPayments)
    v1Admin.delete('/stripe/connected/apps/:appId/payments-mode', admin.authenticateAdmin, appController.disablePayments)

    // Access token endpoints
    v1Admin.post('/users/:userId', admin.authenticateAccessToken, userController.updateProtectedProfile)
    v1Admin.get('/users/:userId', admin.authenticateAccessToken, userController.adminGetUserController)
    v1Admin.get('/apps/:appId', admin.authenticateAccessToken, appController.getAppController)
    v1Admin.get('/apps/:appId/users', admin.authenticateAccessToken, appController.listUsersWithPagination)
    v1Admin.get('/apps', admin.authenticateAccessToken, appController.listAppsWithPagination)
    v1Admin.get('/auth-tokens/:authToken', admin.authenticateAccessToken, userController.verifyAuthToken)

    // internal server used to receive notifications of transactions and user updates from peers -- shouldn't be exposed to public
    const internalServer = express()
    const internalServerPort = 9000
    http.createServer(internalServer)
      .listen(internalServerPort, () => logger.info(`Internal server listening on http port ${internalServerPort}....`))

    internalServer.use(bodyParser.json())
    internalServer.post('/internal/notify-transaction', (req, res) => {
      const transaction = req.body.transaction
      const userId = req.body.userId

      let logChildObject
      try {
        logChildObject = { userId, databaseId: transaction['database-id'], seqNo: transaction['seq-no'], req: trimReq(req) }
        logger
          .child(logChildObject)
          .info('Received internal notification to update db')

        connections.push(transaction, userId)
      } catch (e) {
        const msg = 'Error pushing internal transaction to connected clients'
        logger.child({ ...logChildObject, err: e }).error(msg)
        return res.status(statusCodes['Internal Server Error']).send(msg)
      }

      return res.end()
    })

    internalServer.post('/internal/notify-updated-user', (req, res) => {
      const updatedUser = req.body.updatedUser

      let logChildObject
      try {
        logChildObject = { userId: updatedUser.userId, req: trimReq(req) }
        logger
          .child(logChildObject)
          .info('Received internal notification to update user')

        connections.pushUpdatedUser(updatedUser)
      } catch (e) {
        const msg = 'Error pushing internal updated user to connected clients'
        logger.child({ ...logChildObject, err: e }).error(msg)
        return res.status(statusCodes['Internal Server Error']).send(msg)
      }

      return res.end()
    })

  } catch (e) {
    logger.info(`Unhandled error while launching server: ${e}`)
  }
}

function createAdmin({ email, password, fullName, adminId, receiveEmailUpdates, storePasswordInSecretsManager = false }) {
  return admin.createAdmin(email, password, fullName, adminId, receiveEmailUpdates, storePasswordInSecretsManager)
}

function createApp({ appName, adminId, appId }) {
  return appController.createApp(appName, adminId, appId)
}

export default {
  start,
  createAdmin,
  createApp
}
