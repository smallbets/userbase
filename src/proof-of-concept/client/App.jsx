import React, { Component } from 'react'
import userLogic from './components/User/logic'
import dashboardLogic from './components/Dashboard/logic'
import Dashboard from './components/Dashboard/Dashboard'
import UserForm from './components/User/UserForm'
import ShowKey from './components/User/ShowKey'
import SaveKey from './components/User/SaveKey'

const displaySignInForm = () => window.location.hash.substring(1) === 'sign-in'
const displaySignUpForm = () => window.location.hash.substring(1) === 'sign-up'
const displayShowKeyForm = () => window.location.hash.substring(1) === 'show-key'
const displaySaveKeyForm = () => window.location.hash.substring(1) === 'save-key'

export default class App extends Component {
  constructor(props) {
    super(props)

    this.state = {
      session: {
        seed: undefined,
        username: undefined,
        signedIn: undefined,
        firstTimeRequestingSeed: undefined,
        tempPublicKey: undefined
      },
      mode: undefined,
      todos: [],
      loading: true
    }

    this.handleDbChange = this.handleDbChange.bind(this)
    this.handleUpdateSession = this.handleUpdateSession.bind(this)
    this.handleUpdateSessionOnSignup = this.handleUpdateSessionOnSignup.bind(this)
    this.handleSetKeyInState = this.handleSetKeyInState.bind(this)
    this.handleSignOut = this.handleSignOut.bind(this)
    this.handleRemoveUserAuthentication = this.handleRemoveUserAuthentication.bind(this)
    this.handleReadHash = this.handleReadHash.bind(this)
    this.handleAutoRedirects = this.handleAutoRedirects.bind(this)
    this.handleGrantDatabaseAccess = this.handleGrantDatabaseAccess.bind(this)
  }

  async componentDidMount() {
    await userLogic.init(this.handleUpdateSession)

    window.addEventListener('hashchange', this.handleReadHash, false)
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.handleReadHash, false)
  }

  handleDbChange(todos) {
    this.setState({ todos })
  }

  // this auto redirects to an appropriate view based on session
  async handleAutoRedirects(session) {
    const { loading } = this.state

    let userMustLogInAgain = !session || !session.signedIn
    let userHasActiveSession = session && session.signedIn

    if (loading && userHasActiveSession) {
      await dashboardLogic.createOrOpenDatabase(session.username, this.handleDbChange, () => this.setState({ loading: false }))
    }

    if (!displaySignUpForm() && userMustLogInAgain) {
      // if the user is logged out, redirect to the sign-in form
      window.location.hash = 'sign-in'
    } else if (userHasActiveSession && !session.seed) {
      // if the user is logged in, but the browser doesn't have a key for the user, redirect to the save-key form
      window.location.hash = 'save-key'
    }
  }

  handleUpdateSession(session) {
    window.location.hash = ''
    this.setState({ session, mode: this.getViewMode(session) })
    this.handleAutoRedirects(session)
  }

  handleUpdateSessionOnSignup(session) {
    window.location.hash = '#show-key'
    this.setState({ session, mode: this.getViewMode(session) })
    this.handleAutoRedirects(session)
  }

  handleSetKeyInState(seed) {
    this.setState({ session: { ...this.state.session, seed } })
    window.location.hash = ''
  }

  // this is called when the user signs out, or when the server says the session has expired
  handleRemoveUserAuthentication() {
    this.setState({ loading: true })
    window.location.hash = 'sign-in'
  }

  async handleSignOut() {
    await userLogic.signOut()
    this.handleRemoveUserAuthentication()
  }

  handleReadHash() {
    this.setState({ mode: this.getViewMode(this.state.session) })
  }

  async handleGrantDatabaseAccess() {
    const username = window.prompt('Grant access to this database to user:')
    if (!username) return
    const readOnly = window.confirm('Grant read only access')

    await dashboardLogic.grantDatabaseAccess(
      this.state.session.username,
      username,
      readOnly
    )
  }

  // this is a primitive router based on the hash and component state
  getViewMode(session) {
    const userHasActiveSession = session && session.signedIn

    if (userHasActiveSession && displayShowKeyForm()) {
      // if the user has a session and the hash says show-key, then show the show-key form
      return 'show-key'
    } else if (userHasActiveSession && displaySaveKeyForm()) {
      // if the user has a session and the hash says save-key, then show the save-key form
      return 'save-key'
    } else if (userHasActiveSession) {
      // if the user has a session, then show the todo dashboard
      return 'dashboard'
    } else if (displaySignInForm()) {
      // if the hash says sign-in, show the sign-in form
      return 'sign-in'
    } else if (displaySignUpForm()) {
      // if the hash says sign-up, show the sign-up form
      return 'sign-up'
    }

    // this happens when the App is loading initially, and will not render anything except the nav bar
    return undefined
  }

  render() {
    const { session, mode, todos, loading } = this.state

    // if mode is undefined, just render an empty div
    if (!mode) {
      return <div />
    }

    const userHasActiveSession = session && session.signedIn

    return (
      <div>
        <nav className='flex items-center min-w-full text-sm sm:text-lg font-extrabold bg-white shadow-md p-2 h-14 sm:h-16 mb-10'>
          <div className='flex-0 ml-2'>
            <a href='#'><img src={require('./img/icon.png')} className='h-10 sm:h-12' /></a>
          </div>
          <div className='flex-1 text-right tracking-tight mr-5'>
            {!userHasActiveSession
              ? <ul>
                <li className='inline-block ml-4'><a className={mode === 'sign-in' ? 'text-orange-600' : ''} href='#sign-in'>Sign in</a></li>
                <li className='inline-block ml-4'><a className={mode === 'sign-up' ? 'text-orange-600' : ''} href='#sign-up'>New account</a></li>
              </ul>
              : <ul>
                <li className='inline-block ml-4 font-light'>{session.username}</li>
                <li className='inline-block ml-4'><a className='fa-user-plus no-underline cursor-pointer' onClick={this.handleGrantDatabaseAccess}></a></li>
                <li className='inline-block ml-4'><a className={'fa-key no-underline ' + (mode === 'show-key' ? 'text-orange-600' : '')} href='#show-key'></a></li>
                <li className='inline-block ml-4'><a href='#' onClick={this.handleSignOut}>Sign out</a></li>
              </ul>
            }
          </div>
        </nav>

        {(() => {
          switch (mode) {
            case 'dashboard':
              return <Dashboard
                handleRemoveUserAuthentication={this.handleRemoveUserAuthentication}
                username={session && session.username}
                todos={todos}
                loading={loading} />
            case 'show-key':
              return <ShowKey keyString={session.seed} />
            case 'save-key':
              return <SaveKey
                handleSetKeyInState={this.handleSetKeyInState}
                firstTimeRequestingSeed={session.firstTimeRequestingSeed}
                tempPublicKey={session.tempPublicKey}
              />
            case 'sign-in':
              return <UserForm
                handleUpdateSession={this.handleUpdateSession}
                formType='Sign In'
                key='sign-in'
                placeholderUsername={session && session.username}
              />
            case 'sign-up':
              return <UserForm handleUpdateSession={this.handleUpdateSessionOnSignup}
                formType='Sign Up'
                key='sign-up'
                placeholderUsername='' />
            default:
              return null
          }
        })()}
      </div>
    )
  }
}
