import React, { PureComponent } from 'react'
import { string } from 'prop-types'
import userLogic from './logic'

export default class SaveKey extends PureComponent {

  constructor(props) {
    super(props)

    this.state = {
      manualPrompt: false,
      keyString: '',
      error: '',
      devicePublicKey: undefined
    }

    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleSaveKey = this.handleSaveKey.bind(this)
  }

  handleInputChange(event) {
    if (this.state.error) this.setState({ error: undefined })

    this.setState({ keyString: event.target.value })
  }

  async handleSaveKey(event) {
    const { keyString } = this.state

    event.preventDefault()

    if (keyString == '') return

    await userLogic.saveKey(keyString)
  }

  async componentDidMount() {
    const { devicePublicKey, firstTimeRegistering } = await userLogic.registerDevice()

    if (firstTimeRegistering) {
      this.setState({ devicePublicKey, manualPrompt: true })
    } else {
      // if the key is not received automatically after 6 sec, prompt the user to enter it manually
      setTimeout(() => this.setState({ manualPrompt: true }), 6 * 1000)

      this.setState({ devicePublicKey })
    }
  }

  render() {
    const { keyString, error, manualPrompt, devicePublicKey } = this.state

    return (
      <form>
        <div className='container content text-xs xs:text-base'>

          {
            !manualPrompt
              ? <div className='text-center mt-8 mb-6'>
                <div className='loader inline-block w-6 h-6' />
              </div>
              : <div>
                <div className="font-normal mb-4">
                  Sign in from a device you used before to send the secret key to this device.
                </div>

                <div className="font-normal mb-4">
                  Before sending, please verify the Device ID matches:
                </div>
                <div className='font-light text-xs xs:text-sm break-all p-0 select-all font-mono text-red-600'>
                  {devicePublicKey}
                </div>

                <div className='text-center mt-8 mb-6'>
                  <div className='loader inline-block w-6 h-6' />
                </div>

                <div className="font-normal mb-4">
                  You can also manually enter the secret key below. You received your secret key when you created your account.
                </div>

                <div className='table min-w-full mt-12'>

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

              </div>
          }
        </div>
      </form>
    )
  }
}

SaveKey.propTypes = {
  keyString: string
}
