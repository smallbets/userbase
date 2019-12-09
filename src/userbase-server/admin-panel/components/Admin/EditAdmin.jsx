import React, { Component } from 'react'
import adminLogic from './logic'

export default class EditAdmin extends Component {
  constructor(props) {
    super(props)
    this.state = {
      error: '',
      loading: false
    }

    this.handleDeleteAccount = this.handleDeleteAccount.bind(this)
  }

  componentDidMount() {
    this._isMounted = true
  }

  componentWillUnmount() {
    this._isMounted = false
  }

  async handleDeleteAccount(event) {
    event.preventDefault()

    try {
      if (window.confirm('Are you sure you want to delete your account?')) {
        this.setState({ loading: true })
        await adminLogic.deleteAdmin()
      }
    } catch (e) {
      if (this._isMounted) this.setState({ error: e.message, loading: false })
    }
  }

  render() {
    const { error, loading } = this.state

    return (
      <div className='container content text-xs xs:text-base'>

        <div className='text-center'>
          <input
            className='btn w-40'
            type='button'
            value={loading ? 'Deleting...' : 'Delete Account'}
            disabled={loading}
            onClick={this.handleDeleteAccount}
          />

          {error && <div className='error'>{error}</div>}
        </div>

      </div>
    )
  }
}
