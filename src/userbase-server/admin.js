import uuidv4 from 'uuid/v4'
import crypto from './crypto'
import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import logger from './logger'
import appController from './app'
import userController from './user'
import { validateEmail } from './utils'
import stripe from './stripe'

// source: https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Session_Management_Cheat_Sheet.md#session-id-length
const ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID = 16
const SESSION_COOKIE_NAME = 'adminSessionId'

const HOURS_IN_A_DAY = 24
const SECONDS_IN_A_DAY = 60 * 60 * HOURS_IN_A_DAY
const MS_IN_A_DAY = 1000 * SECONDS_IN_A_DAY
const SESSION_LENGTH = MS_IN_A_DAY

const createSession = async function (adminId) {
  const sessionId = crypto
    .randomBytes(ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID)
    .toString('hex')

  const session = {
    'session-id': sessionId,
    'admin-id': adminId,
    'creation-date': new Date().toISOString()
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
    if (e.data === 'Admin already exists') throw e

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
    return res.end()
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
        .status(statusCodes['Unauthorized'])
        .send('Incorrect password')
    }

    const [sessionId, subscription] = await Promise.all([
      createSession(admin['admin-id']),
      getSaasSubscription(admin['admin-id'], admin['stripe-customer-id'])
    ])

    setSessionCookie(res, sessionId)

    return res
      .status(statusCodes['Success'])
      .send({
        fullName: admin['full-name'],
        paymentStatus: subscription && (subscription.cancel_at_period_end ? 'cancel_at_period_end' : subscription.status)
      })
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
    .send('Missing session token')

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
    const app = await appController.getApp(adminId, appName)
    if (!app || app['deleted']) return res.status(statusCodes['Not Found']).send('App not found')

    await userController.deleteUser(username, app['app-id'], userId, adminId, appName)

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

    const existingUserParams = {
      TableName: setup.usersTableName,
      Key: {
        username,
        'app-id': app['app-id']
      },
      ConditionExpression: 'attribute_exists(deleted) and #userId = :userId',
      ExpressionAttributeNames: {
        '#userId': 'user-id'
      },
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }

    const permanentDeletedUserParams = {
      TableName: setup.deletedUsersTableName,
      Item: {
        ...user // still technically can recover user before data is purged, though more difficult
      },
      ConditionExpression: 'attribute_not_exists(#userId)',
      ExpressionAttributeNames: {
        '#userId': 'user-id'
      },
    }

    const transactionParams = {
      TransactItems: [
        { Delete: existingUserParams },
        { Put: permanentDeletedUserParams }
      ]
    }

    const ddbClient = connection.ddbClient()
    await ddbClient.transactWrite(transactionParams).promise()

    return res.end()
  } catch (e) {
    if (e.message.includes('ConditionalCheckFailed]')) {
      return res.status(statusCodes['Conflict']).send('User already permanently deleted')
    }

    logger.error(`Failed to permanently delete user '${userId}' from admin '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to permanently delete user')
  }
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
  const email = req.query.email && req.query.email.toLowerCase()

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
      + 'Someone has requested you forgot your password to your Userbase admin account!'
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
    ConditionExpression: '#adminId = :adminId and attribute_not_exists(deleted)',
    ExpressionAttributeValues: {
      ':adminId': adminId
    },
    ExpressionAttributeNames: {
      '#adminId': 'admin-id'
    }
  }
}

const _updateAdminExcludingEmailUpdate = async (oldAdmin, adminId, password, fullName) => {
  const params = conditionExpressionAdminExists(oldAdmin['email'], adminId)

  let UpdateExpression = 'SET '

  if (password) {
    UpdateExpression += '#passwordHash = :passwordHash'
    params.ExpressionAttributeNames['#passwordHash'] = 'password-hash'
    params.ExpressionAttributeValues[':passwordHash'] = await crypto.bcrypt.hash(password)
  }

  if (fullName) {
    UpdateExpression += (password ? ', ' : '') + '#fullName = :fullName'
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

const _updateAdminIncludingEmailUpdate = async (oldAdmin, adminId, email, password, fullName) => {
  // if updating email, need to Delete existing DDB item and Put new one because email is partition key
  const deleteAdminParams = conditionExpressionAdminExists(oldAdmin['email'], adminId)

  const updatedAdmin = {
    ...oldAdmin,
    email
  }

  if (password) updatedAdmin['password-hash'] = await crypto.bcrypt.hash(password)

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
    const password = req.body.password
    const fullName = req.body.fullName

    if (email) {
      if (email === admin['email']) return res.status(statusCodes['Conflict']).send('Email must be different')
      if (!validateEmail(email)) return res.status(statusCodes['Bad Request']).send('Invalid Email')

      // ok if 1 fails and other succeeds. It's undesirable, but ok if they are out of sync since
      // Stripe Checkout allows for customers to change their email at the point of checkout anyway
      await Promise.all([
        _updateAdminIncludingEmailUpdate(admin, adminId, email, password, fullName),
        stripe.getClient().customers.update(stripeCustomerId, { email })
      ])
    } else {
      if (!password && !fullName) return res.status(statusCodes['Bad Request']).send('Missing required items')
      await _updateAdminExcludingEmailUpdate(admin, adminId, password, fullName)
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

exports.deleteAdmin = async function (req, res) {
  const admin = res.locals.admin
  const email = admin['email']
  const adminId = admin['admin-id']

  const subscription = res.locals.subscription

  try {
    if (subscription && !subscription.cancel_at_period_end) {
      await stripe.getClient().subscriptions.update(subscription.id, { cancel_at_period_end: true })
    }

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

const createStripeCustomer = async function (email, adminId) {
  // There may be multiple Stripe customers with same admin ID. Only one that
  // matters to us is the one that ultimately gets stored on the admin in DDB
  const stripeCustomer = await stripe.getClient().customers.create({
    email,
    metadata: { adminId }
  })
  const stripeCustomerId = stripeCustomer.id

  const params = {
    TableName: setup.adminTableName,
    Key: {
      email
    },
    UpdateExpression: 'set #stripeCustomerId = :stripeCustomerId',
    // only 1 stripe customer id can ever be saved on an admin
    ConditionExpression: 'attribute_not_exists(#stripeCustomerId)',
    ExpressionAttributeNames: {
      '#stripeCustomerId': 'stripe-customer-id',
    },
    ExpressionAttributeValues: {
      ':stripeCustomerId': stripeCustomerId,
    }
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.update(params).promise()
  } catch (e) {
    if (e && e.name === 'ConditionalCheckFailedException') {
      await stripe.getClient().customers.del(stripeCustomerId)
    }
    throw e
  }

  return stripeCustomerId
}

exports.createSaasPaymentSession = async function (req, res) {
  const admin = res.locals.admin
  const adminId = admin['admin-id']

  try {
    const stripeCustomerId = admin['stripe-customer-id'] || await createStripeCustomer(admin['email'], adminId)

    const session = await stripe.getClient().checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      subscription_data: {
        items: [{
          plan: stripe.getStripeSaasSubscriptionPlanId(),
        }]
      },
      success_url: `${process.env['STRIPE_REDIRECT_URL'] || req.headers.referer}#success`,
      cancel_url: `${process.env['STRIPE_REDIRECT_URL'] || req.headers.referer}#edit-account`,
    },
      {
        idempotency_key: stripeCustomerId // admin can only checkout a single subscription plan
      })

    return res.send(session.id)
  } catch (e) {
    logger.error(`Failed to create SaaS payment session for admin '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to create payment session')
  }
}

exports.updateSaasSubscriptionPaymentSession = async function (req, res) {
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
          customer_id: stripeCustomerId,
          subscription_id: res.locals.subscription.id
        },
      },
      success_url: `${process.env['STRIPE_REDIRECT_URL'] || req.headers.referer}#update-success`,
      cancel_url: `${process.env['STRIPE_REDIRECT_URL'] || req.headers.referer}#edit-account`,
    })

    return res.send(session.id)
  } catch (e) {
    logger.error(`Failed to generate update SaaS payment session for admin '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to update payment session')
  }
}

const updateStripePaymentMethod = async function (session) {
  const setupIntent = await stripe.getClient().setupIntents.retrieve(session.setup_intent)
  const { payment_method, metadata: { customer_id, subscription_id } } = setupIntent

  await stripe.getClient().paymentMethods.attach(
    payment_method,
    {
      customer: customer_id,
    }
  )
  await stripe.getClient().customers.update(
    customer_id,
    {
      invoice_settings: { default_payment_method: payment_method },
    }
  )
  logger.info(`Successfully updated payment method for admin with Stripe customer id ${customer_id}`)

  const subscription = await stripe.getClient().subscriptions.retrieve(subscription_id)
  if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
    const latestInvoiceId = subscription.latest_invoice

    await stripe.getClient().invoices.pay(latestInvoiceId, { payment_method })
    logger.info(`Successfully charged admin with Stripe customer id ${customer_id} with updated payment method`)
  }
}

exports.handleStripeWebhook = async function (req, res) {
  try {
    const event = stripe.getClient().webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      stripe.getWebhookSecret()
    )

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object

      if (session.mode === 'setup') {
        await updateStripePaymentMethod(session)
      }
    }

    res.json({ received: true })
  } catch (err) {
    logger.warn(`Stripe webhook failed with ${err}`)
    return res.status(statusCodes['Bad Request']).send(`Webhook Error: ${err.message}`)
  }
}

const getSaasSubscription = async function (adminId, stripeCustomerId) {
  if (!stripeCustomerId) return null

  const customer = await stripe.getClient().customers.retrieve(stripeCustomerId)

  if (customer.subscriptions.data.length > 1) {
    logger.fatal(`Admin ${adminId} has more than 1 subscription (${customer.subscriptions.data.length} total)`)
  }

  return customer.subscriptions.data.find((subscription => {  // eslint-disable-line require-atomic-updates
    return subscription.plan.id === stripe.getStripeSaasSubscriptionPlanId()
  }))
}
exports.getSaasSubscription = getSaasSubscription

exports.getSaasSubscriptionController = async function (req, res, next) {
  const admin = res.locals.admin
  const adminId = admin['admin-id']
  const stripeCustomerId = admin['stripe-customer-id']

  try {
    res.locals.subscription = await getSaasSubscription(adminId, stripeCustomerId)
    next()
  } catch (e) {
    logger.error(`Failed to verify subscription payment for admin '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to verify subscription payment')
  }
}

