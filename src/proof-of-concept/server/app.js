import express from 'express'
import fs from 'fs'
import crypto from 'crypto'
import cors from 'cors'

import userbaseServer from 'userbase-server'

const app = express()
const distDir = './src/proof-of-concept/dist'

const httpsKeyPath = '../keys/key.pem'
const httpsCertPath = '../keys/cert.pem'
const httpPort = process.env.PORT || 8080
const httpsPort = process.env.PORT || 8443
const certExists = fs.existsSync(httpsKeyPath) && fs.existsSync(httpsCertPath)
const httpsKey = certExists && fs.readFileSync(httpsKeyPath)
const httpsCert = certExists && fs.readFileSync(httpsCertPath)

const userbaseConfig = {
  httpsKey,
  httpsCert,
  httpsPort,
  httpPort,
}

const ADMIN_EMAIL = 'admin@userbase.com'
const ADMIN_ID = 'admin-id'
const ADMIN_FULL_NAME = 'Default Admin'

const APP_NAME = 'proof-of-concept'
const APP_ID = 'poc-id'

const CONFLICT_STATUS_CODE = 409

start()
async function start() {
  app.use(cors())
  app.use('/poc', express.static(distDir))
  await userbaseServer.start(express, app, userbaseConfig)

  await setupAdmin()
  await setupApp()
}

async function setupAdmin() {
  try {
    let adminPassword = process.env['sm.ADMIN_ACCOUNT_PASSWORD']
    let storePasswordInSecretsManager
    if (!adminPassword) {
      adminPassword = crypto.randomBytes(16).toString('base64')
      storePasswordInSecretsManager = true
    }

    await userbaseServer.createAdmin({
      email: ADMIN_EMAIL,
      password: adminPassword,
      fullName: ADMIN_FULL_NAME,
      adminId: ADMIN_ID,
      storePasswordInSecretsManager
    })
  } catch (e) {
    if (!e || e.status !== CONFLICT_STATUS_CODE) {
      console.log(`Failed to set up new admin account with ${JSON.stringify(e)}`)
    }
  }
}

async function setupApp() {
  try {
    await userbaseServer.createApp({
      appName: APP_NAME,
      adminId: ADMIN_ID,
      appId: APP_ID
    })
  } catch (e) {
    if (!e || e.status !== CONFLICT_STATUS_CODE) {
      console.log(`Failed to set up new app with ${JSON.stringify(e)}`)
    }
  }
}
