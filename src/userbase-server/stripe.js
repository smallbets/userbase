import Stripe from 'stripe'
import logger from './logger'
import statusCodes from './statusCodes'
import userController from './user'
import adminController from './admin'

let client
const getClient = () => {
  if (client) return client

  const stripeSecretKey = process.env['sm.STRIPE_SECRET_KEY']
  if (!stripeSecretKey) throw new Error('Missing Stripe secret key')

  client = Stripe(stripeSecretKey)
  return client
}

const getWebhookSecret = () => {
  const webhookSecret = process.env['sm.STRIPE_WEBHOOK_SECRET']
  if (!webhookSecret) throw new Error('Missing Stripe webhook secret')
  return webhookSecret
}

const getStripeSaasSubscriptionPlanId = () => {
  const saasSubscriptionPlanId = process.env['sm.STRIPE_SAAS_SUBSCRIPTION_PLAN_ID']
  if (!saasSubscriptionPlanId) throw new Error('Missing Stripe SaaS subscription plan ID')
  return saasSubscriptionPlanId
}

const getStripePaymentsAddOnPlanId = () => {
  const paymentsAddOnPlanId = process.env['sm.STRIPE_PAYMENTS_ADD_ON_PLAN_ID']
  if (!paymentsAddOnPlanId) throw new Error('Missing Stripe payments add-on plan ID')
  return paymentsAddOnPlanId
}

const _payUnpaidSubscription = async function (subscription, payment_method, stripe_account) {
  const latestInvoiceId = subscription.latest_invoice

  await getClient().invoices.pay(
    latestInvoiceId,
    { payment_method },
    { stripe_account }
  )
}

const _handleUpdateOrDeleteSubscription = async (logChildObject, subscription, stripeEventTimestamp, logs, stripeAccountId) => {
  try {
    const metadata = subscription.metadata

    const subscriptionId = subscription.id
    const subscriptionPlanId = subscription.items.data[0].plan.id
    const customerId = subscription.customer
    const status = subscription.status
    const cancelAt = subscription.cancel_at && convertStripeTimestamptToIsoString(subscription.cancel_at)
    const isProduction = subscription.livemode

    logChildObject.subscriptionId = subscriptionId
    logChildObject.subscriptionPlanId = subscriptionPlanId
    logChildObject.customerId = customerId
    logChildObject.subscriptionStatus = status
    logChildObject.cancelSubscriptionAt = cancelAt
    logChildObject.isProduction = isProduction
    logChildObject.stripeEventTimestamp = stripeEventTimestamp

    if (stripeAccountId) {
      await userController.updateSubscriptionInDdb(logChildObject, logs, metadata, customerId, subscriptionId, subscriptionPlanId, status, cancelAt, stripeEventTimestamp, isProduction, stripeAccountId)
    } else {
      await adminController.updateSubscriptionInDdb(logChildObject, logs, metadata, customerId, subscriptionId, subscriptionPlanId, status, cancelAt, stripeEventTimestamp)
    }

    logger.child(logChildObject).info(logs.successLog)
  } catch (e) {

    if (e.name === 'ConditionalCheckFailedException') {
      // no need to cause the webhook to fail for this
      logger.child({ ...logChildObject, err: { message: 'A more recent Stripe event is already stored.' } }).warn(logs.issueLog)
    } else {
      logger.child({ ...logChildObject, err: e }).error(logs.failLog)
      throw e
    }

  }
}

const _updateStripePaymentMethod = async function (logChildObject, session, stripe_account = undefined) {
  const setupIntent = await getClient().setupIntents.retrieve(session.setup_intent, { stripe_account })
  const { payment_method, metadata: { customer_id, subscription_id } } = setupIntent

  logChildObject.customerId = customer_id
  const type = stripe_account ? 'user' : 'admin'
  logger.child(logChildObject).info(`Updating ${type}'s payment method`)

  await getClient().paymentMethods.attach(
    payment_method,
    { customer: customer_id },
    { stripe_account }
  )
  const customer = await getClient().customers.update(
    customer_id,
    { invoice_settings: { default_payment_method: payment_method } },
    { stripe_account }
  )

  logger.child(logChildObject).info(`Successfully updated ${type}'s payment method`)

  // use customer's new credit card to pay for unpaid subscription(s)
  if (subscription_id) {
    // pay off the subscription passed in as metadata
    const subscription = customer.subscriptions.data.find(subscription => subscription.id === subscription_id)
    if (subscription && (subscription.status === 'past_due' || subscription.status === 'unpaid')) {
      await _payUnpaidSubscription(subscription, payment_method, stripe_account)
      logger.child(logChildObject).info(`Successfully charged ${type} with updated payment method`)
    }

  } else {
    // pay off all of a customer's unpaid subscriptions if no subscription provided in metadata
    const unpaidSubscriptions = customer.subscriptions.data.filter(subscription => subscription.status === 'past_due' || subscription.status === 'unpaid')
    await Promise.all(unpaidSubscriptions.map(subscription => _payUnpaidSubscription(subscription, payment_method)))

    if (unpaidSubscriptions.length) logger.child(logChildObject).info(`Successfully charged ${type} with updated payment method`)
  }
}

