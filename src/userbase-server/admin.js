import uuidv4 from 'uuid/v4'
import crypto from './crypto'
import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import logger from './logger'
import appController from './app'
import userController from './user'
import { validateEmail, trimReq, getTtl } from './utils'
import stripe from './stripe'

// source: https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Session_Management_Cheat_Sheet.md#session-id-length
const ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID = 16
const SESSION_COOKIE_NAME = 'adminSessionId'

const BASE_64_STRING_LENGTH_FOR_32_BYTES = 44

const HOURS_IN_A_DAY = 24
const SECONDS_IN_A_DAY = 60 * 60 * HOURS_IN_A_DAY
const MS_IN_A_DAY = 1000 * SECONDS_IN_A_DAY
const SESSION_LENGTH = MS_IN_A_DAY

// STORAGE PLANS
const ONE_KB = 1024
const ONE_MB = ONE_KB * 1024
const ONE_GB = ONE_MB * 1024

const DEFAULT_STORAGE_SIZE = ONE_GB

const createSession = async function (adminId) {
  const sessionId = crypto
    .randomBytes(ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID)
    .toString('hex')

  const expirationDate = new Date(Date.now() + MS_IN_A_DAY).toISOString()

  const session = {
    'session-id': sessionId,
    'admin-id': adminId,
    'creation-date': new Date().toISOString(),
    ttl: getTtl(expirationDate),
  }

  const params = {
    TableName: setup.sessionsTableName,
    Item: session
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.put(params).promise()

  return sessionId
}

const setSessionCookie = (res, sessionId) => {
  const cookieResponseHeaders = {
    maxAge: SESSION_LENGTH,
    httpOnly: true,
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production'
  }

  res.cookie(SESSION_COOKIE_NAME, sessionId, cookieResponseHeaders)
}

async function createAdmin(email, password, fullName, adminId = uuidv4(), receiveEmailUpdates, storePasswordInSecretsManager = false) {
  if (!email || !password || !fullName) throw {
    status: statusCodes['Bad Request'],
    data: 'Missing required items'
  }

  if (!validateEmail(email)) throw {
    status: statusCodes['Bad Request'],
    data: 'Invalid email'
  }

  try {
    if (storePasswordInSecretsManager) {
      const secrets = await setup.getSecrets()
      await setup.updateSecrets(secrets, 'ADMIN_ACCOUNT_PASSWORD', password)
    }

    const passwordHash = await crypto.bcrypt.hash(password)

    try {
      const creationDate = new Date().toISOString()

      const admin = {
        email: email.toLowerCase(),
        'password-hash': passwordHash,
        'full-name': fullName,
        'admin-id': adminId,
        'creation-date': creationDate,
        'receive-email-updates': receiveEmailUpdates ? true : false
      }

      const adminParams = {
        TableName: setup.adminTableName,
        Item: admin,
        ConditionExpression: 'attribute_not_exists(email)'
      }

      const trialApp = {
        'admin-id': adminId,
        'app-name': 'Trial',
        'app-id': uuidv4(),
        'creation-date': creationDate
      }

      const trialAppParams = {
        TableName: setup.appsTableName,
        Item: trialApp,
        ConditionExpression: 'attribute_not_exists(#adminId)',
        ExpressionAttributeNames: {
          '#adminId': 'admin-id'
        },
      }

      const params = {
        TransactItems: [
          { Put: adminParams },
          { Put: trialAppParams }
        ]
      }

      const ddbClient = connection.ddbClient()
      await ddbClient.transactWrite(params).promise()
    } catch (e) {
      if (e.message.includes('[ConditionalCheckFailed')) {
        throw {
          status: statusCodes['Conflict'],
          data: 'Admin already exists'
        }
      }
      throw e
    }

    return adminId
  } catch (e) {
    if (e.data && e.status) throw e

    logger.error(`Failed to create admin with ${e}`)
    throw {
      status: statusCodes['Internal Server Error'],
      data: 'Failed to create admin'
    }
  }
}
exports.createAdmin = createAdmin

exports.createAdminController = async function (req, res) {
  const email = req.body.email
  const password = req.body.password
  const fullName = req.body.fullName
  const receiveEmailUpdates = req.body.receiveEmailUpdates

  const adminId = uuidv4()
  try {
    const storePasswordInSecretsManager = false
    await createAdmin(email, password, fullName, adminId, receiveEmailUpdates, storePasswordInSecretsManager)
  } catch (e) {
    return res
      .status(e.status)
      .send(e.data)
  }

  try {
    const sessionId = await createSession(adminId)
    setSessionCookie(res, sessionId)
    return res.send(adminId)
  } catch (e) {
    logger.error(`Failed to create session for admin ${adminId} with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to create session!')
  }
}

const findAdminByAdminId = async (adminId) => {
  const params = {
    TableName: setup.adminTableName,
    IndexName: setup.adminIdIndex,
    KeyConditionExpression: '#adminId = :adminId',
    ExpressionAttributeNames: {
      '#adminId': 'admin-id'
    },
    ExpressionAttributeValues: {
      ':adminId': adminId
    },
    Select: 'ALL_ATTRIBUTES'
  }

  const ddbClient = connection.ddbClient()
  const adminResponse = await ddbClient.query(params).promise()

  if (!adminResponse || adminResponse.Items.length === 0) return null

  if (adminResponse.Items.length > 1) {
    const errorMsg = `Too many admins found with id ${adminId}`
    logger.fatal(errorMsg)
    throw new Error(errorMsg)
  }

  return adminResponse.Items[0]
}
exports.findAdminByAdminId = findAdminByAdminId

const _validateAdminPassword = async (password, admin) => {
  try {
    if (!admin || admin['deleted']) throw new Error('Admin not found')

    const passwordIsCorrect = await crypto.bcrypt.compare(password, admin['password-hash'])

    if (!passwordIsCorrect) {
      const tempPasswordIsCorrect = await crypto.bcrypt.compare(password, admin['temp-password'])

      if (!tempPasswordIsCorrect) {
        throw new Error('Incorrect password or temp password')
      } else {
        if (new Date() - new Date(admin['temp-password-creation-date']) > MS_IN_A_DAY) {
          throw new Error('Temp password expired')
        }
      }
    }
  } catch (e) {
    if (e.status && e.data) {
      throw {
        status: e.status,
        error: { message: e.data }
      }
    } else {
      throw {
        status: statusCodes['Unauthorized'],
        error: { message: 'Incorrect password' }
      }
    }
  }
}

const _getSizeAllowed = (admin) => {
  return (admin['stripe-saas-subscription-status'] === 'active' && !admin['stripe-cancel-saas-subscription-at'] &&
    admin['stripe-storage-subscription-status'] === 'active' && !admin['stripe-cancel-storage-subscription-at'])
    ? null // No enforced limit for now
    : DEFAULT_STORAGE_SIZE
}

const _buildAdminResult = (admin) => {
  return {
    email: admin['email'],
    fullName: admin['full-name'],
    paymentStatus: admin['stripe-saas-subscription-status'],
    cancelSaasSubscriptionAt: admin['stripe-cancel-saas-subscription-at'],
    connectedToStripe: admin['stripe-account-id'] ? true : false,
    paymentsAddOnSubscriptionStatus: admin['stripe-payments-add-on-subscription-status'],
    cancelPaymentsAddOnSubscriptionAt: admin['stripe-cancel-payments-add-on-subscription-at'],
    storageSubscriptionStatus: admin['stripe-storage-subscription-status'],
    cancelStorageSubscriptionAt: admin['stripe-cancel-storage-subscription-at'],
    altPaymentStatus: admin['alt-saas-subscription-status'],
    size: admin['size'],
    sizeAllowed: _getSizeAllowed(admin),
  }
}

exports.signInAdmin = async function (req, res) {
  const email = req.body.email
  const password = req.body.password

  if (!email || !password) return res
    .status(statusCodes['Bad Request'])
    .send('Missing required items')

  const params = {
    TableName: setup.adminTableName,
    Key: {
      email: email.toLowerCase()
    },
  }

  try {
    const ddbClient = connection.ddbClient()
    const adminResponse = await ddbClient.get(params).promise()

    const admin = adminResponse.Item

    try {
      await _validateAdminPassword(password, admin)
    } catch (e) {
      return res
        .status(e.status)
        .send(e.error.message)
    }

    const sessionId = await createSession(admin['admin-id'])

    setSessionCookie(res, sessionId)

    return res
      .status(statusCodes['Success'])
      .send(_buildAdminResult(admin))
  } catch (e) {
    logger.error(`Admin '${email}' failed to sign in with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to sign in admin!')
  }
}

exports.signOutAdmin = async function (req, res) {
  const sessionId = req.cookies[SESSION_COOKIE_NAME]

  if (!sessionId) return res
    .status(statusCodes['Unauthorized'])
    .send('Missing session id')

  const params = {
    TableName: setup.sessionsTableName,
    Key: {
      'session-id': sessionId
    },
    UpdateExpression: 'set invalidated = :invalidated',
    ExpressionAttributeValues: {
      ':invalidated': true,
    }
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.update(params).promise()

    return res.status(statusCodes['Success']).end()
  } catch (e) {
    logger.error(`Failed to sign out session ${sessionId} with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to sign out!')
  }
}

exports.authenticateAdmin = async function (req, res, next) {
  const sessionId = req.cookies[SESSION_COOKIE_NAME]

  if (!sessionId) return res
    .status(statusCodes['Unauthorized'])
    .send('Please sign in.')

  const params = {
    TableName: setup.sessionsTableName,
    Key: {
      'session-id': sessionId
    }
  }

  try {
    const ddbClient = connection.ddbClient()
    const sessionResponse = await ddbClient.get(params).promise()

    const session = sessionResponse.Item

    const doesNotExist = !session
    const invalidated = doesNotExist || session.invalidated
    const expired = invalidated || (new Date() - new Date(session['creation-date']) > SESSION_LENGTH)
    const isNotAdminSession = expired || !session['admin-id']

    if (doesNotExist || invalidated || expired || isNotAdminSession) return res
      .status(statusCodes['Unauthorized']).end()

    const admin = await findAdminByAdminId(session['admin-id'])
    if (!admin || admin['deleted']) return res
      .status(statusCodes['Not Found'])
      .send('Admin does not exist')

    res.locals.admin = admin // makes admin object available in next route
    next()
  } catch (e) {
    logger.error(`Failed to authenticate admin session ${sessionId} with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to authenticate admin')
  }
}

exports.deleteUser = async function (req, res) {
  const appName = req.body.appName
  const username = req.body.username
  const userId = req.body.userId

  const adminId = res.locals.admin['admin-id']

  if (!appName || !username) return res
    .status(statusCodes['Bad Request'])
    .send('Missing required items')

  try {
    const [user, app] = await Promise.all([
      userController.getUserByUserId(userId),
      appController.getApp(adminId, appName)
    ])

    if (!app || app['deleted'] || app['admin-id'] !== adminId) return res.status(statusCodes['Not Found']).send('App not found')
    if (!user || app['app-id'] !== user['app-id']) return res.status(statusCodes['Not Found']).send('User not found')

    await userController.deleteUser(user, res.locals.admin['stripe-account-id'])

    return res.end()
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      return res.status(statusCodes['Not Found']).send('User not found')
    }

    logger.error(`Failed to delete user '${userId}' from admin '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to delete user')
  }
}

exports.permanentDeleteUser = async function (req, res) {
  const appName = req.body.appName
  const username = req.body.username
  const userId = req.body.userId

  const adminId = res.locals.admin['admin-id']

  if (!appName || !username) return res
    .status(statusCodes['Bad Request'])
    .send('Missing required items')

  try {
    const [app, user] = await Promise.all([
      appController.getApp(adminId, appName),
      userController.getUserByUserId(userId)
    ])
    if (!app || app['deleted']) return res.status(statusCodes['Not Found']).send('App not found')
    if (!user || user['app-id'] !== app['app-id']) return res.status(statusCodes['Not Found']).send('User not found')

    await userController.permanentDelete(user)

    return res.end()
  } catch (e) {
    if (e.message.includes('ConditionalCheckFailed]')) {
      return res.status(statusCodes['Conflict']).send('User already permanently deleted')
    }

    logger.error(`Failed to permanently delete user '${userId}' from admin '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to permanently delete user')
  }
}

exports.permanentDelete = async function (admin) {
  const email = admin['email']
  const adminId = admin['admin-id']
  const stripeCustomerId = admin['stripe-customer-id']

  const logChildObject = { email, adminId, stripeCustomerId }
  logger.child(logChildObject).info('Permanent deleting admin')

  // delete from Stripe before DDB delete to maintain reference
  if (stripeCustomerId) {
    try {
      await stripe.getClient().customers.del(stripeCustomerId)
    } catch (e) {
      // only safe to continue if customer is already deleted from Stripe
      if (!e.message.includes('No such customer')) throw e
    }
  }

  const existingAdminParams = {
    TableName: setup.adminTableName,
    Key: {
      email,
    },
    ConditionExpression: 'attribute_exists(deleted) and #adminId = :adminId',
    ExpressionAttributeNames: {
      '#adminId': 'admin-id'
    },
    ExpressionAttributeValues: {
      ':adminId': adminId
    }
  }

  const permanentDeletedAdminParams = {
    TableName: setup.deletedAdminsTableName,
    Item: {
      ...admin // still technically can recover admin before data is purged, though more difficult
    },
    ConditionExpression: 'attribute_not_exists(#adminId)',
    ExpressionAttributeNames: {
      '#adminId': 'admin-id'
    }
  }

  const transactionParams = {
    TransactItems: [
      { Delete: existingAdminParams },
      { Put: permanentDeletedAdminParams }
    ]
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.transactWrite(transactionParams).promise()

  logger.child(logChildObject).info('Deleted admin permanently')
}

const setTempPassword = async (email, tempPassword) => {
  const params = {
    TableName: setup.adminTableName,
    Key: {
      email
    },
    UpdateExpression: 'set #tempPassword = :tempPassword, #tempPasswordCreationDate = :tempPasswordCreationDate',
    ConditionExpression: 'attribute_exists(email)',
    ExpressionAttributeNames: {
      '#tempPassword': 'temp-password',
      '#tempPasswordCreationDate': 'temp-password-creation-date',
    },
    ExpressionAttributeValues: {
      ':tempPassword': await crypto.bcrypt.hash(tempPassword),
      ':tempPasswordCreationDate': new Date().toISOString()
    },
    ReturnValues: 'ALL_NEW'
  }

  const ddbClient = connection.ddbClient()

  try {
    const adminResponse = await ddbClient.update(params).promise()
    return adminResponse.Attributes
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      return null
    }
    throw e
  }
}

exports.forgotPassword = async function (req, res) {
  const email = req.body.email && req.body.email.toLowerCase()

  if (!email) return res
    .status(statusCodes['Bad Request'])
    .send('Missing admin name')

  try {
    const tempPassword = crypto
      .randomBytes(ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID)
      .toString('base64')

    const admin = await setTempPassword(email, tempPassword)
    if (!admin || admin['deleted']) return res.status(statusCodes['Not Found']).send('Admin not found')

    const subject = 'Forgot Password - Userbase'
    const body = `Hello, ${email}!`
      + '<br />'
      + '<br />'
      + 'Looks like you requested to reset your password to your Userbase admin account!'
      + '<br />'
      + '<br />'
      + 'If you did not make this request, you can safely ignore this email.'
      + '<br />'
      + '<br />'
      + `Here is your temporary password you can use to log in: ${tempPassword}`
      + '<br />'
      + '<br />'
      + `This password will expire in ${HOURS_IN_A_DAY} hours.`

    await setup.sendEmail(email, subject, body)

    return res.end()
  } catch (e) {
    logger.error(`Failed to forget password for admin '${email}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to forget password')
  }
}

const conditionExpressionAdminExists = (email, adminId) => {
  return {
    TableName: setup.adminTableName,
    Key: {
      email
    },
    ConditionExpression: '#adminId = :adminId',
    ExpressionAttributeValues: {
      ':adminId': adminId
    },
    ExpressionAttributeNames: {
      '#adminId': 'admin-id'
    }
  }
}

const _updateAdminExcludingEmailUpdate = async (oldAdmin, adminId, fullName) => {
  const params = conditionExpressionAdminExists(oldAdmin['email'], adminId)

  let UpdateExpression = 'SET '

  if (fullName) {
    UpdateExpression += '#fullName = :fullName'
    params.ExpressionAttributeNames['#fullName'] = 'full-name'
    params.ExpressionAttributeValues[':fullName'] = fullName
  }

  params.UpdateExpression = UpdateExpression

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.update(params).promise()
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      throw new Error('Admin not found')
    }
    throw e
  }
}

const _updateAdminIncludingEmailUpdate = async (oldAdmin, adminId, email, fullName) => {
  // if updating email, need to Delete existing DDB item and Put new one because email is partition key
  const deleteAdminParams = conditionExpressionAdminExists(oldAdmin['email'], adminId)

  const updatedAdmin = {
    ...oldAdmin,
    email
  }

  if (fullName) updatedAdmin['full-name'] = fullName

  const updateAdminParams = {
    TableName: setup.adminTableName,
    Item: updatedAdmin,
    ConditionExpression: 'attribute_not_exists(email)'
  }

  const params = {
    TransactItems: [
      { Delete: deleteAdminParams },
      { Put: updateAdminParams }
    ]
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.transactWrite(params).promise()
  } catch (e) {
    if (e.message.includes('[ConditionalCheckFailed')) {
      throw new Error('Admin not found')
    } else if (e.message.includes('ConditionalCheckFailed]')) {
      throw new Error('Admin already exists')
    }
    throw e
  }
}

exports.updateAdmin = async function (req, res) {
  const admin = res.locals.admin
  const adminId = admin['admin-id']
  const stripeCustomerId = admin['stripe-customer-id']

  try {
    const email = req.body.email && req.body.email.toLowerCase()
    const fullName = req.body.fullName

    if (email) {
      if (email === admin['email']) return res.status(statusCodes['Conflict']).send('Email must be different')
      if (!validateEmail(email)) return res.status(statusCodes['Bad Request']).send('Invalid Email')

      const updateStripeCustomer = async () => {
        try {
          await stripe.getClient().customers.update(stripeCustomerId, { email })
        } catch (e) {
          //failure ok
          logger.warn(`Failed to update admin ${adminId}'s email in Stripe`)
        }
      }

      // ok if 1 fails and other succeeds. It's undesirable, but ok if they are out of sync since
      // Stripe Checkout allows for customers to change their email at the point of checkout anyway
      await Promise.all([
        _updateAdminIncludingEmailUpdate(admin, adminId, email, fullName),
        stripeCustomerId && updateStripeCustomer()
      ])
    } else {
      if (!fullName) return res.status(statusCodes['Bad Request']).send('Missing required items')
      await _updateAdminExcludingEmailUpdate(admin, adminId, fullName)
    }

    return res.end()
  } catch (e) {
    if (e.message === 'Admin not found') {
      return res.status(statusCodes['Not Found']).send('Admin not found')
    } else if (e.message === 'Admin already exists') {
      return res.status(statusCodes['Conflict']).send('Admin already exists')
    }

    logger.error(`Failed to update admin '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to update admin')
  }
}

const _changePassword = async (admin, adminId, password) => {
  const params = conditionExpressionAdminExists(admin['email'], adminId)

  params.UpdateExpression = 'SET #passwordHash = :passwordHash'
  params.ExpressionAttributeNames['#passwordHash'] = 'password-hash'
  params.ExpressionAttributeValues[':passwordHash'] = await crypto.bcrypt.hash(password)

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.update(params).promise()
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      throw new Error('Admin not found')
    }
    throw e
  }
}

exports.changePassword = async function (req, res) {
  const admin = res.locals.admin
  const adminId = admin['admin-id']

  try {
    const currentPassword = req.body.currentPassword
    const newPassword = req.body.newPassword

    if (!currentPassword && !newPassword) return res.status(statusCodes['Bad Request']).send('Missing required items')

    try {
      await _validateAdminPassword(currentPassword, admin)
    } catch (e) {
      return res
        .status(e.status)
        .send(e.error.message)
    }

    try {
      await _changePassword(admin, adminId, newPassword)
    } catch (e) {
      if (e.status && e.data) {
        return res.status(e.status).send(e.data)
      } else {
        throw e
      }
    }

    return res.end()
  } catch (e) {
    if (e.message === 'Admin not found') {
      return res.status(statusCodes['Not Found']).send('Admin not found')
    }

    logger.error(`Failed to change password for '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to change password')
  }
}

