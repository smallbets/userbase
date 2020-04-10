import errors from './errors'

const VERSION = '/v1'
const DEFAULT_ENDPOINT = 'https://v1.userbase.com' + VERSION

const STRIPE_PRODUCTION_PUBLISHABLE_KEY = 'pk_live_jI6lbsAIQlu2u4uTkDXFrSEW'
const STRIPE_TEST_PUBLISHABLE_KEY = 'pk_test_rYANrLdNfdJXJ2d808wW4pqY'

let userbaseAppId = null

const REMEMBER_ME_OPTIONS = {
  local: true,
  session: true,
  none: true
}

const getAppId = () => {
  if (!userbaseAppId) throw new errors.AppIdNotSet
  return userbaseAppId
}

const getEndpoint = () => {
  return window._userbaseEndpoint || DEFAULT_ENDPOINT
}

const setAppId = (appId) => {
  if (userbaseAppId && userbaseAppId !== appId) throw new errors.AppIdAlreadySet(userbaseAppId)
  if (typeof appId !== 'string') throw new errors.AppIdMustBeString
  if (appId.length === 0) throw new errors.AppIdCannotBeBlank
  userbaseAppId = appId
}

const configure = ({ appId }) => {
  setAppId(appId)
}

const getStripePublishableKey = (isProduction) => {
  return isProduction
    ? (window._USERBASE_STRIPE_PRODUCTION_PUBLISHABLE_KEY || STRIPE_PRODUCTION_PUBLISHABLE_KEY)
    : (window._USERBASE_STRIPE_TEST_PUBLISHABLE_KEY || STRIPE_TEST_PUBLISHABLE_KEY)
}

export default {
  REMEMBER_ME_OPTIONS,
  getAppId,
  getEndpoint,
  configure,
  getStripePublishableKey,
}
