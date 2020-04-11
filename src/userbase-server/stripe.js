import Stripe from 'stripe'
import logger from './logger'

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

const getConnectWebhookSecret = () => {
  const webhookSecret = process.env['sm.STRIPE_CONNECT_WEBHOOK_SECRET']
  if (!webhookSecret) throw new Error('Missing Stripe Connect webhook secret')
  return webhookSecret
}

const getStripeSaasSubscriptionPlanId = () => {
  const saasSubscriptionPlanId = process.env['sm.STRIPE_SAAS_SUBSCRIPTION_PLAN_ID']
  if (!saasSubscriptionPlanId) throw new Error('Missing Stripe SaaS subscription plan ID')
  return saasSubscriptionPlanId
}

const updateStripePaymentMethod = async function (logChildObject, session, stripe_account = undefined) {
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
  await getClient().customers.update(
    customer_id,
    { invoice_settings: { default_payment_method: payment_method } },
    { stripe_account }
  )

  logger.child(logChildObject).info(`Successfully updated ${type}'s payment method`)

  const subscription = await getClient().subscriptions.retrieve(
    subscription_id,
    { stripe_account }
  )

  if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
    const latestInvoiceId = subscription.latest_invoice

    await getClient().invoices.pay(
      latestInvoiceId,
      { payment_method },
      { stripe_account }
    )

    logger.child(logChildObject).info(`Successfully charged ${type} with updated payment method`)
  }
}

const convertStripeTimestamptToIsoString = timestamp => new Date(timestamp * 1000).toISOString()

export default {
  getClient,
  getWebhookSecret,
  getConnectWebhookSecret,
  getStripeSaasSubscriptionPlanId,
  updateStripePaymentMethod,
  convertStripeTimestamptToIsoString,
}
