import React, { Component, createRef } from 'react'
import { func, object, bool } from 'prop-types'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import adminLogic from './logic'
import UnknownError from './UnknownError'
import { formatDate } from '../../utils'
import {
  STRIPE_CLIENT_ID,
  PAYMENTS_ADD_ON_PRICE,
  STORAGE_PLAN_1_TB_PRICE,
  METERED_COST_PER_GB,
  getStripeState,
  getStripeCancelWarning
} from '../../config'

export default class EditAdmin extends Component {
  constructor(props) {
    super(props)
    this.state = {
      email: this.props.admin.email,
      fullName: this.props.admin.fullName,
      currentPassword: '',
      newPassword: '',
      accessTokens: [],
      accessTokenCurrentPassword: '',
      accessTokenLabel: '',
      newAccessTokens: [],
      loading: true,
      loadingUpdateAdmin: false,
      loadingChangePassword: false,
      loadingDeleteAdmin: false,
      loadingCheckout: false,
      loadingGenerateAccessToken: false,
      loadingCancel: false,
      loadingUpdatePaymentMethod: false,
      loadingResumeSubscription: false,
      loadingBuyStoragePlan: false,
      loadingCancelStoragePlan: false,
      loadingResumeStoragePlan: false,
      loadingBuyAddOn: false,
      loadingCancelAddOn: false,
      loadingResumeAddOn: false,
      loadingDisconnectStripeAccount: false,
      errorLoading: '',
      errorUpdatingAdmin: '',
      errorChangingPassword: '',
      errorDeletingAdmin: '',
      errorCheckingOut: false,
      errorGeneratingAccessToken: false,
      errorDeletingAccessToken: false,
      errorCanceling: false,
      errorUpdatingPaymentMethod: false,
      errorResumingSubscription: false,
      errorBuyingStoragePlan: false,
      errorCancelingStoragePlan: false,
      errorResumingStoragePlan: false,
      errorBuyingAddOn: false,
      errorCancelingAddOn: false,
      errorResumingAddOn: false,
      errorDisconnectingStripeAccount: false,
    }

    this.handleUpgradeAtLoad = this.handleUpgradeAtLoad.bind(this)
    this.handleEnablePaymentsAtLoad = this.handleEnablePaymentsAtLoad.bind(this)
    this.handleEnableStoragePlan1AtLoad = this.handleEnableStoragePlan1AtLoad.bind(this)
    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleUpdateAcount = this.handleUpdateAcount.bind(this)
    this.handleChangePassword = this.handleChangePassword.bind(this)
    this.handleGenerateAccessToken = this.handleGenerateAccessToken.bind(this)
    this.handleDeleteAccessToken = this.handleDeleteAccessToken.bind(this)
    this.handleDeleteAccount = this.handleDeleteAccount.bind(this)
    this.handleCancelSubscription = this.handleCancelSubscription.bind(this)
    this.handleResumeSubscription = this.handleResumeSubscription.bind(this)
    this.handleCheckout = this.handleCheckout.bind(this)
    this.handleBuyStoragePlan = this.handleBuyStoragePlan.bind(this)
    this.handleCancelStoragePlan = this.handleCancelStoragePlan.bind(this)
    this.handleResumeStoragePlan = this.handleResumeStoragePlan.bind(this)
    this.handleBuyAddOn = this.handleBuyAddOn.bind(this)
    this.handleCancelAddOn = this.handleCancelAddOn.bind(this)
    this.handleResumeAddOn = this.handleResumeAddOn.bind(this)
    this.handleUpdatePaymentMethod = this.handleUpdatePaymentMethod.bind(this)
    this.handleDisconnectStripeAccount = this.handleDisconnectStripeAccount.bind(this)
    this.handleClearErrors = this.handleClearErrors.bind(this)

    this.domNodeRef = createRef()
  }

  async componentDidMount() {
    this._isMounted = true
    document.addEventListener('keydown', this.handleHitEnter, true)

    try {
      const accessTokens = await adminLogic.getAccessTokens()
      if (this._isMounted) this.setState({ accessTokens, loading: false })
    } catch (e) {
      if (this._isMounted) this.setState({ errorLoading: e.message, loading: false })
    }
  }

  // attempt to ensure the DOM finishes rendering before simulating button clicks
  // sources:
  // https://stackoverflow.com/a/34999925/11601853
  // https://medium.com/trabe/getting-rid-of-finddomnode-method-in-your-react-application-a0d7093b2660
  onNextFrame() {
    var _this = this
    setTimeout(function () {
      window.requestAnimationFrame(function () {
        const domnode = _this.domNodeRef
        if (domnode !== undefined && domnode.current) {
          if (_this.props.upgrade && !_this._handledUpgrade) {
            _this._handledUpgrade = true
            _this.handleUpgradeAtLoad()
          } else if (_this.props.enablePayments && !_this._handledEnablePayments) {
            _this._handledEnablePayments = true
            _this.handleEnablePaymentsAtLoad()
          } else if (_this.props.enableStoragePlan1 && !_this._handledStoragePlan1) {
            _this._handledStoragePlan1 = true
            _this.handleEnableStoragePlan1AtLoad()
          }
        }
      })
    })
  }

