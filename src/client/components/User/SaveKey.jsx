import React, { PureComponent } from 'react'
import { string, func } from 'prop-types'
import userLogic from './logic'

export default class SaveKey extends PureComponent {

  constructor(props) {
    super(props)

    this.state = {
      keyString: '',
      error: ''
    }

    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleSaveKey = this.handleSaveKey.bind(this)
    this.handleRequestKey = this.handleRequestKey.bind(this)
  }

  handleInputChange(event) {
    if (this.state.error) this.setState({ error: undefined })

    this.setState({ keyString: event.target.value })
  }

  async handleSaveKey(event) {
    const { handleSetKeyInState } = this.props
    const { keyString } = this.state

    event.preventDefault()

    if (keyString == '') return

    await userLogic.saveKey(keyString)
    handleSetKeyInState(keyString)
  }

  async handleRequestKey(event) {
    event.preventDefault()

    const keyString = await userLogic.requestKey()
    this.props.handleSetKeyInState(keyString)
  }

  render() {
    const { keyString, error } = this.state

    return (
      <form>
        <div className='container content text-xs xs:text-base'>

          <div className="font-normal mb-4">Finish signing in by providing your secret key:</div>

          <div className='table min-w-full'>

            <div className='table-row min-w-full'>
              <div className='table-cell p-0 min-w-full'>
                <input
                  className='font-light text-xs h-8 p-2 border border-gray-500 outline-none min-w-full font-mono'
                  type='text'
                  autoComplete='off'
                  onChange={this.handleInputChange}
                  placeholder='Paste your secret key here'
                />
              </div>
            </div>
          </div>

          <div className='text-center mt-6 h-16'>
            <div className='h-6'>
              <input
                className='btn w-24'
                type='submit'
                value='Save'
                disabled={!keyString}
                onClick={this.handleSaveKey}
              />
            </div>
            <div className='text-center mt-0'>
              {error}
            </div>
          </div>
          <hr className='border border-t-0 border-gray-400 mt-4 mb-4' />
          <div className="font-normal mb-4 t-xs xs:text-sm text-gray-800">You received your secret key when you created your account. You can find your key by signing in from a device you used before. Alternatively, simply click the button below then sign in from a device you used before:</div>
          <div className='text-center mt-6'>
            <input
              className='btn w-48'
              type='submit'
              value='Request Secret Key'
              onClick={this.handleRequestKey}
            />
          </div>
        </div>

      </form>
    )
  }
}

SaveKey.propTypes = {
  handleSetKeyInState: func,
  keyString: string
}
