import ws from './ws'
import errors from './errors'
import statusCodes from './statusCodes'
import { objectHasOwnProperty, getProtocolFromEndpoint } from './utils'
import config from './config'

const _parseGenericErrors = (e) => {
  if (e.response) {
    if (e.response.status === statusCodes['Internal Server Error']) {
      throw new errors.InternalServerError
    } else if (e.response.status === statusCodes['Gateway Timeout']) {
      throw new errors.Timeout
    }
  } else if (e.message && e.message.includes('timeout')) {
    throw new errors.Timeout
  }
}

const _validatePurchaseOrUpdate = (params) => {
  if (ws.reconnecting) throw new errors.Reconnecting
  if (!ws.keys.init) throw new errors.UserNotSignedIn

  const stripeData = ws.userData.stripeData
  if (!stripeData.stripeAccountId) throw new errors.StripeAccountNotConnected
  if (stripeData.paymentsMode === 'disabled') throw new errors.PaymentsDisabled

  if (!objectHasOwnProperty(window, 'Stripe')) throw new errors.StripeJsLibraryMissing

  if (typeof params !== 'object') throw new errors.ParamsMustBeObject

  if (!objectHasOwnProperty(params, 'successUrl')) throw new errors.SuccessUrlMissing
  if (typeof params.successUrl !== 'string') throw new errors.SuccessUrlMustBeString
  const successUrlProtocol = getProtocolFromEndpoint(params.successUrl)
  if (successUrlProtocol !== 'http' && successUrlProtocol !== 'https') {
    const invalidProtocol = true
    throw new errors.SuccessUrlInvalid(invalidProtocol)
  }

  if (!objectHasOwnProperty(params, 'cancelUrl')) throw new errors.CancelUrlMissing
  if (typeof params.cancelUrl !== 'string') throw new errors.CancelUrlMustBeString
  const cancelUrlProtocol = getProtocolFromEndpoint(params.cancelUrl)
  if (cancelUrlProtocol !== 'http' && cancelUrlProtocol !== 'https') {
    const invalidProtocol = true
    throw new errors.CancelUrlInvalid(invalidProtocol)
  }
}

const purchaseSubscription = async (params) => {
  try {
    const stripeData = ws.userData.stripeData
    if (stripeData.subscriptionStatus && stripeData.subscriptionStatus !== 'canceled') {
      throw new errors.SubscriptionPlanAlreadyPurchased
    }
    _validatePurchaseOrUpdate(params)

    try {
      const action = 'PurchaseSubscription'
      const sessionIdResponse = await ws.request(action, params)
      const stripeSessionId = sessionIdResponse.data

      const stripePk = config.getStripePublishableKey(stripeData.paymentsMode === 'prod')

      const result = await window
        .Stripe(stripePk, { stripeAccount: stripeData.stripeAccountId })
        .redirectToCheckout({ sessionId: stripeSessionId })

      if (result.error) throw result.error

    } catch (e) {
      _parseGenericErrors(e)

      if (e.response) {
        if (e.response.data === 'SubscriptionPlanNotSet') {
          throw new errors.SubscriptionPlanNotSet
        } else if (e.response.data === 'SubscriptionPlanAlreadyPurchased') {
          throw new errors.SubscriptionPlanAlreadyPurchased
        } else if (e.response.data === 'SuccessUrlInvalid') {
          throw new errors.SuccessUrlInvalid
        } else if (e.response.data === 'CancelUrlInvalid') {
          throw new errors.CancelUrlInvalid
        } else if (e.response.data && e.response.data.name === 'StripeError') {
          throw new errors.StripeError(e.response.data)
        }
      }

      throw e
    }

  } catch (e) {

    switch (e.name) {
      case 'ParamsMustBeObject':
      case 'SuccessUrlMissing':
      case 'SuccessUrlMustBeString':
      case 'SuccessUrlInvalid':
      case 'CancelUrlMissing':
      case 'CancelUrlMustBeString':
      case 'CancelUrlInvalid':
      case 'StripeError':
      case 'StripeJsLibraryMissing':
      case 'SubscriptionPlanNotSet':
      case 'SubscriptionPlanAlreadyPurchased':
      case 'StripeAccountNotConnected':
      case 'PaymentsDisabled':
      case 'UserNotSignedIn':
      case 'TooManyRequests':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }
  }
}

