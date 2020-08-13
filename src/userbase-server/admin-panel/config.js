import { v4 as uuidv4 } from 'uuid'

export const VERSION = 'v1'

const isProd = window.location.host === 'v1.userbase.com'

const stripePk = isProd
  ? 'pk_live_jI6lbsAIQlu2u4uTkDXFrSEW'
  : 'pk_test_rYANrLdNfdJXJ2d808wW4pqY'

export const STRIPE = window.Stripe(stripePk)

export const STRIPE_CLIENT_ID = isProd
  ? 'ca_GqwvhgXHQNhdWgsy23PiMO3v3TIDQrGr'
  : 'ca_GqwvowzyZv7NU34cyEpZkUA9MMZUGjb0'

export const getStripeState = () => {
  let state = localStorage.getItem('stripeState')
  if (!state) {
    state = uuidv4()
    localStorage.setItem('stripeState', state)
  }
  return state
}

export const getStripeCancelWarning = (usePlural) => `\n\nWarning! If you have any customers subscribed to your ${usePlural ? 'apps' : 'app'}, you will need to cancel their subscriptions manually in the Stripe dashboard.`

export const PAYMENTS_ADD_ON_PRICE = 129

export const STORAGE_PLAN_1_TB_PRICE = 299

export const METERED_COST_PER_GB = .10