  componentDidUpdate() {
    this.onNextFrame()
  }

  handleUpgradeAtLoad() {
    // only attempt upgrade if admin does not already have a subscription
    if (!this.props.admin.paymentStatus && !this.props.admin.altPaymentStatus) {
      this.handleCheckout()
    }
  }

  handleEnablePaymentsAtLoad() {
    const { admin } = this.props
    const { paymentStatus, cancelSaasSubscriptionAt, paymentsAddOnSubscriptionStatus, cancelPaymentsAddOnSubscriptionAt } = admin

    if (!paymentsAddOnSubscriptionStatus || cancelPaymentsAddOnSubscriptionAt) {

      // only attempt to enable payments if admin has active Userbase subscription
      if (paymentStatus === 'active' && !cancelSaasSubscriptionAt) {
        this.handleBuyAddOn()
      } else {
        window.alert(`You must ${paymentStatus === 'active' ? 'purchase the' : 'have an active'} Userbase subscription first before you can enable payments!`)
      }
    }
  }

  handleEnableStoragePlan1AtLoad() {
    const { admin } = this.props
    const { paymentStatus, cancelSaasSubscriptionAt, storageSubscriptionStatus, cancelStorageSubscriptionAt } = admin

    if (!storageSubscriptionStatus || cancelStorageSubscriptionAt) {

      // only attempt to enable payments if admin has active Userbase subscription
      if (paymentStatus === 'active' && !cancelSaasSubscriptionAt) {
        this.handleBuyStoragePlan()
      } else {
        window.alert(`You must ${paymentStatus === 'active' ? 'purchase the' : 'have an active'} Userbase subscription first before you can activate a storage plan!`)
      }
    }
  }

  componentWillUnmount() {
    this._isMounted = false
    document.removeEventListener('keydown', this.handleHitEnter, true)
  }

  handleHitEnter(e) {
    const ENTER_KEY_CODE = 13
    if ((e.target.name === 'fullName' || e.target.name === 'email'
      || e.target.name === 'currentPassword' || e.target.name === 'newPassword') &&
      (e.key === 'Enter' || e.keyCode === ENTER_KEY_CODE)) {
      e.stopPropagation()
    }
  }

  handleClearErrors(loadingState) {
    if (loadingState
      || this.state.errorUpdatingAdmin
      || this.state.errorDeletingAdmin
      || this.state.errorChangingPassword
      || this.state.errorCheckingOut
      || this.state.errorCanceling
      || this.state.errorUpdatingPaymentMethod
      || this.state.errorResumingSubscription
      || this.state.errorBuyingStoragePlan
      || this.state.errorCancelingStoragePlan
      || this.state.errorResumingStoragePlan
      || this.state.errorBuyingAddOn
      || this.state.errorCancelingAddOn
      || this.state.errorResumingAddOn
      || this.state.errorGeneratingAccessToken
      || this.state.errorDeletingAccessToken
      || this.state.errorDisconnectingStripeAccount
    ) {
      this.setState({
        ...loadingState,
        errorUpdatingAdmin: '',
        errorChangingPassword: '',
        errorDeletingAdmin: '',
        errorCheckingOut: false,
        errorCanceling: false,
        errorUpdatingPaymentMethod: false,
        errorResumingSubscription: false,
        errorBuyingStoragePlan: false,
        errorCancelingStoragePlan: false,
        errorResumingStoragePlan: false,
        errorBuyingAddOn: false,
        errorCancelingAddOn: false,
        errorResumingAddOn: false,
        errorGeneratingAccessToken: false,
        errorDeletingAccessToken: false,
        errorDisconnectingStripeAccount: false,
      })
    }
  }

  handleInputChange(event) {
    this.handleClearErrors()

    const target = event.target
    const value = target.value
    const name = target.name

    this.setState({
      [name]: value
    })
  }

  async handleUpdateAcount(event) {
    event.preventDefault()

    if (this.state.loadingUpdateAdmin) return

    const fullName = this.state.fullName !== this.props.admin.fullName && this.state.fullName
    const email = this.state.email !== this.props.admin.email && this.state.email

    const updatedAdmin = {}
    if (!fullName && !email) return
    else {
      if (fullName) updatedAdmin.fullName = fullName
      if (email) updatedAdmin.email = email
    }

    this.handleClearErrors({ loadingUpdateAdmin: true })

    try {
      await adminLogic.updateAdmin({ fullName, email })
      if (email || fullName) this.props.handleUpdateAccount(updatedAdmin)
      if (this._isMounted) {
        this.setState({
          fullName: fullName || this.props.admin.fullName,
          email: email || this.props.admin.email,
          loadingUpdateAdmin: false
        })
      }
    } catch (e) {
      if (this._isMounted) this.setState({ errorUpdatingAdmin: e.message, loadingUpdateAdmin: false })
    }
  }