const _validateModifySubscriptionConditions = () => {
  if (ws.reconnecting) throw new errors.Reconnecting
  if (!ws.keys.init) throw new errors.UserNotSignedIn

  const stripeData = ws.userData.stripeData
  if (!stripeData.stripeAccountId) throw new errors.StripeAccountNotConnected
  if (stripeData.paymentsMode === 'disabled') throw new errors.PaymentsDisabled

  if (stripeData.subscriptionStatus === 'canceled') throw new errors.SubscriptionAlreadyCanceled
}

const cancelSubscription = async () => {
  try {
    _validateModifySubscriptionConditions()

    try {
      const action = 'CancelSubscription'
      const cancelResponse = await ws.request(action)
      const cancelSubscriptionAt = cancelResponse.data

      ws.userData.stripeData.cancelAt = cancelSubscriptionAt
      return { cancelSubscriptionAt }
    } catch (e) {
      _parseGenericErrors(e)

      if (e.response && e.response.data === 'SubscriptionPlanNotSet') {
        throw new errors.SubscriptionPlanNotSet
      }

      throw e
    }

  } catch (e) {

    switch (e.name) {
      case 'SubscriptionPlanNotSet':
      case 'StripeAccountNotConnected':
      case 'PaymentsDisabled':
      case 'SubscriptionAlreadyCanceled':
      case 'UserNotSignedIn':
      case 'TooManyRequests':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }
  }
}

const resumeSubscription = async () => {
  try {
    _validateModifySubscriptionConditions()

    try {
      const action = 'ResumeSubscription'
      await ws.request(action)

      delete ws.userData.stripeData.cancelAt
    } catch (e) {
      _parseGenericErrors(e)

      if (e.response && e.response.data === 'SubscriptionPlanNotSet') {
        throw new errors.SubscriptionPlanNotSet
      }

      throw e
    }

  } catch (e) {

    switch (e.name) {
      case 'SubscriptionPlanNotSet':
      case 'StripeAccountNotConnected':
      case 'PaymentsDisabled':
      case 'SubscriptionAlreadyCanceled':
      case 'UserNotSignedIn':
      case 'TooManyRequests':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }
  }
}

const updatePaymentMethod = async (params) => {
  try {
    _validatePurchaseOrUpdate(params)

    const stripeData = ws.userData.stripeData
    if (!stripeData.subscriptionStatus) throw new errors.SubscriptionNotPurchased

    try {
      const action = 'UpdatePaymentMethod'
      const sessionIdResponse = await ws.request(action, params)
      const stripeSessionId = sessionIdResponse.data

      const stripePk = config.getStripePublishableKey(stripeData.paymentsMode === 'prod')

      const result = await window
        .Stripe(stripePk, { stripeAccount: stripeData.stripeAccountId })
        .redirectToCheckout({ sessionId: stripeSessionId })

      if (result.error) throw result.error

    } catch (e) {
      _parseGenericErrors(e)

      if (e.response) {
        if (e.response.data === 'SuccessUrlInvalid') {
          throw new errors.SuccessUrlInvalid
        } else if (e.response.data === 'CancelUrlInvalid') {
          throw new errors.CancelUrlInvalid
        }
      }

      throw e
    }

  } catch (e) {

    switch (e.name) {
      case 'ParamsMustBeObject':
      case 'SuccessUrlMissing':
      case 'SuccessUrlMustBeString':
      case 'SuccessUrlInvalid':
      case 'CancelUrlMissing':
      case 'CancelUrlMustBeString':
      case 'CancelUrlInvalid':
      case 'StripeJsLibraryMissing':
      case 'SubscriptionNotPurchased':
      case 'StripeAccountNotConnected':
      case 'PaymentsDisabled':
      case 'UserNotSignedIn':
      case 'TooManyRequests':
      case 'ServiceUnavailable':
        throw e

      default:
        throw new errors.UnknownServiceUnavailable(e)
    }
  }
}

export default {
  purchaseSubscription,
  cancelSubscription,
  resumeSubscription,
  updatePaymentMethod,
}
