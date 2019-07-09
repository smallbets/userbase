import React, { Component } from 'react'
import { string } from 'prop-types'
import copy from 'copy-to-clipboard'

class ShowKey extends Component {

  constructor(props) {
    super(props)

    this.state = {
      showCopiedMessage: false
    }
  }

  render() {
    return (
      <div className='container content'>

        <div className='table'>

          <div className='table-row'>
            <div className='table-cell p-0'>
              <div className='font-light text-xs p-0 select-all font-mono'>
                {this.props.keyString}
              </div>
            </div>
          </div>
        </div>

        <div className='text-center mt-6 h-16'>
          <div className='h-6'>
            <input
              className='btn w-24'
              type='button'
              value='Copy'
              onClick={() => {
                copy(this.props.keyString)
                this.setState({ showCopiedMessage: true })
              }
              }
            />
            <input
              className='btn-cancel w-24 ml-4'
              type='button'
              value='Close'
              onClick={() => window.location.hash = ''}
            />
          </div>
          <div className='text-center mt-0'>
            {this.state.showCopiedMessage && <div className='message'>Key copied to clipboard</div>}
          </div>
        </div>
      </div>
    )
  }
}

ShowKey.propTypes = {
  keyString: string
}

export default ShowKey
