import React, { Component } from 'react'
import AdminForm from './components/Admin/AdminForm'
import adminLogic from './components/Admin/logic'
import Dashboard from './components/Dashboard/Dashboard'
import AppUsersTable from './components/Dashboard/AppUsersTable'
import EditAdmin from './components/Admin/EditAdmin'
import UnknownError from './components/Admin/UnknownError'
import { getStripeState } from './config'

export default class App extends Component {
  constructor(props) {
    super(props)

    this.state = {
      mode: undefined,
      signedIn: undefined,
      admin: {},
      mobileMenuOpen: false,
      loadingAdmin: true,
      errorGettingAdmin: false,
    }

    this.handleSignOut = this.handleSignOut.bind(this)
    this.handleUpdateAccount = this.handleUpdateAccount.bind(this)
    this.handleReadHash = this.handleReadHash.bind(this)
    this.handleToggleMobileMenu = this.handleToggleMobileMenu.bind(this)
    this.handleStripeConnectRedirect = this.handleStripeConnectRedirect.bind(this)
  }

  async componentDidMount() {
    window.addEventListener('hashchange', this.handleReadHash, false)
    const signedIn = await this.handleReadHash()

    let admin
    if (signedIn) {
      try {
        admin = await adminLogic.getAdminAccount()

        if (
          admin.paymentStatus === 'past_due' || admin.paymentStatus === 'incomplete' ||
          admin.paymentsAddOnSubscriptionStatus === 'past_due' || admin.paymentsAddOnSubscriptionStatus === 'incomplete' ||
          admin.storageSubscriptionStatus === 'past_due' || admin.storageSubscriptionStatus === 'incomplete'
        ) {
          window.alert('Please update your payment method!')
        }

      } catch (e) {
        this.setState({ errorGettingAdmin: true })
      }
    }

    this.setState({ admin: { ...this.state.admin, ...admin }, loadingAdmin: false })
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.handleReadHash, false)
  }

  async handleSignOut() {
    await adminLogic.signOut()
  }

  handleUpdateAccount(updatedAdminFields) {
    const admin = this.state.admin
    this.setState({ admin: { ...admin, ...updatedAdminFields } })
  }

  async handleStripeConnectRedirect(hashRoute, updatedState) {
    const params = {}

    // separate parameters
    const paramsString = hashRoute.substring(15)
    for (let param of paramsString.split('&').map(param => param.split('='))) {
      const key = param[0]
      const value = param[1]
      params[key] = value
    }

    // the state value provided prevents CSRF attack
    if (params.state !== getStripeState() || !params.code) {
      console.warn(`Unknown params ${JSON.stringify(params)}.`)
      window.location.hash = ''
    } else {
      const stripeOauthCode = params.code

      try {
        await adminLogic.completeStripeConnection(stripeOauthCode)
        updatedState.admin.connectedToStripe = true
        window.location.hash = ''
        window.alert('Stripe account connected successfully!')
      } catch {
        window.location.hash = 'edit-account'
        window.alert('Stripe account failed to connect! Please try again.')
      }

      this.setState({ ...updatedState })
    }
  }

  async handleReadHash() {
    const sessionJson = localStorage.getItem('adminSession')
    const session = sessionJson && JSON.parse(sessionJson)
    const signedIn = session && session.signedIn
    const email = session && session.email
    const fullName = session && session.fullName

    const updatedState = { signedIn, mobileMenuOpen: false, admin: this.state.admin }

    if (email !== this.state.admin.email) {
      updatedState.admin.email = email
    }

    if (fullName !== this.state.admin.fullName) {
      updatedState.admin.fullName = fullName
    }

    if (!signedIn && this.state.signedIn) {
      updatedState.admin = { email }
      updatedState.errorGettingAdmin = false
      updatedState.signedIn = false
      updatedState.upgrade = false
      updatedState.enablePayments = false
    }

    const hashRoute = window.location.hash.substring(1)

    switch (hashRoute) {
      case 'create-admin':
      case 'sign-in':
        signedIn
          ? window.location.hash = ''
          : this.setState({ mode: hashRoute, ...updatedState })
        break

      case 'edit-account':
        signedIn
          ? this.setState({ mode: hashRoute, ...updatedState })
          : window.location.hash = ''
        break

      case 'success':
        window.alert('Payment successful!')
        window.location.hash = ''
        break

      case 'update-success':
        window.alert('Payment method saved!')
        window.location.hash = ''
        break

      case 'upgrade':
      case 'storage-plan-1':
      case 'enable-payments':
        // will redirect to edit-account when admin visits this link, then signs in or signs up. Will automatically
        // simulate clicking the button to perform the action (upgrade or enable payments)
        if (hashRoute === 'enable-payments') this.setState({ enablePayments: true })
        else if (hashRoute === 'storage-plan-1') this.setState({ enableStoragePlan1: true })
        else this.setState({ [hashRoute]: true })
        window.location.hash = 'edit-account'
        break

      default:
        if (hashRoute && signedIn && hashRoute.substring(0, 4) === 'app=') {
          this.setState({ mode: 'app-users-table', ...updatedState })
        } else if (hashRoute && signedIn && hashRoute.substring(0, 14) === 'stripe-connect') {
          await this.handleStripeConnectRedirect(hashRoute, updatedState)
        } else {
          signedIn
            ? this.setState({ mode: 'dashboard', ...updatedState })
            : window.location.hash = session ? 'sign-in' : 'create-admin'
        }
    }

    return signedIn
  }

  handleToggleMobileMenu(e) {
    e.preventDefault()
    this.setState({ mobileMenuOpen: !this.state.mobileMenuOpen })
  }

  render() {
    const {
      mode,
      signedIn,
      admin,
      mobileMenuOpen,
      loadingAdmin,
      errorGettingAdmin,
      upgrade,
      enablePayments,
      enableStoragePlan1,
    } = this.state

    if (!mode) {
      return <div />
    }

    return (
      <div>
        <header className='sm:sticky top-0 bg-white z-50 shadow-md mb-0 sm:mb-8'>
          <div className='sm:flex sm:justify-between sm:items-center py-2 px-4'>
            <div className='flex items-center justify-between h-10'>
              <div className='flex-shrink-0'>
                <div className='flex text-lg text-center menu'>
                  <a href='https://userbase.com'><img alt='Userbase' className='h-8' src={require('./img/logo.png')} /></a>
                  <span className='hidden sm:block font-semibold py-2 px-3 tracking-tight leading-none'>{signedIn ? admin.fullName : ''}</span>
                </div>
              </div>
              <div className='sm:hidden'>
                {signedIn &&
                  <button onClick={this.handleToggleMobileMenu} type='button' className='block text-blackish hover:text-orange-700 focus:text-orange-700 focus:outline-none'>
                    <svg className='h-6 w-6 fill-current' viewBox='0 0 24 24'>
                      <path className={`${mobileMenuOpen ? '' : 'hidden'} menu-close`} fillRule='evenodd' d='M18.278 16.864a1 1 0 0 1-1.414 1.414l-4.829-4.828-4.828 4.828a1 1 0 0 1-1.414-1.414l4.828-4.829-4.828-4.828a1 1 0 0 1 1.414-1.414l4.829 4.828 4.828-4.828a1 1 0 1 1 1.414 1.414l-4.828 4.829 4.828 4.828z' />
                      <path className={`${mobileMenuOpen ? 'hidden' : ''} menu-open`} fillRule='evenodd' d='M4 5h16a1 1 0 0 1 0 2H4a1 1 0 1 1 0-2zm0 6h16a1 1 0 0 1 0 2H4a1 1 0 0 1 0-2zm0 6h16a1 1 0 0 1 0 2H4a1 1 0 0 1 0-2z' />
                    </svg>
                  </button>
                }
              </div>
            </div>

            {signedIn
              ? <nav className={`pt-0 pb-8 sm:flex sm:p-0 text-lg text-center menu ${mobileMenuOpen ? '' : 'hidden'}`}>
                <a href='/' className='menu-item'>Apps</a>
                <a href='https://userbase.com/docs/' target='_blank' rel='noopener noreferrer' className='menu-item'>Docs</a>
                <a href='#edit-account' className='menu-item'>Account</a>
                <a href='#' onClick={this.handleSignOut} className='menu-item'>Sign out</a>
              </nav>
              : <nav className='pt-0 pb-8 hidden sm:flex sm:p-0 text-lg text-center menu' />
            }
          </div>
        </header>

        {errorGettingAdmin
          ? <div className='container content text-xs sm:text-base'>
            <UnknownError noMarginTop />
          </div>
          : loadingAdmin
            ? <div className='text-center'>< div className='loader w-6 h-6 inline-block' /></div>
            : (() => {
              switch (mode) {
                case 'create-admin':
                  return <AdminForm
                    formType='Create Admin'
                    key='create-admin'
                    placeholderEmail=''
                    handleUpdateAccount={this.handleUpdateAccount}
                    upgrade={upgrade}
                    enablePayments={enablePayments}
                    enableStoragePlan1={enableStoragePlan1}
                  />

                case 'sign-in':
                  return <AdminForm
                    formType='Sign In'
                    key='sign-in'
                    placeholderEmail={admin.email}
                    handleUpdateAccount={this.handleUpdateAccount}
                    upgrade={upgrade}
                    enablePayments={enablePayments}
                    enableStoragePlan1={enableStoragePlan1}
                  />

                case 'dashboard':
                  return <Dashboard
                    admin={admin}
                  />

                case 'app-users-table':
                  return <AppUsersTable
                    appName={decodeURIComponent(window.location.hash.substring(5))}
                    admin={admin}
                    key={window.location.hash} // re-renders on hash change
                  />

                case 'edit-account':
                  return <EditAdmin
                    upgrade={upgrade}
                    enablePayments={enablePayments}
                    enableStoragePlan1={enableStoragePlan1}
                    handleUpdateAccount={this.handleUpdateAccount}
                    admin={admin}
                  />

                default:
                  return null
              }
            })()
        }

      </div>
    )
  }
}
