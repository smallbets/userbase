import React, { Component } from 'react'
import userLogic from './logic'

class SignUpForm extends Component {
  constructor(props) {
    super(props)
    this.state = {
      username: '',
      password: ''
    }

    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleInputChange(event) {
    const target = event.target
    const value = target.value
    const name = target.name

    this.setState({
      [name]: value
    })
  }

  handleSubmit(event) {
    const { username, password } = this.state
    event.preventDefault()
    userLogic.signUp(username, password)
  }

  render() {

    return (
      <form onSubmit={this.handleSubmit}>

        <div style={{ width: '250px', margin: 'auto' }}>

          <div style={{ display: 'flex' }}>
            <label>
              Username:
            </label>
            <input
              style={{ marginLeft: 'auto', padding: '5px' }}
              type="text"
              name="username"
              onChange={this.handleInputChange}
            />
          </div>

          <div style={{ display: 'flex', marginTop: '10px' }}>
            <label>
              Password:
            </label>
            <input
              style={{ marginLeft: 'auto', padding: '5px' }}
              type="password"
              name="password"
              onChange={this.handleInputChange}
            />
          </div>

          <div style={{ display: 'flex', marginTop: '20px' }}>
            <input style={{ marginLeft: 'auto', height: '30px', borderRadius: '5px' }} type="submit" value="Sign Up" />
          </div>

        </div>

      </form>
    )
  }
}

export default SignUpForm