  async handleChangePassword(event) {
    const { currentPassword, newPassword } = this.state
    event.preventDefault()

    if (this.state.loadingChangePassword) return
    if (!currentPassword || !newPassword) return

    const loadingState = { loadingChangePassword: true }
    this.handleClearErrors(loadingState)

    try {
      await adminLogic.changePassword({ currentPassword, newPassword })

      window.alert('Password changed successfully!')

      if (this._isMounted) {
        this.setState({
          currentPassword: '',
          newPassword: '',
          loadingChangePassword: false
        })
      }
    } catch (e) {
      if (this._isMounted) this.setState({ errorChangingPassword: e.message, loadingChangePassword: false })
    }
  }

  async handleGenerateAccessToken(event) {
    event.preventDefault()

    const { accessTokenCurrentPassword, accessTokenLabel, newAccessTokens } = this.state

    if (this.state.loadingGenerateAccessToken || !accessTokenCurrentPassword || !accessTokenLabel) return

    this.handleClearErrors({ loadingGenerateAccessToken: true })

    try {
      newAccessTokens.unshift(await adminLogic.generateAccessToken(accessTokenCurrentPassword, accessTokenLabel))

      if (this._isMounted) this.setState({ loadingGenerateAccessToken: false, accessTokenCurrentPassword: '', accessTokenLabel: '', newAccessTokens })
    } catch (e) {
      if (this._isMounted) this.setState({ loadingGenerateAccessToken: false, errorGeneratingAccessToken: e.message })
    }
  }

  async handleDeleteAccessToken(label, newToken) {
    const { accessTokens, newAccessTokens } = this.state
    const tokens = newToken ? newAccessTokens : accessTokens

    const getTokenIndex = (toks) => toks.findIndex((token) => token['label'] === label)

    try {
      if (window.confirm(`Are you sure you want to delete access token '${label}'? This cannot be undone.`)) {

        tokens[getTokenIndex(tokens)].deleting = true
        this.setState({ accessTokens, newAccessTokens })

        await adminLogic.deleteAccessToken(label)

        if (this._isMounted) {
          const { accessTokens, newAccessTokens } = this.state
          const tokens = newToken ? newAccessTokens : accessTokens
          const tokenIndex = getTokenIndex(tokens)

          // remove token
          tokens.splice(tokenIndex, 1)

          this.setState({ accessTokens, newAccessTokens })
        }
      }
    } catch (e) {
      if (this._isMounted) {
        const { accessTokens, newAccessTokens } = this.state
        const tokens = newToken ? newAccessTokens : accessTokens

        tokens[getTokenIndex(tokens)].deleting = undefined

        this.setState({ errorDeletingAccessToken: e.message, accessTokens, newAccessTokens })
      }
    }
  }

  async handleDeleteAccount(event) {
    event.preventDefault()

    this.handleClearErrors()

    try {
      if (window.confirm('Are you sure you want to delete your account?')) {
        this.setState({ loadingDeleteAdmin: true })
        await adminLogic.deleteAdmin()
      }
    } catch (e) {
      if (this._isMounted) this.setState({ errorDeletingAdmin: e.message, loadingDeleteAdmin: false })
    }
  }

  async handleCheckout(event) {
    if (event) event.preventDefault()

    this.handleClearErrors({ loadingCheckout: true })

    try {
      await adminLogic.subscribeToSaas()
      if (this._isMounted) this.setState({ loadingCheckout: false })
    } catch (e) {
      if (this._isMounted) this.setState({ loadingCheckout: false, errorCheckingOut: true })
    }
  }

  async handleUpdatePaymentMethod(event) {
    event.preventDefault()

    if (this.state.loadingUpdatePaymentMethod) return

    this.handleClearErrors({ loadingUpdatePaymentMethod: true })

    try {
      await adminLogic.updateSaasPaymentMethod()

      if (this._isMounted) this.setState({ loadingUpdatePaymentMethod: false })
    } catch (e) {
      if (this._isMounted) this.setState({ loadingUpdatePaymentMethod: false, errorUpdatingPaymentMethod: true })
    }
  }

  async handleCancelSubscription(event) {
    event.preventDefault()

    if (this.state.loadingCancel) return

    this.handleClearErrors()

    try {
      if (window.confirm('Are you sure you want to cancel your subscription? ' + getStripeCancelWarning(true))) {
        this.setState({ loadingCancel: true })
        const { cancelSaasSubscriptionAt, cancelPaymentsAddOnSubscriptionAt, cancelStorageSubscriptionAt, sizeAllowed } = await adminLogic.cancelSaasSubscription()

        this.props.handleUpdateAccount({ cancelSaasSubscriptionAt, cancelPaymentsAddOnSubscriptionAt, cancelStorageSubscriptionAt, sizeAllowed })

        if (this._isMounted) this.setState({ loadingCancel: false })
      }
    } catch (e) {
      if (this._isMounted) this.setState({ loadingCancel: false, errorCanceling: true })
    }
  }

  async handleResumeSubscription(event) {
    event.preventDefault()

    try {
      this.handleClearErrors({ loadingResumeSubscription: true })

      const { sizeAllowed } = await adminLogic.resumeSaasSubscription()

      this.props.handleUpdateAccount({ cancelSaasSubscriptionAt: undefined, sizeAllowed })

      if (this._isMounted) this.setState({ loadingResumeSubscription: false })
    } catch (e) {
      if (this._isMounted) this.setState({ loadingResumeSubscription: false, errorResumingSubscription: true })
    }
  }

