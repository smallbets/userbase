import React, { Component } from 'react'
import userLogic from './components/User/logic'
import Dashboard from './components/Dashboard/Dashboard'
import UserForm from './components/User/UserForm'

const displaySignInForm = () => window.location.hash.substring(1) === 'sign-in'
const displaySignUpForm = () => window.location.hash.substring(1) === 'sign-up'

class Welcome extends Component {
  constructor(props) {
    super(props)
    this.state = {
      loading: true,
      user: undefined,
      displaySignInForm: displaySignInForm(),
      displaySignUpForm: displaySignUpForm()
    }

    this.handleAuthenticateUser = this.handleAuthenticateUser.bind(this)
    this.handleSignOut = this.handleSignOut.bind(this)
    this.handleRemoveUserAuthentication = this.handleRemoveUserAuthentication.bind(this)
    this.handleReadHash = this.handleReadHash.bind(this)
  }

  async componentWillMount() {
    const result = await userLogic.isUserSignedIn()
    if (result) return this.setState({ user: result, loading: false })
    else return this.setState({ loading: false })
  }

  componentDidMount() {
    window.addEventListener('hashchange', this.handleReadHash, false)
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.handleReadHash, false)
  }

  handleAuthenticateUser(user) {
    window.location.hash = ''
    this.setState({ user })
  }

  handleRemoveUserAuthentication() {
    window.location.hash = ''
    this.setState({ user: undefined })
  }

  handleReadHash() {
    this.setState({
      displaySignInForm: displaySignInForm(),
      displaySignUpForm: displaySignUpForm()
    })
  }

  async handleSignOut() {
    this.setState({ signingOut: true })
    await userLogic.signOut()
    this.handleRemoveUserAuthentication()
  }

  render() {
    const { loading, user, displaySignInForm, displaySignUpForm } = this.state

    const userIsAuthenticated = !!user

    return (
      <div>
        <nav className='container flex flex-row items-center min-w-full text-xl font-extrabold bg-white shadow-md p-2 h-16 mb-10'>
          <div className='flex-1 ml-2'>
            <a href='#'><img src={require('./img/icon.png')} className='h-12'></img></a>
          </div>
          <div className='flex-1 text-right tracking-tight mr-5'>
            {!userIsAuthenticated
              ? <ul>
                <li className='inline-block ml-4'><a className='hover:underline' href='#sign-in'>Sign in</a></li>
                <li className='inline-block ml-4'><a className='hover:underline' href='#sign-up'>New account</a></li>
              </ul>
              : <ul>
                <li className='inline-block ml-4 font-light'>{user.username}</li>
                <li className='inline-block ml-4'><a className='hover:underline' href='#' onClick={this.handleSignOut}>Sign out</a></li>
              </ul>
            }
          </div>
        </nav>

        {userIsAuthenticated
          ? <Dashboard user={user} handleRemoveUserAuthentication={this.handleRemoveUserAuthentication} />
          : loading
            ? <div className='text-center'><div className='loader w-6 h-6 inline-block' /></div>
            : <div>
              {displaySignInForm &&
                <UserForm handleAuthenticateUser={this.handleAuthenticateUser} formType='Sign In' />
              }

              {displaySignUpForm &&
                <UserForm handleAuthenticateUser={this.handleAuthenticateUser} formType='Sign Up' />
              }
            </div>
        }
      </div>
    )
  }
}

export default Welcome
