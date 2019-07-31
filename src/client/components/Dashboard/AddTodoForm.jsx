import React, { Component } from 'react'
import { func } from 'prop-types'
import dbLogic from './logic'

export default class AddTodoForm extends Component {
  constructor(props) {
    super(props)
    this.state = {
      todoInput: '',
      error: '',
      loading: false
    }

    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleAddTodo = this.handleAddTodo.bind(this)
  }

  // hacky fix to prevent last pass error in console: https://github.com/KillerCodeMonkey/ngx-quill/issues/351
  componentDidMount() {
    document.addEventListener('keydown', this.handleHitEnterToAddTodo, true)
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleHitEnterToAddTodo, true)
  }

  handleHitEnterToAddTodo(e) {
    const ENTER_KEY_CODE = 13
    if (e.target.name === 'todoInput' &&
      (e.key === 'Enter' || e.keyCode === ENTER_KEY_CODE)) {
      e.stopPropagation()
    }
  }

  handleInputChange(event) {
    if (this.state.error) this.setState({ error: undefined })

    this.setState({ todoInput: event.target.value })
  }

  async handleAddTodo(event) {
    const { todoInput } = this.state

    event.preventDefault()

    if (todoInput == '') return

    await this.setState({ loading: true, error: undefined })

    try {
      await dbLogic.insertTodo(todoInput, this.props.handleRemoveUserAuthentication)
      this.setState({ loading: false, todoInput: '' })
    } catch (e) {
      this.setState({ error: e, loading: false })
    }
  }

  render() {
    const { todoInput, error, loading } = this.state

    return (
      <div>
        {loading ? <div className='loader inline-block w-6 h-6' /> : <div />}

        <form className='flex'>
          <div className='flex-1'>
            <input
              className='todo-text text-xs xs:text-sm w-36 xs:w-48'
              type='text'
              name='todoInput'
              autoComplete='off'
              value={todoInput}
              placeholder='New to-do'
              onChange={this.handleInputChange}
            />
          </div>

          <div className='flex-1 ml-4'>
            <input
              className='btn'
              type='submit'
              value='Add'
              disabled={!todoInput}
              onClick={this.handleAddTodo}
            />
          </div>
        </form>

        {error && (
          <div className='error'>{error}</div>
        )}
      </div>
    )
  }
}

AddTodoForm.propTypes = {
  handleRemoveUserAuthentication: func
}
