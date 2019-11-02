import React, { Component } from 'react'
import { string } from 'prop-types'
import adminLogic from './logic'

export default class AdminForm extends Component {
  constructor(props) {
    super(props)
    this.state = {
      adminName: this.props.placeholderAdminName,
      password: '',
      fullName: '',
      error: '',
      loading: false
    }

    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
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
    if ((e.target.name === 'adminName' || e.target.name === 'password') &&
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
    const { formType } = this.props
    const { adminName, password, fullName } = this.state
    event.preventDefault()

    await this.setState({ loading: true })

    try {
      if (formType === 'Create Admin') {
        await adminLogic.createAdmin(adminName, password, fullName)
      } else if (formType === 'Sign In') {
        await adminLogic.signIn(adminName, password)
      } else {
        return console.error('Unknown form type')
      }

      window.location.hash = ''
    } catch (e) {
      this.setState({ error: e.message, loading: false })
    }
  }

  render() {
    const { adminName, password, fullName, error, loading } = this.state
    const { formType } = this.props

    const disabled = !adminName || !password || (formType === 'Create Admin' && (!fullName))

    return (
      <form onSubmit={this.handleSubmit}>

        <div className='container content text-xs xs:text-base'>

          {formType === 'Sign In'
            ? <div className="font-normal mb-4">Sign in with your email and password:</div>
            : <div className="font-normal mb-4">Create a new admin account:</div>
          }

          <div className='table'>

            {formType === 'Create Admin' &&
              <div className='table-row'>
                <div className='table-cell p-2 text-right'>Full Name</div>
                <div className='table-cell p-2'>
                  <input
                    className='font-light text-xs xs:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none'
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
                  className='font-light text-xs xs:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none'
                  type='text'
                  name='adminName'
                  autoComplete='username'
                  onChange={this.handleInputChange}
                  defaultValue={adminName}
                />
              </div>
            </div>

            <div className='table-row'>
              <div className='table-cell p-2 text-right'>Password</div>
              <div className='table-cell p-2'>
                <input
                  className='font-light text-xs xs:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none'
                  type='password'
                  name='password'
                  autoComplete='new-password'
                  onChange={this.handleInputChange}
                />
              </div>
            </div>

          </div>

          <div className='text-center mt-3 h-16'>
            <div className='h-6'>
              {loading
                ? <div className='loader inline-block w-6 h-6' />
                : <input
                  className={`btn ${formType === 'Sign In' ? 'w-24' : 'w-32'}`}
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
            <div className="font-normal mb-4 text-xs xs:text-sm">Or, <a href='#create-admin'>create a new account</a>.</div>
          </div>}

        </div>

      </form>
    )
  }
}

AdminForm.propTypes = {
  formType: string,
  placeholderAdminName: string
}
