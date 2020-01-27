import React, { Component } from 'react'
import AdminForm from './components/Admin/AdminForm'
import adminLogic from './components/Admin/logic'
import Dashboard from './components/Dashboard/Dashboard'
import AppUsersTable from './components/Dashboard/AppUsersTable'
import EditAdmin from './components/Admin/EditAdmin'
import UnknownError from './components/Admin/UnknownError'

export default class App extends Component {
  constructor(props) {
    super(props)

    this.state = {
      mode: undefined,
      signedIn: undefined,
      email: undefined,
      fullName: undefined,
      paymentStatus: undefined,
      mobileMenuOpen: false,
      loadingPaymentStatus: true,
      errorGettingPaymentStatus: false,
    }

    this.handleSignOut = this.handleSignOut.bind(this)
    this.handleUpdateAccount = this.handleUpdateAccount.bind(this)
    this.handleReadHash = this.handleReadHash.bind(this)
    this.handleUpdatePaymentStatus = this.handleUpdatePaymentStatus.bind(this)
    this.handleToggleMobileMenu = this.handleToggleMobileMenu.bind(this)
  }

  async componentDidMount() {
    window.addEventListener('hashchange', this.handleReadHash, false)
    const signedIn = this.handleReadHash()

    let paymentStatus = undefined
    if (signedIn) {
      try {
        paymentStatus = await adminLogic.getPaymentStatus()

        if (this.state.signedIn && paymentStatus === 'past_due') {
          window.alert('Please update your payment method!')
        }

      } catch (e) {
        this.setState({ errorGettingPaymentStatus: true })
      }
    }

    this.setState({ paymentStatus, loadingPaymentStatus: false })
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.handleReadHash, false)
  }

  async handleSignOut() {
    await adminLogic.signOut()
  }

  handleUpdateAccount(email, fullName) {
    this.setState({
      email: email || this.state.email,
      fullName: fullName || this.state.fullName
    })
  }

  handleReadHash() {
    const sessionJson = localStorage.getItem('adminSession')
    const session = sessionJson && JSON.parse(sessionJson)
    const signedIn = session && session.signedIn
    const email = session && session.email
    const fullName = session && session.fullName

    const updatedState = { signedIn, mobileMenuOpen: false }

    if (email !== this.state.email) {
      updatedState.email = email
    }

    if (fullName !== this.state.fullName) {
      updatedState.fullName = fullName
    }

    if (!signedIn && this.state.signedIn) {
      updatedState.paymentStatus = undefined
      updatedState.errorGettingPaymentStatus = false
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

      default:
        if (hashRoute && hashRoute.substring(0, 4) === 'app=' && signedIn) {
          this.setState({ mode: 'app-users-table', ...updatedState })
        } else {
          signedIn
            ? this.setState({ mode: 'dashboard', ...updatedState })
            : window.location.hash = session ? 'sign-in' : 'create-admin'
        }
    }

    return signedIn
  }

  handleUpdatePaymentStatus(paymentStatus) {
    this.setState({ paymentStatus })
  }

  handleToggleMobileMenu(e) {
    e.preventDefault()
    this.setState({ mobileMenuOpen: !this.state.mobileMenuOpen })
  }

  render() {
    const {
      mode,
      signedIn,
      email,
      fullName,
      paymentStatus,
      mobileMenuOpen,
      loadingPaymentStatus,
      errorGettingPaymentStatus
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
                  <span className='hidden sm:block font-semibold py-2 px-3 tracking-tight leading-none'>{signedIn ? fullName : ''}</span>
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

        {errorGettingPaymentStatus
          ? <div className='container content text-xs sm:text-base'>
            <UnknownError noMarginTop />
          </div>
          : loadingPaymentStatus
            ? <div className='text-center'>< div className='loader w-6 h-6 inline-block' /></div>
            : (() => {
              switch (mode) {
                case 'create-admin':
                  return <AdminForm
                    formType='Create Admin'
                    key='create-admin'
                    placeholderEmail=''
                  />

                case 'sign-in':
                  return <AdminForm
                    formType='Sign In'
                    key='sign-in'
                    placeholderEmail={email}
                    handleUpdatePaymentStatus={this.handleUpdatePaymentStatus}
                  />

                case 'dashboard':
                  return <Dashboard paymentStatus={paymentStatus} />

                case 'app-users-table':
                  return <AppUsersTable
                    appName={decodeURIComponent(window.location.hash.substring(5))}
                    paymentStatus={paymentStatus}
                    key={window.location.hash} // re-renders on hash change
                  />

                case 'edit-account':
                  return <EditAdmin
                    paymentStatus={paymentStatus}
                    handleUpdateAccount={this.handleUpdateAccount}
                    handleUpdatePaymentStatus={this.handleUpdatePaymentStatus}
                    fullName={fullName}
                    email={email}
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
