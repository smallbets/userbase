import express from 'express'
import http from 'http'
import https from 'https'
import fs from 'fs'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import setup from './setup'
import auth from './auth'
import db from './db'

const app = express()
const distDir = "./dist"
const httpsKey = './keys/key.pem'
const httpsCert = './keys/cert.pem'
const httpPort = process.env.PORT || 8080
const httpsPort = process.env.PORT || 8443

process.title = 'encrypted-dev-server'

if (process.env.NODE_ENV == 'development') {
  console.log("Development Mode")
}

(async () => {
  try {
    await setup.init()

    app.use(express.static(distDir))
    app.use(bodyParser.json())
    app.use(cookieParser())

    app.post('/api/auth/sign-up', auth.signUp)
    app.post('/api/auth/sign-in', auth.signIn)
    app.post('/api/auth/sign-out', auth.authenticateUser, auth.signOut)

    app.post('/api/db/insert', auth.authenticateUser, db.insert)
    app.post('/api/db/update', auth.authenticateUser, db.update)
    app.post('/api/db/delete', auth.authenticateUser, db.delete)
    app.get('/api/db/query/tx-log', auth.authenticateUser, db.queryTransactionLog)
    app.get('/api/db/query/db-state', auth.authenticateUser, db.queryDbState)

    app.post('/api/db/batch-insert', auth.authenticateUser, db.batchInsert)
    app.post('/api/db/batch-update', auth.authenticateUser, db.batchUpdate)
    app.post('/api/db/batch-delete', auth.authenticateUser, db.batchDelete)

    app.post('/api/db/acq-bundle-tx-log-lock', auth.authenticateUser, db.acquireBundleTransactionLogLock)
    app.post('/api/db/rel-bundle-tx-log-lock', auth.authenticateUser, db.releaseBundleTransactionLogLock)
    app.post('/api/db/bundle-tx-log', auth.authenticateUser, db.bundleTransactionLog)

    if (fs.existsSync(httpsKey) && fs.existsSync(httpsCert)) {
      // tls certs found, so launch an https server
      console.log('Starting https server')
      https.createServer({ key: fs.readFileSync(httpsKey), cert: fs.readFileSync(httpsCert) }, app)
        .listen(httpsPort, () => console.log(`App listening on https port ${httpsPort}....`))
    } else {
      // if no tls certs, launch an http server
      console.log('Starting http server')
      http.createServer(app).listen(httpPort, () => console.log(`App listening on http port ${httpPort}....`))
    }
  } catch (e) {
    console.log(`Unhandled error while launching server: ${e}`)
  }
})()
