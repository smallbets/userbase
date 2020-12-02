import errors from './errors'

const USERBASE_JS_VERSION = '2.4.2'

const VERSION = '/v1'
const DEFAULT_ENDPOINT = 'https://v1.userbase.com' + VERSION

const STRIPE_PRODUCTION_PUBLISHABLE_KEY = 'pk_live_jI6lbsAIQlu2u4uTkDXFrSEW'
const STRIPE_TEST_PUBLISHABLE_KEY = 'pk_test_rYANrLdNfdJXJ2d808wW4pqY'

let userbaseAppId = null
let userbaseUpdateUserHandler = null
let userbaseAllowServerSideEncryptionMode = false

const getAppId = () => {
  if (!userbaseAppId) throw new errors.AppIdNotSet
  return userbaseAppId
}

const getUpdateUserHandler = () => userbaseUpdateUserHandler

const getEndpoint = () => {
  return window._userbaseEndpoint || DEFAULT_ENDPOINT
}

const configure = ({ appId, updateUserHandler, allowServerSideEncryption }) => {
  if (userbaseAppId && userbaseAppId !== appId) throw new errors.AppIdAlreadySet(userbaseAppId)
  userbaseAppId = appId
  userbaseUpdateUserHandler = updateUserHandler
  userbaseAllowServerSideEncryptionMode = allowServerSideEncryption
}

const getStripePublishableKey = (isProduction) => {
  return isProduction
    ? (window._USERBASE_STRIPE_PRODUCTION_PUBLISHABLE_KEY || STRIPE_PRODUCTION_PUBLISHABLE_KEY)
    : (window._USERBASE_STRIPE_TEST_PUBLISHABLE_KEY || STRIPE_TEST_PUBLISHABLE_KEY)
}

const isServerSideEncryptionModeAllowed = () => userbaseAllowServerSideEncryptionMode

export default {
  USERBASE_JS_VERSION,
  getAppId,
  getUpdateUserHandler,
  getEndpoint,
  configure,
  getStripePublishableKey,
  isServerSideEncryptionModeAllowed,
}
