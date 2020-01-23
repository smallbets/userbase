export const VERSION = 'v1'

const isProd = window.location.host === 'v1.userbase.com'

const stripePk = isProd
  ? 'pk_live_jI6lbsAIQlu2u4uTkDXFrSEW'
  : 'pk_test_rYANrLdNfdJXJ2d808wW4pqY'

export const STRIPE = window.Stripe(stripePk)
