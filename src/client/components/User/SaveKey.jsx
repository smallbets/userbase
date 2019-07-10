import React, { PureComponent } from 'react'
import { string, func } from 'prop-types'
import userLogic from './logic'

class SaveKey extends PureComponent {

  constructor(props) {
    super(props)

    this.state = {
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

    userLogic.saveKey(keyString)
    handleSetKeyInState(keyString)
  }

  render() {
    const { keyString, error } = this.state

    return (
      <form>
        <div className='container content'>

          <div className='table min-w-full'>

            <div className='table-row min-w-full'>
              <div className='table-cell p-0 min-w-full'>
                <input
                  className='font-light text-xs h-8 p-2 border border-gray-500 outline-none min-w-full font-mono'
                  type='text'
                  autoComplete='off'
                  onChange={this.handleInputChange}
                  placeholder='Paste key here'
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

      </form>
    )
  }
}

SaveKey.propTypes = {
  handleSetKeyInState: func,
  keyString: string
}

export default SaveKey