const convertStripeTimestamptToIsoString = timestamp => new Date(timestamp * 1000).toISOString()

const _saveDefaultPaymetMethod = async (subscription, stripe_account) => {
  const { customer, default_payment_method } = subscription
  await getClient().customers.update(
    customer,
    { invoice_settings: { default_payment_method } },
    { stripe_account }
  )
}

const _handleCheckoutSubscriptionCompleted = async (logChildObject, session, stripe_account) => {
  const customerId = session.customer
  const subscriptionId = session.subscription
  const planId = session.display_items[0].plan.id
  const isProduction = session.livemode

  logChildObject.customerId = customerId
  logChildObject.subscriptionId = subscriptionId
  logChildObject.subscriptionPlanId = planId
  logChildObject.isProduction = isProduction

  const type = stripe_account ? 'user' : 'admin'
  logger.child(logChildObject).info(`Fulfilling ${type}'s subscription payment`)

  const subscription = await getClient().subscriptions.retrieve(subscriptionId, { stripe_account })

  await _saveDefaultPaymetMethod(subscription, stripe_account)

  logger.child(logChildObject).info(`Successfully fulfilled ${type}'s subscription payment`)

  return logChildObject
}

const _handleCustomerSubscription = async (logChildObject, eventType, subscription, stripeEventTimestamp, stripeAccountId = undefined) => {
  const type = stripeAccountId ? 'connected account' : 'admin'

  const logs = {}
  switch (eventType) {
    case 'customer.subscription.created': {
      logs.startingLog = `Saving ${type} subscription`
      logs.successLog = `Successfully saved ${type} subscription`
      logs.issueLog = `Issue saving ${type} subscription`
      logs.failLog = `Failed to save ${type} subscription`
      break
    }
    case 'customer.subscription.updated': {
      logs.startingLog = `Updating ${type} subscription`
      logs.successLog = `Successfully updated ${type} subscription`
      logs.issueLog = `Issue updating ${type} subscription`
      logs.failLog = `Failed to update ${type} subscription`
      break
    }
    case 'customer.subscription.deleted': {
      logs.startingLog = `Deleting ${type} subscription`
      logs.successLog = `Successfully deleted ${type} subscription`
      logs.issueLog = `Issue deleting ${type} subscription`
      logs.failLog = `Failed to delete ${type} subscription`
      break
    }
  }

  await _handleUpdateOrDeleteSubscription(logChildObject, subscription, stripeEventTimestamp, logs, stripeAccountId)
}

const _handleCheckoutSessionCompleted = async (logChildObject, session, stripeAccountId) => {
  if (session.mode === 'subscription') {
    await _handleCheckoutSubscriptionCompleted(logChildObject, session, stripeAccountId)
  } else if (session.mode === 'setup') {
    await _updateStripePaymentMethod(logChildObject, session, stripeAccountId)
  }
}

const handleWebhook = async function (req, res) {
  let logChildObject = {}
  try {
    const event = getClient().webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      getWebhookSecret()
    )
    logChildObject.event = event.id
    logChildObject.eventType = event.type

    // the account is only provided if a Connect account originated the event
    const stripeAccountId = event.account
    logChildObject.stripeAccountId = stripeAccountId
    logger.child(logChildObject).info(`Received Stripe ${stripeAccountId ? 'Connect ' : ''}webhook event`)

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        await _handleCheckoutSessionCompleted(logChildObject, session, stripeAccountId)
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const stripeEventTimestamp = event.created
        await _handleCustomerSubscription(logChildObject, event.type, subscription, stripeEventTimestamp, stripeAccountId)
        break
      }
    }

    logger.child(logChildObject).info(`Successfully handled Stripe ${stripeAccountId ? 'Connect ' : ''}webhook event`)

    res.json({ received: true })
  } catch (e) {
    const message = `Failed to handle Stripe ${logChildObject.stripeAccountId ? 'Connect ' : ''}webhook event`

    if (e.status && e.error) {
      logger.child({ ...logChildObject, statusCode: e.status, err: e.error }).warn(message)
      return res.status(e.status).send(e.error)
    } else {
      const statusCode = statusCodes['Internal Server Error']
      logger.child({ ...logChildObject, statusCode, err: e }).warn(message)
      return res.status(statusCode).send(e)
    }
  }
}

export default {
  getClient,
  getStripeSaasSubscriptionPlanId,
  getStripePaymentsAddOnPlanId,
  convertStripeTimestamptToIsoString,
  handleWebhook,
}
