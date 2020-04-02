import React, { Component } from 'react'
import { func, object } from 'prop-types'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import adminLogic from './logic'
import UnknownError from './UnknownError'
import { formatDate } from '../../utils'
import { STRIPE_CLIENT_ID, getStripeState } from '../../config'

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
      loadingDisconnectStripeAccount: false,
      errorLoading: '',
      errorUpdatingAdmin: '',
      errorChangingPassword: '',
      errorDeletingAdmin: '',
      errorCheckingOut: false,
      errorGeneratingAccessToken: false,
      errorDeletingAccessToken: false,
      errorCancelling: false,
      errorUpdatingPaymentMethod: false,
      errorResumingSubscription: false,
      errorDisconnectingStripeAccount: false,
    }

    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleUpdateAcount = this.handleUpdateAcount.bind(this)
    this.handleChangePassword = this.handleChangePassword.bind(this)
    this.handleGenerateAccessToken = this.handleGenerateAccessToken.bind(this)
    this.handleDeleteAccessToken = this.handleDeleteAccessToken.bind(this)
    this.handleDeleteAccount = this.handleDeleteAccount.bind(this)
    this.handleCancelSubscription = this.handleCancelSubscription.bind(this)
    this.handleResumeSubscription = this.handleResumeSubscription.bind(this)
    this.handleCheckout = this.handleCheckout.bind(this)
    this.handleUpdatePaymentMethod = this.handleUpdatePaymentMethod.bind(this)
    this.handleDisconnectStripeAccount = this.handleDisconnectStripeAccount.bind(this)
    this.handleClearErrors = this.handleClearErrors.bind(this)
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
      || this.state.errorCancelling
      || this.state.errorUpdatingPaymentMethod
      || this.state.errorResumingSubscription
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
        errorCancelling: false,
        errorUpdatingPaymentMethod: false,
        errorResumingSubscription: false,
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
    event.preventDefault()

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
      if (window.confirm('Are you sure you want to cancel your subscription?')) {
        this.setState({ loadingCancel: true })
        const paymentStatus = await adminLogic.cancelSaasSubscription()

        this.props.handleUpdateAccount({ paymentStatus })

        if (this._isMounted) this.setState({ loadingCancel: false })
      }
    } catch (e) {
      if (this._isMounted) this.setState({ loadingCancel: false, errorCancelling: true })
    }
  }

  async handleResumeSubscription(event) {
    event.preventDefault()

    try {
      this.handleClearErrors({ loadingResumeSubscription: true })

      await adminLogic.resumeSaasSubscription()
      const { paymentStatus } = await adminLogic.getAdminAccount()

      this.props.handleUpdateAccount({ paymentStatus })

      if (this._isMounted) this.setState({ loadingResumeSubscription: false })
    } catch (e) {
      if (this._isMounted) this.setState({ loadingResumeSubscription: false, errorResumingSubscription: true })
    }
  }

  async handleDisconnectStripeAccount(event) {
    event.preventDefault()

    try {
      if (window.confirm('Are you sure you want to disconnect your Stripe account?')) {
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
    const { paymentStatus, connectedToStripe } = admin
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
      loadingGenerateAccessToken,
      loadingCancel,
      loadingUpdatePaymentMethod,
      loadingDisconnectStripeAccount,
      loadingResumeSubscription,
      errorUpdatingAdmin,
      errorChangingPassword,
      errorDeletingAdmin,
      errorCheckingOut,
      errorGeneratingAccessToken,
      errorDeletingAccessToken,
      errorCancelling,
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
            : <div>
              {paymentStatus === 'active' || paymentStatus === 'past_due'
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

                </div>
                :
                <div>
                  <div className='flex-0 text-lg sm:text-xl text-left mb-4'>Userbase Subscription</div>

                  <div className='font-normal text-left mb-4'>
                    <p>Your trial account is limited to 1 app and 3 users.</p>
                    <p>Remove this limit with a Userbase subscription for only $49 per year.</p>
                  </div>

                  {paymentStatus === 'cancel_at_period_end'
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

                </div>
              }

              <hr className='border border-t-0 border-gray-400 mt-8 mb-4' />

              {!connectedToStripe &&
                <div>
                  <div className='flex-0 text-lg sm:text-xl text-left mb-1'>Payment Portal</div>
                  <p className='text-left font-normal mb-4'>Collect payments on your apps with Stripe.</p>

                  <a
                    href={`https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${STRIPE_CLIENT_ID}&scope=read_write&state=${getStripeState()}`}
                    className='stripe-connect light-blue'>
                    <span>Connect with Stripe</span>
                  </a>

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

              {(paymentStatus === 'active' || paymentStatus === 'past_due') &&
                <div>
                  <div className='flex-0 text-base sm:text-lg text-left mb-1'>Cancel Subscription</div>
                  <p className='text-left font-normal'>By cancelling your subscription, your account will become limited to 3 users, and no new sign ups will succeed once that limit is reached.</p>

                  <input
                    className='btn w-56'
                    type='button'
                    role='link'
                    value={loadingCancel ? 'Cancelling Subscription...' : 'Cancel Subscription'}
                    disabled={loadingCancel || loadingUpdatePaymentMethod}
                    onClick={this.handleCancelSubscription}
                  />

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

              {errorCancelling && <UnknownError action='cancelling your subscription' />}

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
}
