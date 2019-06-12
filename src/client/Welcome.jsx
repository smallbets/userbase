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

  render() {
    const { loading, user, displaySignInForm, displaySignUpForm } = this.state

    const userIsAuthenticated = !!user

    return (
      <div className="welcome">
        <div className="logo" />

        {userIsAuthenticated
          ? <Dashboard user={user} handleRemoveUserAuthentication={this.handleRemoveUserAuthentication} />
          : <div style={{ marginTop: '150px' }}>
            {loading
              ? <div style={{ marginLeft: 'auto', marginRight: 'auto' }} className='loader' />
              : <div>

                {!displaySignInForm && !displaySignUpForm &&
                  <div>
                    <a href='#sign-in' tabIndex={0}>
                      <button style={{ width: '30%' }}>Sign In</button>
                    </a>

                    <span style={{ width: '10%', display: 'inline-block' }} />

                    <a href='#sign-up' tabIndex={0}>
                      <button style={{ width: '30%' }}>Sign Up</button>
                    </a>

                  </div>
                }

                {displaySignInForm &&
                  <UserForm handleAuthenticateUser={this.handleAuthenticateUser} formType='Sign In' />
                }

                {displaySignUpForm &&
                  <UserForm handleAuthenticateUser={this.handleAuthenticateUser} formType='Sign Up' />
                }

              </div>
            }
          </div>
        }
      </div>
    )
  }
}

export default Welcome
