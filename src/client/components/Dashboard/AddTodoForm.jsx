import React, { Component } from 'react'
import { func } from 'prop-types'
import dbLogic from './logic'

class AddTodoForm extends Component {
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

  handleInputChange(event) {
    if (this.state.error) this.setState({ error: undefined })

    this.setState({ todoInput: event.target.value })
  }

  async handleAddTodo(event) {
    const { todoInput } = this.state

    event.preventDefault()

    if (todoInput == '') return

    await this.setState({ loading: true, error: undefined })

    const result = await dbLogic.insertTodo(todoInput)

    if (result.error) {
      this.setState({ error: result.error, loading: false })
    } else {
      this.props.handleSetTodos(result.todos)
      this.setState({ loading: false, todoInput: '' })
    }
  }

  render() {
    const {
      todoInput,
      error,
      loading
    } = this.state

    return (
      <div>
        {loading ? <div className='loader inline-block w-6 h-6' /> : <div />}

        <form className='flex'>
          <div className='flex-1'>
            <input
              className='todo-text'
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
  handleSetTodos: func
}

export default AddTodoForm
