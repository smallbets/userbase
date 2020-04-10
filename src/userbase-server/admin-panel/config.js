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
