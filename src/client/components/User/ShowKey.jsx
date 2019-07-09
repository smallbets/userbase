import React, { PureComponent } from 'react'
import { string } from 'prop-types'

class ShowKey extends PureComponent {

  render() {
    return (
      <div className='container max-w-sm font-bold bg-white p-8 shadow-md'>

        <div className='table'>

          <div className='table-row'>
            <div className='table-cell p-2 text-right'>Key</div>
            <div className='table-cell p-2'>
              <div className='font-light text-sm p-2 select-all font-mono'>
                {this.props.keyString}
              </div>
            </div>
          </div>
        </div>

        <div className='text-center mt-3 h-16'>
          <div className='h-6'>
            <input
              className='btn w-24'
              type='button'
              value='Close'
              onClick={() => window.location.hash = ''}
            />
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
