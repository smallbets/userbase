import React, { Component } from 'react'
import userLogic from './components/User/logic'
import Dashboard from './components/Dashboard/Dashboard'
import UserForm from './components/User/UserForm'
import ShowKey from './components/User/ShowKey'
import SaveKey from './components/User/SaveKey'

const displayHome = () => window.location.hash.substring(1) === ''
const displaySignInForm = () => window.location.hash.substring(1) === 'sign-in'
const displaySignUpForm = () => window.location.hash.substring(1) === 'sign-up'
const displayShowKeyForm = () => window.location.hash.substring(1) === 'show-key'
const displaySaveKeyForm = () => window.location.hash.substring(1) === 'save-key'

class App extends Component {
  constructor(props) {
    super(props)

    this.state = {
      key: undefined,
      mode: undefined
    }

    this.handleSetSessionInState = this.handleSetSessionInState.bind(this)
    this.handleSetKeyInState = this.handleSetKeyInState.bind(this)
    this.handleSignOut = this.handleSignOut.bind(this)
    this.handleRemoveUserAuthentication = this.handleRemoveUserAuthentication.bind(this)
    this.handleReadHash = this.handleReadHash.bind(this)
    this.handleAutoRedirects = this.handleAutoRedirects.bind(this)
  }

  async componentDidMount() {
    const key = await userLogic.getHumanReadableKey()
    this.setState({ key, mode: this.getViewMode() })
    this.handleAutoRedirects()

    window.addEventListener('hashchange', this.handleReadHash, false)
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.handleReadHash, false)
  }

  handleAutoRedirects() {
    const { key } = this.state

    const session = userLogic.getSession()

    const isFirstTimeVisit = !session
    const userMustLogInAgain = session && !session.sessionId
    const userHasActiveSession = session && session.sessionId

    if (!displaySignInForm() && isFirstTimeVisit) {
      window.location.hash = 'sign-up'
    } else if (!displaySignUpForm() && userMustLogInAgain) {
      window.location.hash = 'sign-in'
    } else if (userHasActiveSession && !key) {
      window.location.hash = 'save-key'
    }
  }

  async handleSetSessionInState(session, isNewAccount) {
    const key = await userLogic.getHumanReadableKey()
    this.setState({ session, key })
    window.location.hash = isNewAccount ? '#show-key' : ''
  }

  handleSetKeyInState(key) {
    this.setState({ key })
    window.location.hash = ''
  }

  handleRemoveUserAuthentication() {
    const { session } = this.state
    window.location.hash = 'sign-in'
    this.setState({
      session: {
        username: session && session.username,
        sessionId: null,
        key: undefined
      }
    })
  }

  async handleSignOut() {
    await userLogic.signOut()
    this.handleRemoveUserAuthentication()
  }

  handleReadHash() {
    if (displayHome()) {
      this.handleAutoRedirects()
    }
    this.setState({ mode: this.getViewMode() })
  }

  getViewMode() {
    const session = userLogic.getSession()
    const userHasActiveSession = session && session.sessionId

    if (userHasActiveSession && displayShowKeyForm()) {
      return 'show-key'
    } else if (userHasActiveSession && displaySaveKeyForm()) {
      return 'save-key'
    } else if (userHasActiveSession) {
      return 'dashboard'
    } else if (displaySignInForm()) {
      return 'sign-in'
    } else if (displaySignUpForm()) {
      return 'sign-up'
    }

    return undefined
  }

  render() {
    const { key, mode } = this.state

    if (!mode) {
      return <div />
    }

    const session = userLogic.getSession()

    const userHasActiveSession = session && session.sessionId

    return (
      <div>
        <nav className='flex items-center min-w-full text-sm sm:text-lg font-extrabold bg-white shadow-md p-2 h-14 sm:h-16 mb-10'>
          <div className='flex-0 ml-2'>
            <a href='#'><img src={require('./img/icon.png')} className='h-10 sm:h-12' /></a>
          </div>
          <div className='flex-1 text-right tracking-tight mr-5'>
            {!userHasActiveSession
              ? <ul>
                <li className='inline-block ml-4'><a className='hover:underline' href='#sign-in'>Sign in</a></li>
                <li className='inline-block ml-4'><a className='hover:underline' href='#sign-up'>New account</a></li>
              </ul>
              : <ul>
                <li className='inline-block ml-4 font-light'>{session.username}</li>
                <li className='inline-block ml-4'><a className='fa-key hover:underline' href='#show-key'></a></li>
                <li className='inline-block ml-4'><a className='hover:underline' href='#' onClick={this.handleSignOut}>Sign out</a></li>
              </ul>
            }
          </div>
        </nav>

        {(() => {
          switch (mode) {
            case 'dashboard':
              return <Dashboard handleRemoveUserAuthentication={this.handleRemoveUserAuthentication} />
            case 'show-key':
              return <ShowKey keyString={key} />
            case 'save-key':
              return <SaveKey handleSetKeyInState={this.handleSetKeyInState} />
            case 'sign-in':
              return <UserForm
                handleSetSessionInState={this.handleSetSessionInState}
                formType='Sign In'
                key='sign-in'
                placeholderUsername={session && session.username}
              />
            case 'sign-up':
              return <UserForm handleSetSessionInState={this.handleSetSessionInState}
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

export default App
