import React, { Component } from 'react'
import { func, string } from 'prop-types'
import userLogic from './logic'

class UserForm extends Component {
  constructor(props) {
    super(props)
    this.state = {
      username: this.props.placeholderUsername,
      password: '',
      error: '',
      loading: false
    }

    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
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
    const { formType, handleSetSessionInState } = this.props
    const { username, password } = this.state
    event.preventDefault()

    await this.setState({ loading: true })

    let result
    if (formType === 'Sign Up') result = await userLogic.signUp(username, password)
    else if (formType === 'Sign In') result = await userLogic.signIn(username, password)
    else return console.error('Unknown form type')

    if (result.error) this.setState({ error: result.error, loading: false })
    else handleSetSessionInState(result, formType === 'Sign Up') // re-routes to different component
  }

  render() {
    const { username, password, error, loading } = this.state

    const disabled = !username || !password

    return (
      <form onSubmit={this.handleSubmit}>

        <div className='container max-w-sm font-bold bg-white p-8 shadow-md'>

          <div className='table'>

            <div className='table-row'>
              <div className='table-cell p-2 text-right'>Username</div>
              <div className='table-cell p-2'>
                <input
                  className='font-light text-sm h-8 p-2 border border-gray-500 outline-none'
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
                  className='font-light text-sm h-8 p-2 border border-gray-500 outline-none'
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
                  className='btn w-24'
                  type='submit'
                  value={this.props.formType}
                  disabled={disabled}
                />
              }
            </div>

            <div className='error'>{error}</div>
          </div>


        </div>

      </form>
    )
  }
}

UserForm.propTypes = {
  handleSetSessionInState: func,
  formType: string,
  placeholderUsername: string
}

export default UserForm
