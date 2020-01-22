import React from 'react'
import { string } from 'prop-types'

export default function UnknownError({ action }) {
  return (
    <div className='error'>
      {`Oops! Something went wrong${action ? (' ' + action) : ''}. Please hit refresh and try again!`}
      <br />
      <br />
      If the issue persists, please contact <a href='mailto:support@userbase.com'>support@userbase.com</a>
    </div>
  )
}

UnknownError.propTypes = {
  error: string,
  action: string
}
