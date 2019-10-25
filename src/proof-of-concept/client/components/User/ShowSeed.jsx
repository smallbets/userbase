import React, { Component } from 'react'
import { string } from 'prop-types'
import copy from 'copy-to-clipboard'

export default class ShowSeed extends Component {

  constructor(props) {
    super(props)

    this.state = {
      showCopiedMessage: false
    }
  }

  render() {
    return (
      <div className='container content text-xs xs:text-base'>

        <div className="font-normal mb-4">Your secret seed:</div>

        <div className='table'>

          <div className='table-row'>
            <div className='table-cell p-0'>
              <div className='font-light text-xs xs:text-sm break-all p-0 select-all font-mono text-red-600'>
                {this.props.seed}
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
                copy(this.props.seed)
                this.setState({ showCopiedMessage: true })
              }}
            />
            <input
              className='btn-cancel w-24 ml-4'
              type='button'
              value='Close'
              onClick={() => window.location.hash = ''}
            />
          </div>
          <div className='text-center mt-0'>
            {this.state.showCopiedMessage && <div className='message'>Seed copied to clipboard</div>}
          </div>
        </div>
        <hr className='border border-t-0 border-gray-400 mt-4 mb-4' />
        <div className="font-normal mb-4 text-xs xs:text-sm">Store this seed somewhere safe. You will need your secret seed to sign in on other devices.</div>
      </div>
    )
  }
}

ShowSeed.propTypes = {
  seed: string
}