exports.deleteAdmin = async function (req, res) {
  const admin = res.locals.admin
  const email = admin['email']
  const adminId = admin['admin-id']

  try {
    await Promise.all([
      stripe.deleteSubscription(admin['stripe-saas-subscription-id'], admin['stripe-saas-subscription-status']),
      stripe.deleteSubscription(admin['stripe-payments-add-on-subscription-id'], admin['stripe-payments-add-on-subscription-status']),
      stripe.deleteSubscription(admin['stripe-storage-subscription-id'], admin['stripe-storage-subscription-status']),
    ])

    const params = {
      TableName: setup.adminTableName,
      Key: {
        email
      },
      UpdateExpression: 'SET deleted = :deleted',
      ConditionExpression: '#adminId = :adminId and attribute_not_exists(deleted)',
      ExpressionAttributeValues: {
        ':deleted': new Date().toISOString(),
        ':adminId': adminId
      },
      ExpressionAttributeNames: {
        '#adminId': 'admin-id'
      }
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.update(params).promise()

    return res.end()
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      return res.status(statusCodes['Not Found']).send('Admin not found')
    }

    logger.error(`Failed to delete admin '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to delete admin')
  }
}

exports.createSaasPaymentSession = async function (req, res) {
  const admin = res.locals.admin
  const adminId = admin['admin-id']

  try {
    const session = await stripe.getClient().checkout.sessions.create({
      customer_email: admin['email'],
      payment_method_types: ['card'],
      subscription_data: {
        items: [{ plan: stripe.getStripeSaasSubscriptionPlanId() }],
        metadata: { adminId }
      },
      success_url: `${process.env['STRIPE_REDIRECT_URL'] || req.headers.referer}#success`,
      cancel_url: `${process.env['STRIPE_REDIRECT_URL'] || req.headers.referer}#edit-account`,
    },
      {
        idempotency_key: admin['email'] + adminId // admin can only checkout a single subscription plan
      })

    return res.send(session.id)
  } catch (e) {
    logger.error(`Failed to create SaaS payment session for admin '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to create payment session')
  }
}

const _buildStripeSubscriptionDdbParams = async (admin, customerId, subscriptionId, subscriptionPlanId, status, cancelAt, stripeEventTimestamp) => {
  const stripeSubscriptionDdbParams = conditionExpressionAdminExists(admin['email'], admin['admin-id'])

  // Making sure event timestamp provided is greater than one stored ensures latest gets stored in DDB (Stripe sends events out of order)
  stripeSubscriptionDdbParams.ConditionExpression += ' and (attribute_not_exists(#stripeEventTimestamp) or :stripeEventTimestamp > #stripeEventTimestamp)'

  stripeSubscriptionDdbParams.UpdateExpression = `SET
    #stripeCustomerId = :stripeCustomerId,
    #stripeSubscriptionId = :stripeSubscriptionId,
    #stripeSubscriptionStatus = :stripeSubscriptionStatus,
    #stripeEventTimestamp = :stripeEventTimestamp
  `

  let subscriptionType
  switch (subscriptionPlanId) {
    case stripe.getStripeSaasSubscriptionPlanId():
      subscriptionType = 'saas'
      break
    case stripe.getStripePaymentsAddOnPlanId():
      subscriptionType = 'payments-add-on'
      break
    case stripe.getStripeStoragePlanId():
      subscriptionType = 'storage'
      break
    default:
      throw new Error('UnknownPlanId')
  }

  stripeSubscriptionDdbParams.ExpressionAttributeNames['#stripeCustomerId'] = 'stripe-customer-id'
  stripeSubscriptionDdbParams.ExpressionAttributeNames['#stripeSubscriptionId'] = 'stripe-' + subscriptionType + '-subscription-id'
  stripeSubscriptionDdbParams.ExpressionAttributeNames['#stripeSubscriptionStatus'] = 'stripe-' + subscriptionType + '-subscription-status'
  stripeSubscriptionDdbParams.ExpressionAttributeNames['#stripeEventTimestamp'] = 'stripe-' + subscriptionType + '-event-timestamp'
  stripeSubscriptionDdbParams.ExpressionAttributeNames['#cancelAt'] = 'stripe-cancel-' + subscriptionType + '-subscription-at'

  stripeSubscriptionDdbParams.ExpressionAttributeValues[':stripeCustomerId'] = customerId
  stripeSubscriptionDdbParams.ExpressionAttributeValues[':stripeSubscriptionId'] = subscriptionId
  stripeSubscriptionDdbParams.ExpressionAttributeValues[':stripeSubscriptionStatus'] = status
  stripeSubscriptionDdbParams.ExpressionAttributeValues[':stripeEventTimestamp'] = stripeEventTimestamp

  if (!cancelAt) {
    stripeSubscriptionDdbParams.UpdateExpression += ' REMOVE #cancelAt'
  } else {
    stripeSubscriptionDdbParams.UpdateExpression += ', #cancelAt = :cancelAt'
    stripeSubscriptionDdbParams.ExpressionAttributeValues[':cancelAt'] = cancelAt
  }

  return stripeSubscriptionDdbParams
}

exports.updateSubscriptionInDdb = async (logChildObject, logs, metadata, customerId, subscriptionId, subscriptionPlanId, status, cancelAt, stripeEventTimestamp) => {
  const adminId = metadata.adminId

  logChildObject.adminId = adminId
  logger.child(logChildObject).info(logs.startingLog)

  if (!adminId) throw new Error('MissingAdminIdFromAdminSubscriptionMetadata')

  const admin = await findAdminByAdminId(adminId)

  if (!admin) throw new Error('MissingFromDdb')

  const updateUserParams = await _buildStripeSubscriptionDdbParams(admin, customerId, subscriptionId, subscriptionPlanId, status, cancelAt, stripeEventTimestamp)
  const ddbClient = connection.ddbClient()
  await ddbClient.update(updateUserParams).promise()
}

exports.updateSubscriptionPaymentSession = async function (req, res) {
  const admin = res.locals.admin
  const adminId = admin['admin-id']
  const email = admin['email']

  const stripeCustomerId = admin['stripe-customer-id']

  try {
    if (!stripeCustomerId) {
      return res.status(statusCodes['Payment Required']).send('Must purchase subscription first')
    }

    const session = await stripe.getClient().checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'setup',
      customer_email: email,
      setup_intent_data: {
        metadata: {
          customer_id: stripeCustomerId
        },
      },
      success_url: `${process.env['STRIPE_REDIRECT_URL'] || req.headers.referer}#update-success`,
      cancel_url: `${process.env['STRIPE_REDIRECT_URL'] || req.headers.referer}#edit-account`,
    })

    return res.send(session.id)
  } catch (e) {
    logger.error(`Failed to generate update payment session for admin '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to update payment session')
  }
}

const _cancelStripeSubscriptionInDdb = async (admin, cancelAt, subscriptionType) => {
  const updateAdminParams = conditionExpressionAdminExists(admin['email'], admin['admin-id'])

  updateAdminParams.UpdateExpression = 'SET #cancelAt = :cancelAt'
  updateAdminParams.ExpressionAttributeNames['#cancelAt'] = 'stripe-cancel-' + subscriptionType + '-subscription-at'
  updateAdminParams.ExpressionAttributeValues[':cancelAt'] = cancelAt

  const ddbClient = connection.ddbClient()
  await ddbClient.update(updateAdminParams).promise()
}

const _resumeStripeSubscriptionInDdb = async (admin, subscriptionType) => {
  const updateAdminParams = conditionExpressionAdminExists(admin['email'], admin['admin-id'])

  updateAdminParams.UpdateExpression = 'REMOVE #cancelAt'
  updateAdminParams.ExpressionAttributeNames['#cancelAt'] = 'stripe-cancel-' + subscriptionType + '-subscription-at'

  const ddbClient = connection.ddbClient()
  await ddbClient.update(updateAdminParams).promise()
}

const _cancelSubscription = async (admin, subscriptionId, subscriptionType) => {
  if (admin['stripe-cancel-' + subscriptionType + '-subscription-at']) {
    return admin['stripe-cancel-' + subscriptionType + '-subscription-at']
  }

  const subscription = await stripe.getClient().subscriptions.update(
    subscriptionId,
    { cancel_at_period_end: true }
  )

  const cancelAt = stripe.convertStripeTimestamptToIsoString(subscription.cancel_at)
  await _cancelStripeSubscriptionInDdb(admin, cancelAt, subscriptionType)

  return cancelAt
}

exports.cancelSaasSubscription = async function (req, res) {
  const { admin } = res.locals
  const adminId = admin['admin-id']

  const saasSubscriptionId = admin['stripe-saas-subscription-id']
  const paymentsAddOnSubscriptionId = admin['stripe-payments-add-on-subscription-id']
  const storageSubscriptionId = admin['stripe-storage-subscription-id']

  if (!saasSubscriptionId && !paymentsAddOnSubscriptionId && !storageSubscriptionId) return res.status(statusCodes['Not Found']).send('No subscription found')

  try {
    // cancels all admin's subscriptions
    const [cancelSaasSubscriptionAt, cancelPaymentsAddOnSubscriptionAt, cancelStorageSubscriptionAt] = await Promise.all([
      saasSubscriptionId && _cancelSubscription(admin, saasSubscriptionId, 'saas'),
      paymentsAddOnSubscriptionId && _cancelSubscription(admin, paymentsAddOnSubscriptionId, 'payments-add-on'),
      storageSubscriptionId && _cancelSubscription(admin, storageSubscriptionId, 'storage'),
    ])

    return res.send({
      cancelSaasSubscriptionAt,
      cancelPaymentsAddOnSubscriptionAt,
      cancelStorageSubscriptionAt,
      sizeAllowed: DEFAULT_STORAGE_SIZE
    })
  } catch (e) {
    logger.error(`Failed to cancel subscription for admin '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to cancel subscription')
  }
}

