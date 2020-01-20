import React, { Component } from 'react'
import { func, string } from 'prop-types'
import adminLogic from './logic'

export default class EditAdmin extends Component {
  constructor(props) {
    super(props)
    this.state = {
      email: '',
      fullName: '',
      password: '',
      loading: false,
      loadingUpdate: false,
      loadingDelete: false,
      errorUpdating: '',
      errorDeleting: ''
    }

    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleUpdateAcount = this.handleUpdateAcount.bind(this)
    this.handleDeleteAccount = this.handleDeleteAccount.bind(this)
    this.handleCancelSubscription = this.handleCancelSubscription.bind(this)
    this.handleResumeSubscription = this.handleResumeSubscription.bind(this)
  }

  async componentDidMount() {
    this._isMounted = true
    document.addEventListener('keydown', this.handleHitEnter, true)
  }

  componentWillUnmount() {
    this._isMounted = false
    document.removeEventListener('keydown', this.handleHitEnter, true)
  }

  handleHitEnter(e) {
    const ENTER_KEY_CODE = 13
    if ((e.target.name === 'email' || e.target.name === 'password' || e.target.name === 'fullName') &&
      (e.key === 'Enter' || e.keyCode === ENTER_KEY_CODE)) {
      e.stopPropagation()
    }
  }

  handleInputChange(event) {
    if (this.state.errorUpdating || this.state.errorDeleting) {
      this.setState({ errorUpdating: undefined, errorDeleting: undefined })
    }

    const target = event.target
    const value = target.value
    const name = target.name

    this.setState({
      [name]: value
    })
  }

  async handleUpdateAcount(event) {
    const { email, password, fullName } = this.state
    event.preventDefault()

    if (!email && !password && !fullName) return

    this.setState({ loadingUpdate: true })

    try {
      await adminLogic.updateAdmin({ email, password, fullName })
      if (email || fullName) this.props.handleUpdateAccount(email, fullName)
      if (this._isMounted) this.setState({ email: '', password: '', fullName: '', loadingUpdate: false })
    } catch (e) {
      if (this._isMounted) this.setState({ errorUpdating: e.message, loadingUpdate: false })
    }
  }

  async handleDeleteAccount(event) {
    event.preventDefault()

    this.setState({ errorDeleting: '' })

    try {
      if (window.confirm('Are you sure you want to delete your account?')) {
        this.setState({ loadingDelete: true })
        await adminLogic.deleteAdmin()
      }
    } catch (e) {
      if (this._isMounted) this.setState({ errorDeleting: e.message, loadingDelete: false })
    }
  }

  async handleCheckout(event) {
    event.preventDefault()

    try {
      await adminLogic.subscribeToSaas()
    } catch (e) {
      console.log(e.message)
    }
  }

  async handleUpdatePaymentMethod(event) {
    event.preventDefault()

    try {
      await adminLogic.updateSaasPaymentMethod()
    } catch (e) {
      console.log(e.message)
    }
  }

  async handleCancelSubscription(event) {
    event.preventDefault()

    try {
      if (window.confirm('Are you sure you want to cancel your subscription?')) {
        this.setState({ loading: true })
        const paymentStatus = await adminLogic.cancelSaasSubscription()

        this.props.handleUpdatePaymentStatus(paymentStatus)
      }
    } catch (e) {
      console.log(JSON.stringify(e), e.message)
    }

    if (this._isMounted) this.setState({ loading: false })
  }

  async handleResumeSubscription(event) {
    event.preventDefault()

    try {
      this.setState({ loading: true })
      await adminLogic.resumeSaasSubscription()
      const paymentStatus = await adminLogic.getPaymentStatus()

      this.props.handleUpdatePaymentStatus(paymentStatus)
    } catch (e) {
      console.log(e.message)
    }

    if (this._isMounted) this.setState({ loading: false })
  }

  render() {
    // comment for hackathon
    // const { paymentStatus } = this.props
    const {
      fullName,
      email,
      password,
      loadingUpdate,
      loadingDelete,
      errorUpdating,
      errorDeleting,
      // comment for hackathon
      // loading
    } = this.state

    return (
      <div className='container content text-xs xs:text-base text-center mb-8'>

        {/* comment for hackathon

        {loading
          ? <div className='loader inline-block w-6 h-6' />
          : paymentStatus === 'active' || paymentStatus === 'past_due'
            ?
            <div>
              <input
                className='btn w-56 text-center'
                type='button'
                role='link'
                value='Update Payment Method'
                onClick={this.handleUpdatePaymentMethod}
              />

              <br />
              <br />

              <input
                className='btn w-56 text-center'
                type='button'
                role='link'
                value='Cancel Subscription'
                onClick={this.handleCancelSubscription}
              />
            </div>
            :
            <div>
              <div className='font-light text-left mb-4'>
                You are currently using the <span className='font-bold'>free</span> version of Userbase.
              </div>

              {paymentStatus === 'cancel_at_period_end'
                ? <input
                  className='btn w-56 text-center'
                  type='button'
                  role='link'
                  value='Resume Subscription'
                  onClick={this.handleResumeSubscription}
                />
                : <input
                  className='btn w-56 text-center'
                  type='button'
                  role='link'
                  value='Purchase Subscription'
                  onClick={this.handleCheckout}
                />
              }
            </div>
        }

        <hr className='border border-t-0 border-gray-400 mt-8 mb-4' />

      */}

        <form onSubmit={this.handleUpdateAcount}>
          <div className='table'>

            <div className='table-row'>
              <div className='table-cell p-2 text-right'>Full Name</div>
              <div className='table-cell p-2'>
                <input
                  className='font-light text-xs xs:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none'
                  type='text'
                  name='fullName'
                  autoComplete='name'
                  value={fullName}
                  onChange={this.handleInputChange}
                />
              </div>
            </div>

            <div className='table-row'>
              <div className='table-cell p-2 text-right'>Email</div>
              <div className='table-cell p-2'>
                <input
                  className='font-light text-xs xs:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none'
                  type='email'
                  name='email'
                  autoComplete='email'
                  onChange={this.handleInputChange}
                  value={email}
                />
              </div>
            </div>

            <div className='table-row'>
              <div className='table-cell p-2 text-right'>Password</div>
              <div className='table-cell p-2'>
                <input
                  className='font-light text-xs xs:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none'
                  type='password'
                  name='password'
                  autoComplete='new-password'
                  onChange={this.handleInputChange}
                  value={password}
                />
              </div>
            </div>

          </div>


          <div className='text-center'>
            <input
              className='btn w-40 mt-4'
              type='submit'
              value={loadingUpdate ? 'Updating...' : 'Update Account'}
              disabled={(!fullName && !email && !password) || loadingDelete || loadingUpdate}
            />

            <div className='error'>{errorUpdating}</div>
          </div>

        </form>

        <hr className='border border-t-0 border-gray-400 mt-8 mb-6' />

        <input
          className='btn w-40'
          type='button'
          value={loadingDelete ? 'Deleting...' : 'Delete Account'}
          disabled={loadingDelete}
          onClick={this.handleDeleteAccount}
        />

        {errorDeleting && <div className='error'>{errorDeleting}</div>}

      </div>
    )
  }
}

EditAdmin.propTypes = {
  handleUpdateAccount: func,
  paymentStatus: string,
  handleUpdatePaymentStatus: func
}
