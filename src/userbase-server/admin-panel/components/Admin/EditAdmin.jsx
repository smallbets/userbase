import React, { Component } from 'react'
import { func, string } from 'prop-types'
import adminLogic from './logic'
import UnknownError from './UnknownError'

export default class EditAdmin extends Component {
  constructor(props) {
    super(props)
    this.state = {
      email: this.props.email,
      fullName: this.props.fullName,
      currentPassword: '',
      newPassword: '',
      accessToken: '',
      loading: true,
      loadingUpdateAdmin: false,
      loadingChangePassword: false,
      loadingDeleteAdmin: false,
      loadingCheckout: false,
      loadingCancel: false,
      loadingUpdatePaymentMethod: false,
      loadingResumeSubscription: false,
      errorLoading: '',
      errorUpdatingAdmin: '',
      errorChangingPassword: '',
      errorDeletingAdmin: '',
      errorCheckingOut: false,
      errorCancelling: false,
      errorUpdatingPaymentMethod: false,
      errorResumingSubscription: false
    }

    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleUpdateAcount = this.handleUpdateAcount.bind(this)
    this.handleChangePassword = this.handleChangePassword.bind(this)
    this.handleDeleteAccount = this.handleDeleteAccount.bind(this)
    this.handleCancelSubscription = this.handleCancelSubscription.bind(this)
    this.handleResumeSubscription = this.handleResumeSubscription.bind(this)
    this.handleCheckout = this.handleCheckout.bind(this)
    this.handleUpdatePaymentMethod = this.handleUpdatePaymentMethod.bind(this)
    this.handleClearErrors = this.handleClearErrors.bind(this)
  }

  async componentDidMount() {
    this._isMounted = true
    document.addEventListener('keydown', this.handleHitEnter, true)

    try {
      const accessToken = await adminLogic.getAccessToken()
      if (this._isMounted) this.setState({ accessToken, loading: false })
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
    ) {
      this.setState({
        ...loadingState,
        errorUpdatingAdmin: '',
        errorChangingPassword: '',
        errorDeletingAdmin: '',
        errorCheckingOut: false,
        errorCancelling: false,
        errorUpdatingPaymentMethod: false,
        errorResumingSubscription: false
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

    const fullName = this.state.fullName !== this.props.fullName && this.state.fullName
    const email = this.state.email !== this.props.email && this.state.email

    if (!fullName && !email) return

    this.handleClearErrors({ loadingUpdateAdmin: true })

    try {
      await adminLogic.updateAdmin({ fullName, email })
      if (email || fullName) this.props.handleUpdateAccount(email, fullName)
      if (this._isMounted) {
        this.setState({
          fullName: fullName || this.props.fullName,
          email: email || this.props.email,
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

        this.props.handleUpdatePaymentStatus(paymentStatus)

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
      const paymentStatus = await adminLogic.getPaymentStatus()

      this.props.handleUpdatePaymentStatus(paymentStatus)

      if (this._isMounted) this.setState({ loadingResumeSubscription: false })
    } catch (e) {
      if (this._isMounted) this.setState({ loadingResumeSubscription: false, errorResumingSubscription: true })
    }
  }

  render() {
    const { paymentStatus } = this.props
    const {
      fullName,
      email,
      currentPassword,
      newPassword,
      accessToken,
      loadingUpdateAdmin,
      loadingChangePassword,
      loadingDeleteAdmin,
      loadingCheckout,
      loadingCancel,
      loadingUpdatePaymentMethod,
      loadingResumeSubscription,
      errorUpdatingAdmin,
      errorChangingPassword,
      errorDeletingAdmin,
      errorCheckingOut,
      errorCancelling,
      errorUpdatingPaymentMethod,
      errorResumingSubscription,
      loading,
      errorLoading,
    } = this.state

    const disableUpdateButton = (fullName === this.props.fullName || !fullName)
      && (email === this.props.email || !email)

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
                  <div className='flex-0 text-lg sm:text-xl text-left mb-4'>Subscription</div>

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
                  <div className='flex-0 text-lg sm:text-xl text-left mb-4'>Subscription</div>

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

              <div className='flex-0 text-lg sm:text-xl text-left mb-4'>Access Token</div>

              <div className='px-1 font-mono font-light text-center'>{accessToken}</div>

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
  paymentStatus: string,
  handleUpdatePaymentStatus: func,
  fullName: string,
  email: string
}
