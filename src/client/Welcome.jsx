import React from 'react'
import SignUpForm from './components/User/SignUpForm'

const Welcome = () => {
  return (
    <div className="welcome">
      <div className="logo" />
      <div style={{ marginTop: '150px' }}>
        <SignUpForm />
      </div>
    </div>
  )
}

export default Welcome
