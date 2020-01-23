import React from 'react'
import { string, bool } from 'prop-types'

export default function UnknownError({ action, noMarginTop }) {
  return (
    <div className={`error ${noMarginTop ? 'mt-0' : ''}`}>
      {`Oops! Something went wrong${action ? (' ' + action) : ''}. Please hit refresh and try again!`}
      <br />
      <br />
      If the issue persists, please contact <a href='mailto:support@userbase.com'>support@userbase.com</a>
    </div>
  )
}

UnknownError.propTypes = {
  action: string,
  noMarginTop: bool
}
