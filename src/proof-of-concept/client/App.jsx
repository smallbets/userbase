import React, { Component } from 'react'
import userLogic from './components/User/logic'
import dbLogic from './components/Dashboard/logic'
import Dashboard from './components/Dashboard/Dashboard'
import UserForm from './components/User/UserForm'
import ShowKey from './components/User/ShowKey'

export default class App extends Component {
  constructor(props) {
    super(props)

    this.state = {
      username: undefined,
      key: undefined,
      signedIn: false,
      mode: undefined,
      loadingTodos: true,
      todos: []
    }

    this.handleSignIn = this.handleSignIn.bind(this)
    this.handleSignUp = this.handleSignUp.bind(this)
    this.handleSignOut = this.handleSignOut.bind(this)
    this.handleRemoveUserAuthentication = this.handleRemoveUserAuthentication.bind(this)
    this.handleReadHash = this.handleReadHash.bind(this)
    this.handleDbChange = this.handleDbChange.bind(this)
  }

  async componentDidMount() {
    window.addEventListener('hashchange', this.handleReadHash, false)

    const session = await userLogic.signInWithSession()
    if (session.user) {
      const { username, key } = session.user
      this.setState({ username, key, signedIn: true })

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
    const { username, key } = user
    this.setState({ username, key, signedIn: true })
    await dbLogic.openDatabase(username, this.handleDbChange)
    window.location.hash = ''
  }

  async handleSignUp(user) {
    const { username, key } = user
    this.setState({ username, key, signedIn: true })
    await dbLogic.openDatabase(username, this.handleDbChange)
    window.location.hash = 'show-key'
  }

  async handleSignOut() {
    const session = await userLogic.signOut()
    this.handleRemoveUserAuthentication(session.username)
  }

  // this is called when the user signs out, or when the server says the session has expired
  handleRemoveUserAuthentication(username) {
    this.setState({
      username,
      key: undefined,
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

      case 'show-key':
        // only show key if user is signed in already, otherwise re-route to default
        return signedIn ? this.setState({ mode: hashRoute }) : window.location.hash = ''

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

  render() {
    const { username, key, signedIn, mode, loadingTodos, todos } = this.state

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
                username={username}
                todos={todos}
                loading={loadingTodos}
              />
            case 'show-key':
              return <ShowKey keyString={key} />
            case 'sign-in':
              return <UserForm
                handleSubmit={this.handleSignIn}
                formType='Sign In'
                key='sign-in'
                placeholderUsername={username}
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
