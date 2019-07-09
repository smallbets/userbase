import React, { Component } from 'react'
import userLogic from './components/User/logic'
import Dashboard from './components/Dashboard/Dashboard'
import UserForm from './components/User/UserForm'
import ShowKey from './components/User/ShowKey'

const displaySignInForm = () => window.location.hash.substring(1) === 'sign-in'
const displaySignUpForm = () => window.location.hash.substring(1) === 'sign-up'
const displayShowKeyForm = () => window.location.hash.substring(1) === 'show-key'

class Welcome extends Component {
  constructor(props) {
    super(props)

    this.state = {
      displaySignInForm: displaySignInForm(),
      displaySignUpForm: displaySignUpForm(),
      displayShowKeyForm: displayShowKeyForm()
    }

    this.handleSetSessionInState = this.handleSetSessionInState.bind(this)
    this.handleSignOut = this.handleSignOut.bind(this)
    this.handleRemoveUserAuthentication = this.handleRemoveUserAuthentication.bind(this)
    this.handleReadHash = this.handleReadHash.bind(this)
  }

  componentDidMount() {
    window.addEventListener('hashchange', this.handleReadHash, false)
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.handleReadHash, false)
  }

  handleSetSessionInState(session, isNewAccount) {
    window.location.hash = isNewAccount ? '#show-key' : ''
    this.setState({ session })
  }

  handleRemoveUserAuthentication() {
    const { session } = this.state
    window.location.hash = 'sign-in'
    this.setState({
      session: {
        username: session && session.username,
        sessionId: null
      }
    })
  }

  async handleSignOut() {
    await userLogic.signOut()
    this.handleRemoveUserAuthentication()
  }

  handleReadHash() {
    this.setState({
      displaySignInForm: displaySignInForm(),
      displaySignUpForm: displaySignUpForm(),
      displayShowKeyForm: displayShowKeyForm()
    })
  }

  render() {
    const { displaySignInForm, displaySignUpForm, displayShowKeyForm } = this.state

    const session = userLogic.getSession()
    const key = userLogic.getKey()

    const isFirstTimeVisit = !session
    const userMustLogInAgain = session && !session.sessionId

    if (!displaySignInForm && isFirstTimeVisit) {
      window.location.hash = 'sign-up'
    } else if (!displaySignUpForm && userMustLogInAgain) {
      window.location.hash = 'sign-in'
    }

    const userHasActiveSession = session && session.sessionId

    let mode

    if (userHasActiveSession && !displayShowKeyForm) {
      mode = 'dashboard'
    } else if (userHasActiveSession && displayShowKeyForm) {
      mode = 'show-key'
    } else if (displaySignInForm) {
      mode = 'sign-in'
    } else if (displaySignUpForm) {
      mode = 'sign-up'
    }

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

export default Welcome
