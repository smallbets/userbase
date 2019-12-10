import React, { Component } from 'react'
import AdminForm from './components/Admin/AdminForm'
import adminLogic from './components/Admin/logic'
import Dashboard from './components/Dashboard/Dashboard'
import AppUsersTable from './components/Dashboard/AppUsersTable'
import EditAdmin from './components/Admin/EditAdmin'

export default class App extends Component {
  constructor(props) {
    super(props)

    this.state = {
      mode: undefined,
      email: undefined
    }

    this.handleSignOut = this.handleSignOut.bind(this)
    this.handleReadHash = this.handleReadHash.bind(this)
  }

  componentDidMount() {
    window.addEventListener('hashchange', this.handleReadHash, false)
    this.handleReadHash()
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.handleReadHash, false)
  }

  async handleSignOut() {
    await adminLogic.signOut()
  }

  handleReadHash() {
    const sessionJson = localStorage.getItem('adminSession')
    const session = sessionJson && JSON.parse(sessionJson)
    const signedIn = session && session.signedIn
    const email = session && session.email

    if (email && email !== this.state.email) {
      this.setState({ email: session.email })
    }

    const hashRoute = window.location.hash.substring(1)

    switch (hashRoute) {
      case 'create-admin':
      case 'sign-in':
        return signedIn
          ? window.location.hash = ''
          : this.setState({ mode: hashRoute })

      case 'edit-account':
        return signedIn
          ? this.setState({ mode: hashRoute })
          : window.location.hash = ''

      default:
        if (hashRoute && hashRoute.substring(0, 4) === 'app=' && signedIn) {
          return this.setState({ mode: 'app-users-table' })
        }

        return signedIn
          ? this.setState({ mode: 'dashboard' })
          : window.location.hash = session ? 'sign-in' : 'create-admin'
    }
  }

  render() {
    const { mode, email } = this.state

    if (!mode) {
      return <div />
    }

    return (
      <div>
        <nav className='flex items-center min-w-full text-sm sm:text-lg font-extrabold bg-white shadow-md p-2 h-14 sm:h-16 mb-10'>
          <div className='flex-0 ml-2 tracking-tight'>
            <div className='flex items-center min-w-full'>
              <a href='#'><img src={require('./img/icon.png')} className='h-10 sm:h-12' /></a>
              <p className='ml-4 italic'>Admin Panel</p>
            </div>
          </div>
          <div className='flex-1 text-right tracking-tight mr-5'>
            {mode === 'sign-in' || mode === 'create-admin'
              ? <ul>
                <li className='inline-block ml-4'><a className={mode === 'sign-in' ? 'text-orange-600' : ''} href='#sign-in'>Sign in</a></li>
                <li className='inline-block ml-4'><a className={mode === 'create-admin' ? 'text-orange-600' : ''} href='#create-admin'>New admin</a></li>
              </ul>
              : <ul>
                <li className='inline-block ml-4 font-light'><a className={mode === 'edit-account' ? 'text-orange-600' : ''} href='#edit-account'>{email}</a></li>
                <li className='inline-block ml-4'><a href='#' onClick={this.handleSignOut}>Sign out</a></li>
              </ul>
            }
          </div>
        </nav>

        {(() => {
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
              />

            case 'dashboard':
              return <Dashboard />

            case 'app-users-table':
              return <AppUsersTable
                appName={decodeURIComponent(window.location.hash.substring(5))}
                key={window.location.hash} // re-renders on hash change
              />

            case 'edit-account':
              return <EditAdmin />

            default:
              return null
          }
        })()}

      </div>
    )
  }
}
