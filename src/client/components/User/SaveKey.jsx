import React, { PureComponent } from 'react'
import { string, func } from 'prop-types'
import userLogic from './logic'

export default class SaveKey extends PureComponent {

  constructor(props) {
    super(props)

    this.state = {
      manualPrompt: false,
      keyString: '',
      error: ''
    }

    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleSaveKey = this.handleSaveKey.bind(this)
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

  async componentDidMount() {
    // if the key is not received automatically after 6 sec, prompt the user to enter it manually
    setTimeout(() => this.setState({ manualPrompt: true }), 6 * 1000)

    const keyString = await userLogic.requestKey()
    this.props.handleSetKeyInState(keyString)
  }

  render() {
    const { keyString, error, manualPrompt } = this.state

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
                  This device will automatically receive the secret key when you sign in from a device you used before.
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
  handleSetKeyInState: func,
  keyString: string
}
