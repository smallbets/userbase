import express from 'express'
import fs from 'fs'

import userbaseServer from 'userbase-server'

const app = express()
const distDir = './src/proof-of-concept/dist'

const httpsKeyPath = '../keys/key.pem'
const httpsCertPath = '../keys/cert.pem'
const httpPort = process.env.PORT || 8080
const httpsPort = process.env.PORT || 8443
const certExists = fs.existsSync(httpsKeyPath) && fs.existsSync(httpsCertPath)
const httpsKey = certExists && fs.readFileSync(httpsKey)
const httpsCert = certExists && fs.readFileSync(httpsCert)

const userbaseConfig = {
  httpsKey,
  httpsCert,
  httpsPort,
  httpPort
}

app.use(express.static(distDir))

userbaseServer(app, userbaseConfig)
