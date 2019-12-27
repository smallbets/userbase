import Stripe from 'stripe'

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

export default {
  getClient,
  getWebhookSecret,
  getStripeSaasSubscriptionPlanId
}
