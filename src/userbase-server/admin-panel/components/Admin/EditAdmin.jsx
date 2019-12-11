import React, { Component } from 'react'
import { func } from 'prop-types'
import adminLogic from './logic'

export default class EditAdmin extends Component {
  constructor(props) {
    super(props)
    this.state = {
      email: '',
      fullName: '',
      password: '',
      loadingUpdate: false,
      loadingDelete: false,
      errorUpdating: '',
      errorDeleting: ''
    }

    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleUpdateAcount = this.handleUpdateAcount.bind(this)
    this.handleDeleteAccount = this.handleDeleteAccount.bind(this)
  }

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
    if ((e.target.name === 'email' || e.target.name === 'password' || e.target.name === 'fullName') &&
      (e.key === 'Enter' || e.keyCode === ENTER_KEY_CODE)) {
      e.stopPropagation()
    }
  }

  handleInputChange(event) {
    if (this.state.errorUpdating || this.state.errorDeleting) {
      this.setState({ errorUpdating: undefined, errorDeleting: undefined })
    }

    const target = event.target
    const value = target.value
    const name = target.name

    this.setState({
      [name]: value
    })
  }

  async handleUpdateAcount(event) {
    const { email, password, fullName } = this.state
    event.preventDefault()

    if (!email && !password && !fullName) return

    this.setState({ loadingUpdate: true })

    try {
      await adminLogic.updateAdmin({ email, password, fullName })
      if (email || fullName) this.props.handleUpdateAccount(email, fullName)
      if (this._isMounted) this.setState({ email: '', password: '', fullName: '', loadingUpdate: false })
    } catch (e) {
      if (this._isMounted) this.setState({ errorUpdating: e.message, loadingUpdate: false })
    }
  }

  async handleDeleteAccount(event) {
    event.preventDefault()

    this.setState({ errorDeleting: '' })

    try {
      if (window.confirm('Are you sure you want to delete your account?')) {
        this.setState({ loadingDelete: true })
        await adminLogic.deleteAdmin()
      }
    } catch (e) {
      if (this._isMounted) this.setState({ errorDeleting: e.message, loadingDelete: false })
    }
  }

  render() {
    const { fullName, email, password, loadingUpdate, loadingDelete, errorUpdating, errorDeleting } = this.state

    return (
      <div className='container content text-xs xs:text-base text-center'>

        <form onSubmit={this.handleUpdateAcount}>
          <div className='table'>

            <div className='table-row'>
              <div className='table-cell p-2 text-right'>Full Name</div>
              <div className='table-cell p-2'>
                <input
                  className='font-light text-xs xs:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none'
                  type='text'
                  name='fullName'
                  autoComplete='name'
                  value={fullName}
                  onChange={this.handleInputChange}
                />
              </div>
            </div>

            <div className='table-row'>
              <div className='table-cell p-2 text-right'>Email</div>
              <div className='table-cell p-2'>
                <input
                  className='font-light text-xs xs:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none'
                  type='email'
                  name='email'
                  autoComplete='email'
                  onChange={this.handleInputChange}
                  value={email}
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
                  value={password}
                />
              </div>
            </div>

          </div>


          <div className='mt-3 h-16'>
            <div className='h-6 text-center'>
              <input
                className='btn w-40'
                type='submit'
                value={loadingUpdate ? 'Updating...' : 'Update Account'}
                disabled={(!fullName && !email && !password) || loadingDelete || loadingUpdate}
              />

              <div className='error'>{errorUpdating}</div>
            </div>

          </div>

        </form>

        <hr className='border border-t-0 border-gray-400 mt-8 mb-4' />

        <input
          className='btn w-40'
          type='button'
          value={loadingDelete ? 'Deleting...' : 'Delete Account'}
          disabled={loadingDelete}
          onClick={this.handleDeleteAccount}
        />

        {errorDeleting && <div className='error'>{errorDeleting}</div>}

      </div>
    )
  }
}

EditAdmin.propTypes = {
  handleUpdateAccount: func
}
