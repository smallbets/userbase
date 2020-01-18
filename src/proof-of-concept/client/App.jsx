import React, { Component } from 'react'
import userLogic from './components/User/logic'
import dbLogic from './components/Dashboard/logic'
import Dashboard from './components/Dashboard/Dashboard'
import UserForm from './components/User/UserForm'

const APP_ID = 'poc-id'

export default class App extends Component {
  constructor(props) {
    super(props)

    this.state = {
      username: undefined,
      signedIn: false,
      mode: undefined,
      loadingTodos: true,
      todos: [],
      signInError: undefined
    }

    this.handleSignIn = this.handleSignIn.bind(this)
    this.handleSignUp = this.handleSignUp.bind(this)
    this.handleSignOut = this.handleSignOut.bind(this)
    this.handleRemoveUserAuthentication = this.handleRemoveUserAuthentication.bind(this)
    this.handleReadHash = this.handleReadHash.bind(this)
    this.handleDbChange = this.handleDbChange.bind(this)
    this.handleSetSignInError = this.handleSetSignInError.bind(this)
  }

  async componentDidMount() {
    window.addEventListener('hashchange', this.handleReadHash, false)

    // use our own server for development
    if (window.location.host === 'localhost:3000') window._userbaseEndpoint = 'http://localhost:3000/v1'
    else if (window.location.host === 'staging.encrypted.dev') window._userbaseEndpoint = 'https://staging.encrypted.dev/v1'

    const session = await userLogic.init({ appId: APP_ID })

    if (session.user) {
      const { username } = session.user
      this.setState({ username, signedIn: true })

      this.handleReadHash()

      await dbLogic.openDatabase(username, this.handleDbChange)
    } else {

      if (session.lastUsedUsername) {
        this.setState({ username: session.lastUsedUsername })
      }

      this.handleReadHash()
    }
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.handleReadHash, false)
  }

  handleDbChange(todos) {
    this.setState({ todos, loadingTodos: false })
  }

  async handleSignIn(user) {
    const { username } = user
    this.setState({ username, signedIn: true, signInError: undefined })
    await dbLogic.openDatabase(username, this.handleDbChange)
    window.location.hash = ''
  }

  async handleSignUp(user) {
    const { username } = user
    this.setState({ username, signedIn: true })
    await dbLogic.openDatabase(username, this.handleDbChange)
    window.location.hash = ''
  }

  async handleSignOut() {
    await userLogic.signOut()
    this.handleRemoveUserAuthentication()
  }

  // this is called when the user signs out, or when the server says the session has expired
  handleRemoveUserAuthentication() {
    const { username } = this.state

    this.setState({
      username,
      signedIn: false,
      todos: [],
      loadingTodos: true
    })
    window.location.hash = 'sign-in'
  }

  handleReadHash() {
    const { username, signedIn } = this.state

    const hashRoute = window.location.hash.substring(1)

    switch (hashRoute) {
      case 'sign-up':
      case 'sign-in':
        // if user is signed in already, re-route to default
        return signedIn ? window.location.hash = '' : this.setState({ mode: hashRoute })

      default: {
        if (signedIn && hashRoute === '') {
          // default mode when user is signed in
          return this.setState({ mode: 'dashboard' })
        } else if (signedIn) {
          // user is signed in but on a route other than '', so re-route to ''
          return window.location.hash = ''
        } else {
          // user is not signed in and thus needs to be routed to sign-up or sign-in
          const needToSignUp = !username
          return window.location.hash = needToSignUp ? 'sign-up' : 'sign-in'
        }
      }
    }
  }

  handleSetSignInError(signInError) {
    this.setState({ signInError })
  }

  render() {
    const { username, signedIn, mode, loadingTodos, todos, signInError } = this.state

    if (!mode) {
      return <div />
    }

    return (
      <div>
        <nav className='flex items-center min-w-full text-sm sm:text-lg font-extrabold bg-white shadow-md p-2 h-14 sm:h-16 mb-10'>
          <div className='flex-0 ml-2'>
            <a href='#'><img src={require('./img/icon.png')} className='h-10 sm:h-12' /></a>
          </div>
          <div className='flex-1 text-right tracking-tight mr-5'>
            {!signedIn
              ? <ul>
                <li className='inline-block ml-4'><a className={mode === 'sign-in' ? 'text-orange-600' : ''} href='#sign-in'>Sign in</a></li>
                <li className='inline-block ml-4'><a className={mode === 'sign-up' ? 'text-orange-600' : ''} href='#sign-up'>New account</a></li>
              </ul>
              : <ul>
                <li className='inline-block ml-4 font-light'>{username}</li>
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
                username={username}
                todos={todos}
                loading={loadingTodos}
              />
            case 'sign-in':
              return <UserForm
                handleSubmit={this.handleSignIn}
                formType='Sign In'
                key='sign-in'
                placeholderUsername={username}
                handleSetSignInError={this.handleSetSignInError}
                error={signInError}
              />
            case 'sign-up':
              return <UserForm
                handleSubmit={this.handleSignUp}
                formType='Sign Up'
                key='sign-up'
                placeholderUsername=''
              />
            default:
              return null
          }
        })()}
      </div>
    )
  }
}
