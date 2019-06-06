import React, { Component } from 'react'
import { func, string } from 'prop-types'
import userLogic from './logic'

class UserForm extends Component {
  constructor(props) {
    super(props)
    this.state = {
      username: '',
      password: '',
      error: ''
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
    const { formType, handleAuthenticateUser } = this.props
    const { username, password } = this.state
    event.preventDefault()

    let result
    if (formType === 'Sign Up') result = await userLogic.signUp(username, password)
    else if (formType === 'Sign In') result = await userLogic.signIn(username, password)
    else return console.error('Unknown form type')

    if (result.error) this.setState({ error: result.error })
    else handleAuthenticateUser(result.user)
  }

  render() {
    const { username, password, error } = this.state

    return (
      <form onSubmit={this.handleSubmit}>

        <div style={{ width: '250px', margin: 'auto' }}>

          <div style={{ display: 'flex' }}>
            Username:
            <input
              style={{ marginLeft: 'auto', padding: '5px' }}
              type="text"
              name="username"
              autoComplete="username"
              onChange={this.handleInputChange}
            />
          </div>

          <div style={{ display: 'flex', marginTop: '10px' }}>
            Password:
            <input
              style={{ marginLeft: 'auto', padding: '5px' }}
              type="password"
              name="password"
              autoComplete="new-password"
              onChange={this.handleInputChange}
            />
          </div>

          <div style={{ display: 'flex', marginTop: '20px' }}>
            <input
              style={{ width: '100%' }}
              type="submit"
              value={this.props.formType}
              disabled={!username || !password}
            />
          </div>

          {error && (
            <div style={{
              marginTop: '10px',
              color: 'red',
              fontSize: '.75em',
              textAlign: 'left',
              wordBreak: 'break-word',
              fontStyle: 'italic'
            }}>
              {error}
            </div>
          )}

        </div>

      </form>
    )
  }
}

UserForm.propTypes = {
  handleAuthenticateUser: func,
  formType: string
}

export default UserForm
