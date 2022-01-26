import statusCodes from '../statusCodes'

class SuccessUrlMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'SuccessUrlMissing'
    this.message = 'Success url missing to let Stripe know where to redirect users on successful payment.'
    this.status = statusCodes['Bad Request']
  }
}
class SuccessUrlMustBeString extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'SuccessUrlMustBeString'
    this.message = 'Success url must be a string.'
    this.status = statusCodes['Bad Request']
  }
}
class SuccessUrlInvalid extends Error {
  constructor(invalidProtocol, ...params) {
    super(invalidProtocol, ...params)

    this.name = 'SuccessUrlInvalid'
    this.message = invalidProtocol ? 'Success url must start with http or https.' : 'Success url invalid.'
    this.status = statusCodes['Bad Request']
  }
}
class CancelUrlMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'CancelUrlMissing'
    this.message = 'Cancel url missing to let Stripe know where to redirect users on canceled payment.'
    this.status = statusCodes['Bad Request']
  }
}

class CancelUrlMustBeString extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'CancelUrlMustBeString'
    this.message = 'Cancel url must be a string.'
    this.status = statusCodes['Bad Request']
  }
}

class CancelUrlInvalid extends Error {
  constructor(invalidProtocol, ...params) {
    super(invalidProtocol, ...params)

    this.name = 'CancelUrlInvalid'
    this.message = invalidProtocol ? 'Cancel url must start with http or https.' : 'Cancel url invalid.'
    this.status = statusCodes['Bad Request']
  }
}

class EnableAutomaticTaxMustBeBoolean extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'EnableAutomaticTaxMustBeBoolean'
    this.message = 'Enable automatic tax must be a boolean.'
    this.status = statusCodes['Bad Request']
  }
}

class StripeJsLibraryMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'StripeLibraryMissing'
    this.message = 'Stripe.js library missing. Be sure to include the script in your html file (https://stripe.com/docs/stripe-js#setup).'
    this.status = statusCodes['Bad Request']
  }
}

class PaymentsDisabled extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'PaymentsDisabled'
    this.message = 'Payments on this app are disabled. Enable payments in the admin panel.'
    this.status = statusCodes['Forbidden']
  }
}

class PriceIdOrPlanIdAllowed extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'PriceIdOrPlanIdAllowed'
    this.message = 'Only one of priceId or planId allowed.'
    this.status = statusCodes['Bad Request']
  }
}

class PriceIdOrPlanIdMissing extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'PriceIdOrPlanIdMissing'
    this.message = 'Please provide a priceId or planId. You can create a product in the Stripe dashboard and find its priceId there.'
    this.status = statusCodes['Bad Request']
  }
}

class SubscriptionPlanAlreadyPurchased extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'SubscriptionPlanAlreadyPurchased'
    this.message = 'Subscription plan already purchased. Cancel subscription to purchase another.'
    this.status = statusCodes['Conflict']
  }
}
class StripeAccountNotConnected extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'StripeAccountNotConnected'
    this.message = 'Stripe account not connected. Connect a Stripe account in the admin panel.'
    this.status = statusCodes['Forbidden']
  }
}

class SubscriptionNotFound extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'SubscriptionNotFound'
    this.message = 'Subscription not found. User must purchase a subscription.'
    this.status = statusCodes['Payment Required']
  }
}

class SubscriptionInactive extends Error {
  constructor(subscriptionStatus, ...params) {
    super(...params)

    this.name = 'SubscriptionInactive'
    this.message = "The user's subscription is inactive."
    this.subscriptionStatus = subscriptionStatus
    this.status = statusCodes['Payment Required']
  }
}

class SubscriptionNotPurchased extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'SubscriptionNotPurchased'
    this.message = 'Subscription not purchased. User must purchase a subscription.'
    this.status = statusCodes['Payment Required']
  }
}

class SubscriptionAlreadyCanceled extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'SubscriptionAlreadyCanceled'
    this.message = 'Subscription already canceled. User must purchase a new subscription.'
    this.status = statusCodes['Bad Request']
  }
}

class TrialExpired extends Error {
  constructor(...params) {
    super(...params)

    this.name = 'TrialExpired'
    this.message = 'Trial expired. User must purchase a subscription.'
    this.status = statusCodes['Payment Required']
  }
}

class StripeError extends Error {
  constructor(error, ...params) {
    super(error, ...params)

    const { status, type, message } = error

    this.name = 'StripeError'
    this.message = message
    this.type = type
    this.status = status
  }
}

export default {
  SuccessUrlMissing,
  SuccessUrlMustBeString,
  SuccessUrlInvalid,
  CancelUrlMissing,
  CancelUrlMustBeString,
  CancelUrlInvalid,
  EnableAutomaticTaxMustBeBoolean,
  StripeJsLibraryMissing,
  PaymentsDisabled,
  PriceIdOrPlanIdAllowed,
  PriceIdOrPlanIdMissing,
  SubscriptionPlanAlreadyPurchased,
  StripeAccountNotConnected,
  SubscriptionNotFound,
  SubscriptionInactive,
  SubscriptionNotPurchased,
  SubscriptionAlreadyCanceled,
  TrialExpired,
  StripeError,
}
