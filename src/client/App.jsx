import React, { Component } from 'react'
import userLogic from './components/User/logic'
import Dashboard from './components/Dashboard/Dashboard'
import UserForm from './components/User/UserForm'

const displaySignInForm = () => window.location.hash.substring(1) === 'sign-in'
const displaySignUpForm = () => window.location.hash.substring(1) === 'sign-up'

class Welcome extends Component {
  constructor(props) {
    super(props)

    const session = userLogic.getSession()

    const isFirstTimeVisit = !session
    const userMustLogInAgain = session && !session.sessionId

    if (isFirstTimeVisit) {
      window.location.hash = 'sign-up'
    } else if (userMustLogInAgain) {
      window.location.hash = 'sign-in'
    }

    this.state = {
      session,
      displaySignInForm: displaySignInForm(),
      displaySignUpForm: displaySignUpForm()
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

  handleSetSessionInState(session) {
    window.location.hash = ''
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
      displaySignUpForm: displaySignUpForm()
    })
  }

  render() {
    const { session, displaySignInForm, displaySignUpForm } = this.state

    const userHasActiveSession = session && session.sessionId

    return (
      <div>
        <nav className='flex items-center min-w-full text-sm sm:text-lg font-extrabold bg-white shadow-md p-2 h-14 sm:h-16 mb-10'>
          <div className='flex-0 ml-2'>
            <a href='#'><img src={require('./img/icon.png')} className='h-10 sm:h-12'></img></a>
          </div>
          <div className='flex-1 text-right tracking-tight mr-5'>
            {!userHasActiveSession
              ? <ul>
                <li className='inline-block ml-4'><a className='hover:underline' href='#sign-in'>Sign in</a></li>
                <li className='inline-block ml-4'><a className='hover:underline' href='#sign-up'>New account</a></li>
              </ul>
              : <ul>
                <li className='inline-block ml-4 font-light'>{session.username}</li>
                <li className='inline-block ml-4'><a className='hover:underline' href='#' onClick={this.handleSignOut}>Sign out</a></li>
              </ul>
            }
          </div>
        </nav>

        {userHasActiveSession
          ? <Dashboard handleRemoveUserAuthentication={this.handleRemoveUserAuthentication} />
          : <div>
            {displaySignInForm &&
              <UserForm
                handleSetSessionInState={this.handleSetSessionInState}
                formType='Sign In'
                placeholderUsername={session && session.username}
              />
            }

            {displaySignUpForm &&
              <UserForm handleSetSessionInState={this.handleSetSessionInState} formType='Sign Up' />
            }
          </div>
        }
      </div>
    )
  }
}

export default Welcome
