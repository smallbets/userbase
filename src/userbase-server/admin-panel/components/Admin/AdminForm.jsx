import React, { Component } from 'react'
import { string, func, bool } from 'prop-types'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck } from '@fortawesome/free-solid-svg-icons'
import adminLogic from './logic'
import UnknownError from './UnknownError'

export default class AdminForm extends Component {
  constructor(props) {
    super(props)
    this.state = {
      email: this.props.placeholderEmail,
      password: '',
      fullName: '',
      receiveEmailUpdates: false,
      error: '',
      loading: false
    }

    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
    this.handleForgotPassword = this.handleForgotPassword.bind(this)
    this.handleReceiveEmailUpdates = this.handleReceiveEmailUpdates.bind(this)
    this.handleDoNotReceiveEmailUpdates = this.handleDoNotReceiveEmailUpdates.bind(this)
  }

  // prevent last pass error in console: https://github.com/KillerCodeMonkey/ngx-quill/issues/351
  componentDidMount() {
    this._isMounted = true
    document.addEventListener('keydown', this.handleHitEnter, true)
  }
  componentWillUnmount() {
    this._isMounted = false
    document.removeEventListener('keydown', this.handleHitEnter, true)
  }
  handleHitEnter(e) {
    const ENTER_KEY_CODE = 13
    if ((e.target.name === 'email' || e.target.name === 'password') &&
      (e.key === 'Enter' || e.keyCode === ENTER_KEY_CODE)) {
      e.stopPropagation()
    }
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

  async handleSubmit(event) {
    const { formType, handleUpdateAccount, upgrade, enablePayments, enableStoragePlan1 } = this.props
    const { email, password, fullName, receiveEmailUpdates } = this.state
    event.preventDefault()

    this.setState({ loading: true })

    try {
      if (formType === 'Create Admin') {
        await adminLogic.createAdmin(email, password, fullName, receiveEmailUpdates)
      } else if (formType === 'Sign In') {
        const admin = await adminLogic.signIn(email, password)
        handleUpdateAccount(admin)
      } else {
        return console.error('Unknown form type')
      }

      window.location.hash = (upgrade || enablePayments || enableStoragePlan1) ? 'edit-account' : ''
    } catch (e) {
      if (this._isMounted) this.setState({ error: e.message, loading: false })
    }
  }

  async handleForgotPassword(event) {
    event.preventDefault()

    const { email } = this.state

    if (!email) return this.setState({ error: 'Enter your email' })

    this.setState({ loading: true })

    try {
      await adminLogic.forgotPassword(email)
      window.alert('Check your email!')
      if (this._isMounted) this.setState({ loading: false })
    } catch (e) {
      if (this._isMounted) this.setState({ error: e.message, loading: false })
    }
  }

  handleReceiveEmailUpdates(event) {
    event.preventDefault()
    this.setState({ receiveEmailUpdates: true })
  }

  handleDoNotReceiveEmailUpdates(event) {
    event.preventDefault()
    this.setState({ receiveEmailUpdates: false })
  }

  render() {
    const { email, password, fullName, receiveEmailUpdates, error, loading } = this.state
    const { formType } = this.props

    const disabled = !email || !password || (formType === 'Create Admin' && (!fullName))

    return (
      <form onSubmit={this.handleSubmit}>

        <div className='container content max-w-lg text-xs sm:text-base'>

          {formType === 'Sign In'
            ? <div className="font-normal mb-4">Sign in with your email and password:</div>
            : <div className="font-normal mb-4">Create a new admin account:</div>
          }

          <div className='table'>

            {formType === 'Create Admin' &&
              <div className='table-row'>
                <div className='table-cell p-2 text-right whitespace-no-wrap'>Full Name</div>
                <div className='table-cell p-2'>
                  <input
                    className='font-light text-xs xs:text-sm w-full h-8 p-2 border border-gray-500 outline-none'
                    type='text'
                    name='fullName'
                    autoComplete='name'
                    onChange={this.handleInputChange}
                  />
                </div>
              </div>
            }

            <div className='table-row'>
              <div className='table-cell p-2 text-right'>Email</div>
              <div className='table-cell p-2'>
                <input
                  className={`font-light text-xs xs:text-sm h-8 p-2 border border-gray-500 outline-none ${formType === 'Create Admin' ? 'w-full' : 'w-48 sm:w-84'}`}
                  type='email'
                  name='email'
                  autoComplete='email'
                  onChange={this.handleInputChange}
                  defaultValue={email}
                />
              </div>
            </div>

            <div className='table-row'>
              <div className='table-cell p-2 text-right'>Password</div>
              <div className='table-cell p-2'>
                <input
                  className={`font-light text-xs xs:text-sm h-8 p-2 border border-gray-500 outline-none ${formType === 'Create Admin' ? 'w-full' : 'w-48 sm:w-84'}`}
                  type='password'
                  name='password'
                  autoComplete='new-password'
                  onChange={this.handleInputChange}
                />
              </div>
            </div>

            {formType === 'Sign In' &&
              <div className='table-row'>
                <div className='table-cell p-2 pt-0'>
                </div>

                <div className='table-cell p-2 pt-0 text-left'>
                  <div className='block select-none'>
                    <div className='inline-block text-left whitespace-no-wrap'>
                      <a className='cursor-pointer font-light text-xs sm:text-sm' onClick={this.handleForgotPassword}>Forgot password</a>
                    </div>
                  </div>
                </div>
              </div>
            }

            {formType === 'Create Admin' &&
              <div className='table-row'>
                <div className='table-cell p-2 pt-0'>
                </div>

                <div className='table-cell p-2 pt-0 text-left'>
                  <span className='mt-2 block select-none'>
                    <span className='mr-2'>
                      <span
                        className={`m-0 cursor-pointer ${receiveEmailUpdates ? 'checkbox-checked' : 'checkbox check-empty'}`}
                        onClick={receiveEmailUpdates ? this.handleDoNotReceiveEmailUpdates : this.handleReceiveEmailUpdates}
                      >
                        {receiveEmailUpdates && <FontAwesomeIcon className='fa-check' icon={faCheck} />}
                      </span>
                    </span>

                    <span>
                      <a
                        className='cursor-pointer no-underline font-light text-xs'
                        onClick={receiveEmailUpdates ? this.handleDoNotReceiveEmailUpdates : this.handleReceiveEmailUpdates}
                      >
                        Receive email updates about new features.
                      </a>
                    </span>

                  </span>
                </div>
              </div>
            }


          </div>

          <div className={`text-center mt-3 ${!error ? 'h-16' : ''}`}>
            <div className='h-6'>
              {loading
                ? <div className='loader inline-block w-6 h-6' />
                : <input
                  className={`btn w-48`}
                  type='submit'
                  value={formType}
                  disabled={disabled}
                />
              }
            </div>

            {error && (error === 'Unknown Error'
              ? <UnknownError />
              : <div className='error'>{error}</div>
            )}

          </div>

          {formType === 'Sign In' && <div>
            <hr className='border border-t-0 border-gray-400 mt-4 mb-4' />
            <div className="font-normal mb-4 text-xs sm:text-sm">Or, <a href='#create-admin'>create a new account</a>.</div>
          </div>}

          {formType === 'Create Admin' && <div>
            <hr className='border border-t-0 border-gray-400 mt-4 mb-4' />
            <div className="font-normal mb-4 text-xs sm:text-sm">Already have an account? <a href='#sign-in'>Log in here</a>.</div>
          </div>}

        </div>

      </form >
    )
  }
}

AdminForm.propTypes = {
  formType: string,
  placeholderEmail: string,
  handleUpdateAccount: func,
  upgrade: bool,
  enablePayments: bool,
  enableStoragePlan1: bool,
}
