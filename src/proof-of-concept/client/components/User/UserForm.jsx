import React, { Component } from 'react'
import { func, string } from 'prop-types'
import userLogic from './logic'

export default class UserForm extends Component {
  constructor(props) {
    super(props)

    this.state = {
      username: this.props.placeholderUsername,
      password: '',
      email: '',
      rememberMe: false,
      error: this.props.error,
      loading: false,
      updated: false
    }

    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleSubmitForm = this.handleSubmitForm.bind(this)
    this.handleForgotPassword = this.handleForgotPassword.bind(this)
    this.handleToggleRememberMe = this.handleToggleRememberMe.bind(this)
  }

  // prevent last pass error in console: https://github.com/KillerCodeMonkey/ngx-quill/issues/351
  componentDidMount() {
    document.addEventListener('keydown', this.handleHitEnter, true)
  }
  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleHitEnter, true)
  }
  handleHitEnter(e) {
    const ENTER_KEY_CODE = 13
    if ((e.target.name === 'username' || e.target.name === 'password') &&
      (e.key === 'Enter' || e.keyCode === ENTER_KEY_CODE)) {
      e.stopPropagation()
    }
  }

  shouldComponentUpdate(nextProps) {
    if (nextProps.error && !this.state.error && !this.state.updated) {
      this.setState({ error: nextProps.error, updated: true, loading: false })
    }

    return true
  }

  handleInputChange(event) {
    if (this.state.error) this.setState({ error: undefined })

    const target = event.target
    const value = target.value
    const name = target.name

    this.setState({
      [name]: value
    })
  }

  async handleSubmitForm(event) {
    const { formType, handleSubmit, handleSetSignInError } = this.props
    const { username, password, email, rememberMe } = this.state
    event.preventDefault()

    await this.setState({ loading: true })

    let user
    if (formType === 'Sign Up') user = await userLogic.signUp(username, password, email, rememberMe)
    else if (formType === 'Sign In') user = await userLogic.signIn(username, password, rememberMe)
    else return console.error('Unknown form type')

    if (user && user.error) {
      if (user.error !== 'Canceled.') this.setState({ error: user.error, loading: false })
      else handleSetSignInError(user.error)
    } else {
      handleSubmit(user)
    }
  }

  async handleForgotPassword() {
    const { username } = this.state

    this.setState({ loading: true })

    try {
      await userLogic.forgotPassword(username)
      window.alert('Check your email!')
      this.setState({ loading: false })
    } catch (e) {
      this.setState({ error: e.message, loading: false })
    }
  }

  handleToggleRememberMe() {
    this.setState({ rememberMe: !this.state.rememberMe })
  }

  render() {
    const { username, password, rememberMe, error, loading } = this.state
    const { formType } = this.props

    const disabled = !username || !password

    return (
      <form onSubmit={this.handleSubmitForm}>

        <div className='container content text-xs xs:text-base'>

          {formType === 'Sign In'
            ? <div className="font-normal mb-4">Sign in with your username and password:</div>
            : <div className="font-normal mb-4">Create a new account:</div>
          }

          <div className='table'>

            <div className='table-row'>
              <div className='table-cell p-2 text-right'>Username</div>
              <div className='table-cell p-2'>
                <input
                  className='font-light text-xs xs:text-sm w-48 sm:w-64 h-8 p-2 border border-gray-500 outline-none'
                  type='text'
                  name='username'
                  autoComplete='username'
                  onChange={this.handleInputChange}
                  defaultValue={username}
                />
              </div>
            </div>

            <div className='table-row'>
              <div className='table-cell p-2 text-right'>Password</div>
              <div className='table-cell p-2'>
                <input
                  className='font-light text-xs xs:text-sm w-48 sm:w-64 h-8 p-2 border border-gray-500 outline-none'
                  type='password'
                  name='password'
                  autoComplete='new-password'
                  onChange={this.handleInputChange}
                />
              </div>
            </div>

            {formType === 'Sign Up'
              && <div className='table-row'>
                <div className='table-cell p-2 text-right'>Email</div>
                <div className='table-cell p-2'>
                  <input
                    className='font-light text-xs xs:text-sm w-48 sm:w-64 h-8 p-2 border border-gray-500 outline-none'
                    type='email'
                    name='email'
                    autoComplete='off'
                    onChange={this.handleInputChange}
                  />
                </div>
              </div>
            }

            <div className='table-row'>
              <div className='table-cell p-2 pt-0'>
              </div>

              <div className='table-cell p-2 pt-0 text-left'>
                <div className='block select-none'>
                  <div className='inline-block text-left whitespace-no-wrap'>
                    <a className='cursor-pointer no-underline font-normal text-xs xs:text-sm' onClick={this.handleToggleRememberMe}>Remember me</a>
                  </div>

                  <div className='inline-block'>
                    <div
                      className={`cursor-pointer ${rememberMe ? 'checkbox-checked fa-check' : 'checkbox fa-check-empty'}`}
                      onClick={this.handleToggleRememberMe}
                    />
                  </div>

                  {formType === 'Sign In'
                    && <div className='pt-2 sm:inline-block sm:float-right sm:pt-0 sm:pl-2'>
                      <a className='cursor-pointer font-light text-xs xs:text-sm' onClick={this.handleForgotPassword}>Forgot password</a>
                    </div>
                  }
                </div>
              </div>


            </div>

          </div>

          <div className='text-center mt-3 h-16'>
            <div className='h-6'>
              {loading
                ? <div className='loader inline-block w-6 h-6' />
                : <input
                  className='btn w-24'
                  type='submit'
                  value={formType}
                  disabled={disabled}
                />
              }
            </div>

            <div className='error'>{error}</div>
          </div>

          {formType === 'Sign In' && <div>
            <hr className='border border-t-0 border-gray-400 mt-4 mb-4' />
            <div className="font-normal mb-4 text-xs xs:text-sm">Or, <a href='#sign-up'>create a new account</a>.</div>
          </div>}

        </div>

      </form>
    )
  }
}

UserForm.propTypes = {
  handleSubmit: func,
  formType: string,
  placeholderUsername: string,
  error: string,
  handleSetSignInError: func
}
