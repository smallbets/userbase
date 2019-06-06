import React, { Component } from 'react'
import { object, func } from 'prop-types'
import userLogic from '../User/logic'

class Dashboard extends Component {
  constructor(props) {
    super(props)
    this.handleSignOut = this.handleSignOut.bind(this)
  }

  async handleSignOut() {
    await userLogic.signOut()
    this.props.handleRemoveUserAuthentication()
  }

  render() {
    const { user } = this.props

    return (
      <div style={{ marginTop: '150px' }}>
        <div >
          Welcome, {user.username}!
        </div>
        <button style={{ marginTop: '25px' }} onClick={this.handleSignOut}>Sign Out</button>
      </div>
    )
  }
}

Dashboard.propTypes = {
  user: object,
  handleRemoveUserAuthentication: func
}

export default Dashboard