  async handleBuyStoragePlan(event) {
    if (event) event.preventDefault()

    this.handleClearErrors({ loadingBuyStoragePlan: true })

    try {
      if (window.confirm(`Purchase the storage plan for $${STORAGE_PLAN_1_TB_PRICE} per year!`)) {
        const { storageSubscriptionStatus, sizeAllowed } = await adminLogic.buyStoragePlan()

        this.props.handleUpdateAccount({ storageSubscriptionStatus, sizeAllowed })
        if (storageSubscriptionStatus === 'incomplete') {
          window.alert('Please update your payment method!')
        }
      }

      if (this._isMounted) this.setState({ loadingBuyStoragePlan: false })
    } catch (e) {
      if (this._isMounted) this.setState({ loadingBuyStoragePlan: false, errorBuyingStoragePlan: true })
    }
  }

  async handleCancelStoragePlan(event) {
    event.preventDefault()

    if (this.state.loadingCancelStoragePlan) return

    this.handleClearErrors()

    try {
      if (window.confirm('Are you sure you want to cancel your storage plan?')) {
        this.setState({ loadingCancelStoragePlan: true })

        const { cancelStorageSubscriptionAt, sizeAllowed } = await adminLogic.cancelStorageSubscription()

        this.props.handleUpdateAccount({ cancelStorageSubscriptionAt, sizeAllowed })

        if (this._isMounted) this.setState({ loadingCancelStoragePlan: false })
      }
    } catch (e) {
      if (this._isMounted) this.setState({ loadingCancelStoragePlan: false, errorCancelingStoragePlan: true })
    }
  }

  async handleResumeStoragePlan(event) {
    event.preventDefault()

    try {
      this.handleClearErrors({ loadingResumeStoragePlan: true, sizeAllowed: null })

      const { storageSubscriptionStatus, sizeAllowed } = await adminLogic.resumeStorageSubscription()

      this.props.handleUpdateAccount({ cancelStorageSubscriptionAt: undefined, storageSubscriptionStatus, sizeAllowed })

      if (this._isMounted) this.setState({ loadingResumeStoragePlan: false })
    } catch (e) {
      if (this._isMounted) this.setState({ loadingResumeStoragePlan: false, errorResumingStoragePlan: true })
    }
  }

  async handleBuyAddOn(event) {
    if (event) event.preventDefault()

    this.handleClearErrors({ loadingBuyAddOn: true })

    try {
      if (window.confirm(`Purchase the payments add-on for $${PAYMENTS_ADD_ON_PRICE} per year!`)) {
        const paymentsAddOnSubscriptionStatus = await adminLogic.buyAddOn()

        this.props.handleUpdateAccount({ paymentsAddOnSubscriptionStatus })
        if (paymentsAddOnSubscriptionStatus === 'incomplete') {
          window.alert('Please update your payment method!')
        }
      }

      if (this._isMounted) this.setState({ loadingBuyAddOn: false })
    } catch (e) {
      if (this._isMounted) this.setState({ loadingBuyAddOn: false, errorBuyingAddOn: true })
    }
  }

  async handleCancelAddOn(event) {
    event.preventDefault()

    if (this.state.loadingCancelAddOn) return

    this.handleClearErrors()

    try {
      if (window.confirm('Are you sure you want to cancel your add-on subscription? ' + getStripeCancelWarning(true))) {
        this.setState({ loadingCancelAddOn: true })

        const cancelPaymentsAddOnSubscriptionAt = await adminLogic.cancelPaymentsAddOnSubscription()

        this.props.handleUpdateAccount({ cancelPaymentsAddOnSubscriptionAt })

        if (this._isMounted) this.setState({ loadingCancelAddOn: false })
      }
    } catch (e) {
      if (this._isMounted) this.setState({ loadingCancelAddOn: false, errorCancelingAddOn: true })
    }
  }

  async handleResumeAddOn(event) {
    event.preventDefault()

    try {
      this.handleClearErrors({ loadingResumeAddOn: true })

      await adminLogic.resumePaymentsAddOnSubscription()

      this.props.handleUpdateAccount({ cancelPaymentsAddOnSubscriptionAt: undefined })

      if (this._isMounted) this.setState({ loadingResumeAddOn: false })
    } catch (e) {
      if (this._isMounted) this.setState({ loadingResumeAddOn: false, errorResumingAddOn: true })
    }
  }


  async handleDisconnectStripeAccount(event) {
    event.preventDefault()

    try {
      if (window.confirm('Are you sure you want to disconnect your Stripe account? ' + getStripeCancelWarning(true))) {
        this.handleClearErrors({ loadingDisconnectStripeAccount: true })

        await adminLogic.disconnectStripeAccount()

        this.props.handleUpdateAccount({ connectedToStripe: false })

        if (this._isMounted) this.setState({ loadingDisconnectStripeAccount: false })
      }
    } catch (e) {
      if (this._isMounted) this.setState({ loadingDisconnectStripeAccount: false, errorDisconnectingStripeAccount: e.message })
    }
  }