exports.cancelSaasSubscription = async function (req, res) {
  const { admin, subscription } = res.locals
  const adminId = admin['admin-id']

  if (!subscription) return res.status(statusCodes['Not Found']).send('No subscription found')
  if (subscription.cancel_at_period_end) return res.end()

  try {
    await stripe.getClient().subscriptions.update(subscription.id, {
      cancel_at_period_end: true
    })

    // subscription status will remain active, but cancel_at_period_end boolean will be set to true
    return res.send('cancel_at_period_end')
  } catch (e) {
    logger.error(`Failed to cancel subscription for admin '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to cancel subscription')
  }
}

exports.resumeSaasSubscription = async function (req, res) {
  const { admin, subscription } = res.locals
  const adminId = admin['admin-id']

  if (!subscription) return res.status(statusCodes['Not Found']).send('No subscription found')
  if (!subscription.cancel_at_period_end) return res.end()

  try {
    const updatedSubscription = await stripe.getClient().subscriptions.update(subscription.id, {
      cancel_at_period_end: false,
      items: [{
        id: subscription.items.data[0].id,
        plan: subscription.plan.id,
      }]
    })

    return res.send(updatedSubscription.status)
  } catch (e) {
    logger.error(`Failed to resume subscription for admin '${adminId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to resume subscription')
  }
}