exports.resumeSaasSubscription = async function (req, res) {
  const { admin } = res.locals
  const adminId = admin['admin-id']

  if (!admin['stripe-saas-subscription-id']) return res.status(statusCodes['Not Found']).send('No subscription found')
  if (!admin['stripe-cancel-saas-subscription-at']) return res.end()

  try {
    await stripe.getClient().subscriptions.update(
      admin['stripe-saas-subscription-id'],
      { cancel_at_period_end: false }
    )

    await _resumeStripeSubscriptionInDdb(admin, 'saas')

    return res.send({
      sizeAllowed: _getSizeAllowed({
        ...admin,
        'stripe-cancel-saas-subscription-at': undefined
      })
    })
  } catch (e) {
    logger.error(`Failed to resume subscription for admin '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to resume subscription')
  }
}

exports.subscribeToStoragePlan = async function (req, res) {
  const admin = res.locals.admin
  const adminId = admin['admin-id']

  let logChildObject = {}
  try {
    const stripeCustomerId = admin['stripe-customer-id']
    logChildObject = { adminId, stripeCustomerId }
    logger.child(logChildObject).info('Subscribing to Stripe storage plan')

    if (admin['stripe-saas-subscription-status'] !== 'active' || admin['stripe-cancel-saas-subscription-at']) throw {
      status: statusCodes['Payment Required'],
      error: { message: 'Must have an active Userbase subscription.' }
    }

    const subscription = await stripe.getClient().subscriptions.create({
      customer: stripeCustomerId,
      items: [{ plan: stripe.getStripeStoragePlanId() }],
      metadata: { adminId }
    },
      {
        idempotency_key: stripeCustomerId + '_storage_plan_1_TB' // admin can only checkout a single subscription plan
      })

    logger
      .child({ ...logChildObject, subscriptionId: subscription.id, statusCode: statusCodes['Success'] })
      .info('Successfully subscribed to Stripe storage plan')

    return res.send({
      storageSubscriptionStatus: subscription.status,
      sizeAllowed: _getSizeAllowed({ ...admin, 'stripe-storage-subscription-status': subscription.status })
    })
  } catch (e) {
    const message = 'Failed to subscribe to Stripe storage plan.'

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).info(message)
      return res.status(e.status).send(e.error.message)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).error(message)
      return res.status(statusCode).send(message)
    }
  }
}

exports.cancelStorageSubscription = async function (req, res) {
  let logChildObject = {}
  try {
    const { admin } = res.locals
    const adminId = admin['admin-id']
    const subscriptionId = admin['stripe-storage-subscription-id']

    logChildObject = { adminId, subscriptionId, req: trimReq(req) }
    logger.child(logChildObject).info('Canceling storage subscription')

    if (!subscriptionId) throw {
      status: statusCodes['Not Found'],
      error: { message: 'No storage subscription found.' }
    }

    if (admin['stripe-cancel-storage-subscription-at']) return res
      .send(admin['stripe-cancel-storage-subscription-at'])

    const cancelStorageSubscriptionAt = await _cancelSubscription(admin, subscriptionId, 'storage')

    logger
      .child({ ...logChildObject, statusCode: statusCodes['Success'] })
      .info('Successfully canceled storage subscription')

    return res.send({
      cancelStorageSubscriptionAt,
      sizeAllowed: DEFAULT_STORAGE_SIZE
    })
  } catch (e) {
    const message = 'Failed to cancel storage subscription'

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).warn(message)
      return res.status(e.status).send(message)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).warn(message)
      return res.status(statusCode).send(message)
    }
  }
}

exports.resumeStorageSubscription = async function (req, res) {
  let logChildObject = {}
  try {
    const { admin } = res.locals
    const adminId = admin['admin-id']
    const subscriptionId = admin['stripe-storage-subscription-id']

    logChildObject = { adminId, subscriptionId, req: trimReq(req) }
    logger.child(logChildObject).info('Resuming storage subscription')

    if (!subscriptionId) throw {
      status: statusCodes['Not Found'],
      error: { message: 'No storage subscription found.' }
    }

    if (!admin['stripe-cancel-storage-subscription-at']) return res.end()

    const subscription = await stripe.getClient().subscriptions.update(
      subscriptionId,
      { cancel_at_period_end: false }
    )

    await _resumeStripeSubscriptionInDdb(admin, 'storage')

    logger
      .child({ ...logChildObject, statusCode: statusCodes['Success'] })
      .info('Successfully resumed storage subscription')

    return res.send({
      storageSubscriptionStatus: subscription.status,
      sizeAllowed: _getSizeAllowed({
        ...admin,
        'stripe-storage-subscription-status': subscription.status,
        'stripe-cancel-storage-subscription-at': undefined
      })
    })
  } catch (e) {
    const message = 'Failed to resume storage subscription'

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).warn(message)
      return res.status(e.status).send(message)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).warn(message)
      return res.status(statusCode).send(message)
    }
  }
}


exports.subscribeToPaymentsAddOn = async function (req, res) {
  const admin = res.locals.admin
  const adminId = admin['admin-id']

  let logChildObject = {}
  try {
    const stripeCustomerId = admin['stripe-customer-id']
    logChildObject = { adminId, stripeCustomerId }
    logger.child(logChildObject).info('Subscribing to Stripe payments add-on')

    if (admin['stripe-saas-subscription-status'] !== 'active' || admin['stripe-cancel-saas-subscription-at']) throw {
      status: statusCodes['Payment Required'],
      error: { message: 'Must have an active Userbase subscription.' }
    }

    const subscription = await stripe.getClient().subscriptions.create({
      customer: stripeCustomerId,
      items: [{ plan: stripe.getStripePaymentsAddOnPlanId() }],
      metadata: { adminId }
    },
      {
        idempotency_key: stripeCustomerId + '_payments-add-on' // admin can only checkout a single subscription plan
      })

    logger
      .child({ ...logChildObject, subscriptionId: subscription.id, statusCode: statusCodes['Success'] })
      .info('Successfully subscribed to Stripe payments add-on')

    return res.send(subscription.status)
  } catch (e) {
    const message = 'Failed to subscribe to Stripe payments add-on.'

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).info(message)
      return res.status(e.status).send(e.error.message)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).error(message)
      return res.status(statusCode).send(message)
    }
  }
}

exports.cancelPaymentsAddOnSubscription = async function (req, res) {
  let logChildObject = {}
  try {
    const { admin } = res.locals
    const adminId = admin['admin-id']
    const subscriptionId = admin['stripe-payments-add-on-subscription-id']

    logChildObject = { adminId, subscriptionId, req: trimReq(req) }
    logger.child(logChildObject).info('Canceling payments add-on subscription')

    if (!subscriptionId) throw {
      status: statusCodes['Not Found'],
      error: { message: 'No payments add-on subscription found.' }
    }

    if (admin['stripe-cancel-saas-subscription-at']) return res
      .send(admin['stripe-cancel-saas-subscription-at'])

    const cancelAt = await _cancelSubscription(admin, subscriptionId, 'payments-add-on')

    logger
      .child({ ...logChildObject, statusCode: statusCodes['Success'] })
      .info('Successfully canceled payments add-on subscription')

    return res.send(cancelAt)
  } catch (e) {
    const message = 'Failed to cancel payments add-on subscription'

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).warn(message)
      return res.status(e.status).send(message)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).warn(message)
      return res.status(statusCode).send(message)
    }
  }
}

exports.resumePaymentsAddOnSubscription = async function (req, res) {
  let logChildObject = {}
  try {
    const { admin } = res.locals
    const adminId = admin['admin-id']
    const subscriptionId = admin['stripe-payments-add-on-subscription-id']

    logChildObject = { adminId, subscriptionId, req: trimReq(req) }
    logger.child(logChildObject).info('Resuming payments add-on subscription')

    if (!subscriptionId) throw {
      status: statusCodes['Not Found'],
      error: { message: 'No payments add-on subscription found.' }
    }

    if (!admin['stripe-cancel-payments-add-on-subscription-at']) return res.end()

    await stripe.getClient().subscriptions.update(
      subscriptionId,
      { cancel_at_period_end: false }
    )

    await _resumeStripeSubscriptionInDdb(admin, 'payments-add-on')

    logger
      .child({ ...logChildObject, statusCode: statusCodes['Success'] })
      .info('Successfully resumed payments add-on subscription')

    return res.send()
  } catch (e) {
    const message = 'Failed to resume payments add-on subscription'

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).warn(message)
      return res.status(e.status).send(message)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).warn(message)
      return res.status(statusCode).send(message)
    }
  }
}

exports.completeStripeConnection = async function (req, res) {
  let logChildObject
  try {
    const admin = res.locals.admin
    const adminId = admin['admin-id']

    logChildObject = { adminId, req: trimReq(req) }
    logger.child(logChildObject).info('Completing Stripe connection')

    const stripeConnectedAccount = await stripe.getClient().oauth.token({
      grant_type: 'authorization_code',
      code: req.params.authorizationCode,
    })

    const stripeUserId = stripeConnectedAccount.stripe_user_id
    if (!stripeUserId) throw stripeConnectedAccount
    else {
      // successfully authorized user. Now store Stripe account ID in DDB
      logChildObject.stripeAccountId = stripeUserId
      const params = conditionExpressionAdminExists(admin['email'], adminId)

      params.UpdateExpression = 'SET #stripeAccountId = :stripeAccountId'
      params.ExpressionAttributeNames['#stripeAccountId'] = 'stripe-account-id'
      params.ExpressionAttributeValues[':stripeAccountId'] = stripeUserId

      const ddbClient = connection.ddbClient()
      await ddbClient.update(params).promise()
    }

    logger
      .child({ ...logChildObject, statusCode: statusCodes['Success'] })
      .info('Successfully connected Stripe account')

    return res.send('success!')
  } catch (e) {
    const statusCode = statusCodes['Internal Server Error']
    const message = 'Failed to complete Stripe connection'

    logger.child({ ...logChildObject, statusCode, err: e }).error(message)
    return res.status(statusCode).send(message)
  }
}

exports.disconnectStripeAccount = async function (req, res) {
  let logChildObject
  try {
    const admin = res.locals.admin
    const adminId = admin['admin-id']
    const stripeAccountId = admin['stripe-account-id']

    logChildObject = { adminId, stripeAccountId, req: trimReq(req) }
    logger.child(logChildObject).info('Disconnecting Stripe account')

    const params = conditionExpressionAdminExists(admin['email'], adminId)

    params.UpdateExpression = 'REMOVE #stripeAccountId'
    params.ExpressionAttributeNames['#stripeAccountId'] = 'stripe-account-id'

    const ddbClient = connection.ddbClient()
    await ddbClient.update(params).promise()

    logger
      .child({ ...logChildObject, statusCode: statusCodes['Success'] })
      .info('Successfully disconnected Stripe account')

    return res.send('success!')
  } catch (e) {
    const statusCode = statusCodes['Internal Server Error']
    const message = 'Failed to disonnect Stripe account'

    logger.child({ ...logChildObject, statusCode, err: e }).error(message)
    return res.status(statusCode).send(message)
  }
}

exports.generateAccessToken = async function (req, res) {
  let logChildObject
  try {
    const { admin } = res.locals
    const adminId = admin['admin-id']

    logChildObject = { adminId, req: trimReq(req) }
    logger.child(logChildObject).info('Generating access token')

    const label = req.body.label
    if (!label || typeof label !== 'string') throw {
      status: statusCodes['Bad Request'],
      error: { message: 'Missing label' }
    }

    const currentPassword = req.body.currentPassword
    await _validateAdminPassword(currentPassword, admin)

    const accessToken = crypto
      .randomBytes(ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID * 2) // the more bytes the safer
      .toString('base64')

    const creationDate = new Date().toISOString()

    const params = {
      TableName: setup.adminAccessTokensTableName,
      Item: {
        'admin-id': adminId,
        label,
        'access-token': crypto.sha256.hash(accessToken).toString('base64'),
        'creation-date': creationDate,
      },
      ConditionExpression: 'attribute_not_exists(#adminId)',
      ExpressionAttributeNames: {
        '#adminId': 'admin-id'
      }
    }

    try {
      const ddbClient = connection.ddbClient()
      await ddbClient.put(params).promise()
    } catch (e) {
      if (e.message === 'The conditional request failed') throw {
        status: statusCodes['Conflict'],
        error: { message: 'Label already exists' }
      }
      throw e
    }

    logger.child(logChildObject).info('Generated access token')

    return res.status(statusCodes['Success']).send({
      label,
      accessToken,
      creationDate
    })
  } catch (e) {
    const message = 'Failed to generate access token'

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).warn(message)
      return res.status(e.status).send(e.error.message)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).error(message)
      return res.status(statusCode).send(message)
    }
  }
}

const getAccessTokens = async function (adminId) {
  const params = {
    TableName: setup.adminAccessTokensTableName,
    KeyConditionExpression: '#adminId = :adminId',
    ExpressionAttributeNames: {
      '#adminId': 'admin-id'
    },
    ExpressionAttributeValues: {
      ':adminId': adminId
    }
  }

  const ddbClient = connection.ddbClient()
  let accessTokenResponse = await ddbClient.query(params).promise()
  let accessTokens = accessTokenResponse.Items

  while (accessTokenResponse.LastEvaluatedKey) {
    params.ExclusiveStartKey = accessTokenResponse.LastEvaluatedKey
    accessTokenResponse = await ddbClient.query(params).promise()
    accessTokens.push(...accessTokenResponse.Items)
  }

  return accessTokens.map(accessToken => ({
    label: accessToken['label'],
    creationDate: accessToken['creation-date'],
  }))
}

exports.getAccessTokens = async function (req, res) {
  const { admin } = res.locals
  const adminId = admin['admin-id']

  try {
    logger.child({ adminId, req: trimReq(req) }).info('Getting access tokens')

    const accessTokens = await getAccessTokens(adminId)

    logger.child({ adminId, req: trimReq(req) }).info('Retrieved access tokens')
    return res.send(accessTokens)
  } catch (e) {
    const msg = 'Failed to get access tokens'
    logger.child({ adminId, err: e, req: trimReq(req) }).error(msg)
    return res.status(statusCodes['Internal Server Error']).send(msg)
  }
}

const getAccessToken = async function (accessToken) {
  const accessTokenHash = crypto.sha256.hash(accessToken).toString('base64')

  const params = {
    TableName: setup.adminAccessTokensTableName,
    IndexName: setup.accessTokenIndex,
    KeyConditionExpression: '#accessToken = :accessToken',
    ExpressionAttributeNames: {
      '#accessToken': 'access-token'
    },
    ExpressionAttributeValues: {
      ':accessToken': accessTokenHash
    },
    Select: 'ALL_ATTRIBUTES'
  }

  const ddbClient = connection.ddbClient()
  const accessTokenResponse = await ddbClient.query(params).promise()

  if (!accessTokenResponse || accessTokenResponse.Items.length === 0) return null

  if (accessTokenResponse.Items.length > 1) {
    const errorMsg = `Too many access tokens found with hash ${accessTokenHash}`
    logger.fatal(errorMsg)
    throw new Error(errorMsg)
  }

  return accessTokenResponse.Items[0]
}

const _validateAccessTokenHeader = (req, res) => {
  try {
    const authorizationHeader = req.get('authorization')

    if (!authorizationHeader) throw 'Authorization header missing.'

    const authorizationHeaderValues = authorizationHeader.split(' ')

    const authType = authorizationHeaderValues[0]
    if (!authType || authType !== 'Bearer') throw 'Authorization scheme must be of type Bearer.'

    const accessToken = authorizationHeaderValues[1]

    if (!accessToken) throw 'Access token missing.'
    if (accessToken.length !== BASE_64_STRING_LENGTH_FOR_32_BYTES) throw 'Access token is incorrect length.'

    return accessToken
  } catch (e) {
    res.set('WWW-Authenticate', 'Bearer realm="Acccess to the Admin API"')

    throw {
      status: statusCodes['Bad Request'],
      error: { message: e }
    }
  }
}

exports.deleteAccessToken = async function (req, res) {
  let logChildObject
  try {
    const { admin } = res.locals
    const adminId = admin['admin-id']

    const label = req.body.label

    logChildObject = { adminId, label, req: trimReq(req) }
    logger.child(logChildObject).info('Deleting access token')

    const params = {
      TableName: setup.adminAccessTokensTableName,
      Key: {
        'admin-id': adminId,
        label
      }
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.delete(params).promise()

    logger.child(logChildObject).info('Deleted access token')

    return res.end()
  } catch (e) {
    const message = 'Failed to delete access token'

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).warn(message)
      return res.status(e.status).send(e.error.message)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).error(message)
      return res.status(statusCode).send(message)
    }
  }
}

exports.authenticateAccessToken = async function (req, res, next) {
  let logChildObject
  try {
    logChildObject = { req: trimReq(req) }
    logger.child(logChildObject).info('Authenticating access token')

    const accessToken = _validateAccessTokenHeader(req, res)

    const accessTokenItem = await getAccessToken(accessToken)
    if (!accessTokenItem) throw {
      status: statusCodes['Unauthorized'],
      error: { message: 'Access token invalid.' }
    }

    const adminId = accessTokenItem['admin-id']
    const admin = await findAdminByAdminId(adminId)
    if (!admin || admin['deleted']) {
      logChildObject.deletedAdminId = admin && admin['admin-id']
      throw {
        status: statusCodes['Unauthorized'],
        error: { message: 'Access token invalid.' }
      }
    } else {
      logChildObject.adminId = admin['admin-id']
    }

    logger.child(logChildObject).info('Successfully authenticated access token')

    res.locals.admin = admin
    res.locals.logChildObject = logChildObject
    next()
  } catch (e) {
    const message = 'Failed to authenticate access token'

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).warn(message)
      return res.status(e.status).send(e.error)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).error(message)
      return res.status(statusCode).send({ message })
    }
  }
}

exports.getAdminAccount = async function (req, res) {
  const admin = res.locals.admin
  return res.send(_buildAdminResult(admin))
}

const prodPaymentsEnabled = (admin) => {
  const saasStatus = admin['stripe-saas-subscription-status']
  const cancelSaasAt = admin['stripe-cancel-saas-subscription-at']

  const addOnStatus = admin['stripe-payments-add-on-subscription-status']
  const cancelAddOnAt = admin['stripe-cancel-payments-add-on-subscription']

  return (
    (saasStatus === 'active' && !cancelSaasAt) &&
    (addOnStatus === 'active' && !cancelAddOnAt)
  )
}
exports.prodPaymentsEnabled = prodPaymentsEnabled

const saasSubscriptionNotActive = (admin) => {
  return (admin['stripe-saas-subscription-status'] !== 'active' || admin['stripe-cancel-saas-subscription-at']) &&
    admin['alt-saas-subscription-status'] !== 'active'
}
exports.saasSubscriptionNotActive = saasSubscriptionNotActive