  render() {
    const { admin } = this.props
    const {
      paymentStatus,
      cancelSaasSubscriptionAt,
      connectedToStripe,
      paymentsAddOnSubscriptionStatus,
      cancelPaymentsAddOnSubscriptionAt,
      storageSubscriptionStatus,
      cancelStorageSubscriptionAt,
      altPaymentStatus,
    } = admin
    const {
      fullName,
      email,
      currentPassword,
      newPassword,
      newAccessTokens,
      accessTokens,
      accessTokenCurrentPassword,
      accessTokenLabel,
      loadingUpdateAdmin,
      loadingChangePassword,
      loadingDeleteAdmin,
      loadingCheckout,
      loadingBuyStoragePlan,
      loadingCancelStoragePlan,
      loadingResumeStoragePlan,
      loadingBuyAddOn,
      loadingCancelAddOn,
      loadingResumeAddOn,
      loadingGenerateAccessToken,
      loadingCancel,
      loadingUpdatePaymentMethod,
      loadingDisconnectStripeAccount,
      loadingResumeSubscription,
      errorUpdatingAdmin,
      errorChangingPassword,
      errorDeletingAdmin,
      errorCheckingOut,
      errorBuyingStoragePlan,
      errorCancelingStoragePlan,
      errorResumingStoragePlan,
      errorBuyingAddOn,
      errorCancelingAddOn,
      errorResumingAddOn,
      errorGeneratingAccessToken,
      errorDeletingAccessToken,
      errorCanceling,
      errorUpdatingPaymentMethod,
      errorDisconnectingStripeAccount,
      errorResumingSubscription,
      loading,
      errorLoading,
    } = this.state

    const disableUpdateButton = (fullName === this.props.admin.fullName || !fullName)
      && (email === this.props.admin.email || !email)

    return (
      <div className='container content text-xs sm:text-base text-center mb-8'>

        {loading
          ? <div className='loader inline-block w-6 h-6' />
          : errorLoading
            ? <UnknownError noMarginTop />
            : <div ref={this.domNodeRef}>
              {(paymentStatus === 'active' || paymentStatus === 'past_due') && !cancelSaasSubscriptionAt
                ?
                <div>
                  <div className='flex-0 text-lg sm:text-xl text-left mb-4'>Userbase Subscription</div>

                  <input
                    className='btn w-56 text-center'
                    type='button'
                    role='link'
                    value={loadingUpdatePaymentMethod ? 'Loading...' : 'Update Payment Method'}
                    disabled={loadingCancel || loadingUpdatePaymentMethod}
                    onClick={this.handleUpdatePaymentMethod}
                  />

                  {errorUpdatingPaymentMethod && <UnknownError action='loading the form to update your payment method' />}

                  <hr className='border border-t-0 border-gray-400 mt-8 mb-4' />

                </div>
                :
                <div>
                  {
                    altPaymentStatus !== 'active' &&
                    <div>
                      <div className='flex-0 text-lg sm:text-xl text-left mb-4'>Userbase Subscription</div>

                      <div className='font-normal text-left mb-4'>
                        <p>Your trial account is limited to 1 app and 3 users.</p>
                        <p>Remove this limit with a Userbase subscription for only $49 per year.</p>
                      </div>

                      {cancelSaasSubscriptionAt
                        ? <input
                          className='btn w-56 text-center'
                          type='button'
                          role='link'
                          value={loadingResumeSubscription ? 'Resuming Subscription...' : 'Resume Subscription'}
                          disabled={loadingResumeSubscription}
                          onClick={this.handleResumeSubscription}
                        />
                        : <input
                          className='btn w-56 text-center'
                          type='button'
                          role='link'
                          disabled={loadingCheckout}
                          value={loadingCheckout ? 'Loading...' : 'Buy Subscription'}
                          onClick={this.handleCheckout}
                        />
                      }

                      {errorCheckingOut && <UnknownError action='loading the checkout form' />}
                      {errorResumingSubscription && <UnknownError action='resuming your subscription' />}

                      <hr className='border border-t-0 border-gray-400 mt-8 mb-4' />

                    </div>
                  }
                </div>
              }

              {(!storageSubscriptionStatus || cancelStorageSubscriptionAt) &&
                <div>
                  <div className='flex-0 text-lg sm:text-xl text-left mb-4'>Storage Plan</div>
                  <div className='font-normal text-left mb-4'>
                    <p>{`Store up to 1 TB of data for an additional $${STORAGE_PLAN_1_TB_PRICE} per year. Each GB above is $${METERED_COST_PER_GB.toFixed(2)} per month.`}</p>
                    {(paymentStatus !== 'active' || cancelSaasSubscriptionAt) && (altPaymentStatus !== 'active'
                      ? <p>You must have an active Userbase subscription.</p>
                      : <p>Please contact <a href='mailto:support@userbase.com'>support@userbase.com</a> to enable this feature.</p>
                    )}
                  </div>

                  {
                    cancelStorageSubscriptionAt
                      ?
                      <input
                        className='btn w-56 text-center'
                        type='button'
                        role='link'
                        value={loadingResumeStoragePlan ? 'Resuming Storage Plan...' : 'Resume 1 TB Storage Plan'}
                        disabled={loadingResumeStoragePlan || paymentStatus !== 'active' || cancelSaasSubscriptionAt}
                        onClick={this.handleResumeStoragePlan}
                      />
                      :
                      <input
                        className='btn w-56 text-center'
                        type='button'
                        role='link'
                        disabled={loadingBuyStoragePlan || paymentStatus !== 'active' || cancelSaasSubscriptionAt}
                        value={loadingBuyStoragePlan ? 'Loading...' : 'Buy Storage Plan (1 TB)'}
                        onClick={this.handleBuyStoragePlan}
                      />
                  }

                  {errorBuyingStoragePlan && <UnknownError action='buying the storage plan' />}
                  {errorResumingStoragePlan && <UnknownError action='resuming the storage plan' />}

                  <hr className='border border-t-0 border-gray-400 mt-8 mb-4' />
                </div>
              }

              {(!paymentsAddOnSubscriptionStatus || cancelPaymentsAddOnSubscriptionAt) &&
                <div>
                  <div className='flex-0 text-lg sm:text-xl text-left mb-4'>Payments Portal Add-On</div>
                  <div className='font-normal text-left mb-4'>
                    <p>Collect payments on your apps with Stripe for an additional ${PAYMENTS_ADD_ON_PRICE} per year.</p>
                    {(paymentStatus !== 'active' || cancelSaasSubscriptionAt) && (altPaymentStatus !== 'active'
                      ? <p>You must have an active Userbase subscription.</p>
                      : <p>Please contact <a href='mailto:support@userbase.com'>support@userbase.com</a> to enable this feature.</p>
                    )}
                  </div>

                  {
                    cancelPaymentsAddOnSubscriptionAt
                      ?
                      <input
                        className='btn w-56 text-center'
                        type='button'
                        role='link'
                        value={loadingResumeAddOn ? 'Resuming Add-On...' : 'Resume Add-On'}
                        disabled={loadingResumeAddOn || paymentStatus !== 'active' || cancelSaasSubscriptionAt}
                        onClick={this.handleResumeAddOn}
                      />
                      :
                      <input
                        className='btn w-56 text-center'
                        type='button'
                        role='link'
                        disabled={loadingBuyAddOn || paymentStatus !== 'active' || cancelSaasSubscriptionAt}
                        value={loadingBuyAddOn ? 'Loading...' : 'Buy Add-On'}
                        onClick={this.handleBuyAddOn}
                      />
                  }

                  {errorBuyingAddOn && <UnknownError action='buying the add-on' />}
                  {errorResumingAddOn && <UnknownError action='resuming the add-on' />}

                  {!connectedToStripe &&
                    <div>
                      <a
                        href={`https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${STRIPE_CLIENT_ID}&scope=read_write&state=${getStripeState()}`}
                        className={`stripe-connect light-blue ${!paymentsAddOnSubscriptionStatus ? 'mt-6' : ''}`}>
                        <span>Connect with Stripe</span>
                      </a>
                    </div>
                  }

                  <hr className='border border-t-0 border-gray-400 mt-8 mb-4' />
                </div>
              }

              <div className='flex-0 text-lg sm:text-xl text-left mb-4'>Edit Account</div>

              <form onSubmit={this.handleUpdateAcount}>
                <div className='table'>

                  <div className='table-row'>
                    <div className='table-cell p-2 w-32 sm:w-40 text-right'>Full Name</div>
                    <div className='table-cell p-2 w-32 sm:w-40'>
                      <input
                        className='font-light text-xs sm:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none'
                        type='text'
                        name='fullName'
                        autoComplete='name'
                        value={fullName}
                        onChange={this.handleInputChange}
                      />
                    </div>
                  </div>

                  <div className='table-row'>
                    <div className='table-cell p-2 w-32 sm:w-40 text-right'>Email</div>
                    <div className='table-cell p-2 w-32 sm:w-40'>
                      <input
                        className='font-light text-xs sm:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none'
                        type='email'
                        name='email'
                        autoComplete='email'
                        onChange={this.handleInputChange}
                        value={email}
                      />
                    </div>
                  </div>

                </div>

                <div className='text-center'>
                  <input
                    className='btn w-56 mt-4'
                    type='submit'
                    value={loadingUpdateAdmin ? 'Updating...' : 'Update Account'}
                    disabled={disableUpdateButton || loadingDeleteAdmin || loadingUpdateAdmin}
                  />

                  {errorUpdatingAdmin && (
                    errorUpdatingAdmin === 'Unknown Error'
                      ? <UnknownError action='updating your account' />
                      : <div className='error'>{errorUpdatingAdmin}</div>
                  )}
                </div>

              </form>

              <hr className='border border-t-0 border-gray-400 mt-8 mb-6' />

              <div className='flex-0 text-lg sm:text-xl text-left mb-4'>Update Password</div>

              <form onSubmit={this.handleChangePassword}>
                <div className='table'>

                  <div className='table-row'>
                    <div className='table-cell p-2 w-32 sm:w-40 text-right'>Current Password</div>
                    <div className='table-cell p-2 w-32 sm:w-40 align-middle'>
                      <input
                        className='font-light text-xs sm:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none'
                        type='password'
                        name='currentPassword'
                        autoComplete='current-password'
                        onChange={this.handleInputChange}
                        value={currentPassword}
                      />
                    </div>
                  </div>

                  <div className='table-row'>
                    <div className='table-cell p-2 w-32 sm:w-40 text-right'>New Password</div>
                    <div className='table-cell p-2 w-32 sm:w-40 align-middle'>
                      <input
                        className='font-light text-xs sm:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none'
                        type='password'
                        name='newPassword'
                        autoComplete='new-password'
                        onChange={this.handleInputChange}
                        value={newPassword}
                      />
                    </div>
                  </div>

                </div>

                <div className='text-center'>
                  <input
                    className='btn mt-4 w-56'
                    type='submit'
                    value={loadingChangePassword ? 'Changing...' : 'Change Password'}
                    disabled={(!currentPassword || !newPassword) || loadingDeleteAdmin || loadingUpdateAdmin || loadingChangePassword}
                  />

                  {errorChangingPassword && (
                    errorChangingPassword === 'Unknown Error'
                      ? <UnknownError action='changing your password' />
                      : <div className='error'>{errorChangingPassword}</div>
                  )}
                </div>

              </form>

              <hr className='border border-t-0 border-gray-400 mt-8 mb-6' />

              <div className='flex-0 text-lg sm:text-xl text-left mb-1'>Access Tokens</div>
              <p className='text-left font-normal'>Tokens you have generated to access the Admin API.</p>

              {
                (!newAccessTokens.length && !accessTokens.length)
                  ? <p className='text-left font-normal'>No tokens yet.</p>
                  : <table className='mt-6 mb-8 table-auto w-full border-none mx-auto text-xs'>

                    <thead>
                      <tr className='border-b'>
                        <th className='px-1 py-1 text-gray-800 text-left'>Label</th>
                        <th className='px-1 py-1 text-gray-800 text-left'>{newAccessTokens.length ? 'Token (Copy now! It will disappear)' : ''}</th>
                        <th className='px-1 py-1 text-gray-800 text-left'>Created</th>
                        <th className='px-1 py-1'></th>
                      </tr>
                    </thead>

                    <tbody>

                      {newAccessTokens.map((newAccessToken, i) => {
                        return (
                          <tr key={i + 'new'} className='border-b bg-green-200 h-8'>
                            <td className='px-1 font-light text-left'>{newAccessToken['label']}</td>
                            <td className='px-1 font-mono text-left bg-green-200 '>{newAccessToken['accessToken']}</td>
                            <td className='px-1 font-light text-left'>{formatDate(newAccessToken['creationDate'], false)}</td>
                            <td className='px-1 font-light w-8 text-center'>

                              {newAccessToken['deleting']
                                ? <div className='loader w-4 h-4 inline-block' />
                                : <div
                                  className='font-normal text-sm cursor-pointer text-yellow-700'
                                  onClick={() => this.handleDeleteAccessToken(newAccessToken['label'], true)}
                                >
                                  <FontAwesomeIcon icon={faTrashAlt} />
                                </div>
                              }

                            </td>
                          </tr>
                        )
                      })}

                      {accessTokens.map((accessToken, i) => {
                        return (
                          <tr key={i + 'old'} className='border-b mouse:hover:bg-yellow-200 h-8'>
                            <td className='px-1 font-light text-left'>{accessToken['label']}</td>
                            <td className='px-1 font-light text-left'></td>
                            <td className='px-1 font-light text-left'>{formatDate(accessToken['creationDate'], false)}</td>
                            <td className='px-1 font-light w-8 text-center'>

                              {accessToken['deleting']
                                ? <div className='loader w-4 h-4 inline-block' />
                                : <div
                                  className='font-normal text-sm cursor-pointer text-yellow-700'
                                  onClick={() => this.handleDeleteAccessToken(accessToken['label'])}
                                >
                                  <FontAwesomeIcon icon={faTrashAlt} />
                                </div>
                              }

                            </td>
                          </tr>
                        )
                      })}

                    </tbody>
                  </table>
              }

              <form onSubmit={this.handleGenerateAccessToken}>
                <div className='table'>

                  <div className='table-row'>
                    <div className='table-cell p-2 w-32 sm:w-40 text-right'>Current Password</div>
                    <div className='table-cell p-2 w-32 sm:w-40 align-middle'>
                      <input
                        className='font-light text-xs sm:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none'
                        type='password'
                        name='accessTokenCurrentPassword'
                        autoComplete='current-password'
                        onChange={this.handleInputChange}
                        value={accessTokenCurrentPassword}
                      />
                    </div>
                  </div>

                  <div className='table-row'>
                    <div className='table-cell p-2 w-32 sm:w-40 text-right'>Label</div>
                    <div className='table-cell p-2 w-32 sm:w-40'>
                      <input
                        className='font-light text-xs sm:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none'
                        type='text'
                        name='accessTokenLabel'
                        autoComplete='off'
                        value={accessTokenLabel}
                        onChange={this.handleInputChange}
                      />
                    </div>
                  </div>
                </div>

                <div className='text-center'>
                  <input
                    className='btn w-56 mt-4'
                    type='submit'
                    value={loadingGenerateAccessToken ? 'Generating...' : 'Generate Access Token'}
                    disabled={!accessTokenLabel || loadingGenerateAccessToken}
                  />

                  {errorGeneratingAccessToken && (
                    errorGeneratingAccessToken === 'Unknown Error'
                      ? <UnknownError action='generating an access token' />
                      : <div className='error'>{errorGeneratingAccessToken}</div>
                  )}

                  {errorDeletingAccessToken && (
                    errorDeletingAccessToken === 'Unknown Error'
                      ? <UnknownError action='deleting an access token' />
                      : <div className='error'>{errorDeletingAccessToken}</div>
                  )}
                </div>

              </form>

              <hr className='border border-t-0 border-gray-400 mt-8 mb-6' />

              <div className='flex-0 text-lg sm:text-xl text-left mb-4 text-red-600'>Danger Zone</div>

              {(paymentStatus === 'active' || paymentStatus === 'past_due') && !cancelSaasSubscriptionAt &&
                <div>
                  <div className='flex-0 text-base sm:text-lg text-left mb-1'>Cancel Subscription</div>
                  <p className='text-left font-normal'>By canceling your subscription, your account will become limited to 3 users, and no new sign ups will succeed once that limit is reached.</p>

                  <input
                    className='btn w-56'
                    type='button'
                    role='link'
                    value={loadingCancel ? 'Canceling Subscription...' : 'Cancel Subscription'}
                    disabled={loadingCancel}
                    onClick={this.handleCancelSubscription}
                  />

                  {errorCanceling && <UnknownError action='canceling your subscription' />}

                  <br />
                  <br />
                </div>
              }

              {storageSubscriptionStatus && storageSubscriptionStatus !== 'canceled' && !cancelStorageSubscriptionAt &&
                <div>
                  <div className='flex-0 text-base sm:text-lg text-left mb-1'>Cancel Storage Plan</div>
                  <p className='text-left font-normal'>By canceling your storage plan, you will be limited to 1 GB of storage.</p>

                  <input
                    className='btn w-56'
                    type='button'
                    role='link'
                    value={loadingCancelStoragePlan ? 'Canceling Storage Plan...' : 'Cancel Storage Plan'}
                    disabled={loadingCancelStoragePlan}
                    onClick={this.handleCancelStoragePlan}
                  />

                  {errorCancelingStoragePlan && <UnknownError action='canceling your storage plan' />}

                  <br />
                  <br />
                </div>
              }

              {paymentsAddOnSubscriptionStatus && paymentsAddOnSubscriptionStatus !== 'canceled' && !cancelPaymentsAddOnSubscriptionAt &&
                <div>
                  <div className='flex-0 text-base sm:text-lg text-left mb-1'>Cancel Payments Add-On</div>
                  <p className='text-left font-normal'>By canceling your payments add-on, you will no longer be able to accept new payments on your apps.</p>

                  <input
                    className='btn w-56'
                    type='button'
                    role='link'
                    value={loadingCancelAddOn ? 'Canceling Add-On...' : 'Cancel Add-On'}
                    disabled={loadingCancelAddOn}
                    onClick={this.handleCancelAddOn}
                  />

                  {errorCancelingAddOn && <UnknownError action='canceling your payments add-on' />}

                  <br />
                  <br />
                </div>
              }

              {connectedToStripe &&
                <div>
                  <div className='flex-0 text-base sm:text-lg text-left mb-1'>Disconnect Stripe Account</div>
                  <p className='text-left font-normal'>By disconnecting your Stripe account, you will no longer be able to accept new payments on your apps.</p>

                  <input
                    className='btn w-56'
                    type='button'
                    value={loadingDisconnectStripeAccount ? 'Disconnecting...' : 'Disconnect Stripe'}
                    onClick={this.handleDisconnectStripeAccount}
                    disabled={loadingDisconnectStripeAccount}
                  />

                  {errorDisconnectingStripeAccount && <UnknownError action='disconnecting your Stripe account' />}

                  <br />
                  <br />
                </div>
              }


              <div className='flex-0 text-base sm:text-lg text-left mb-1'>Delete Account</div>
              <p className='text-left font-normal'>By deleting your account, your apps will stop working, and your users will permanently lose access to their accounts. This action is irreversible.</p>

              <input
                className='btn w-56'
                type='button'
                value={loadingDeleteAdmin ? 'Deleting...' : 'Delete Account'}
                disabled={loadingDeleteAdmin}
                onClick={this.handleDeleteAccount}
              />

              {errorDeletingAdmin && (
                errorDeletingAdmin === 'Unknown Error'
                  ? <UnknownError action='deleting your account' />
                  : <div className='error'>{errorDeletingAdmin}</div>
              )}
            </div>
        }

      </div>
    )
  }
}

EditAdmin.propTypes = {
  handleUpdateAccount: func,
  admin: object,
  upgrade: bool,
  enablePayments: bool,
  enableStoragePlan1: bool,
}
