import React, { Component } from 'react'
import { func, object } from 'prop-types'
import dbLogic from './logic'

class EditTodoForm extends Component {
  constructor(props) {
    super(props)
    this.state = {
      todoInput: this.props.todo.record.todo,
      error: '',
      loading: false
    }

    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleSaveTodo = this.handleSaveTodo.bind(this)
  }

  handleInputChange(event) {
    if (this.state.error) this.setState({ error: undefined })

    this.setState({ todoInput: event.target.value })
  }

  async handleSaveTodo(event) {
    const { todo, handleSetTodos, handleRemoveUserAuthentication } = this.props
    const { todoInput } = this.state

    event.preventDefault()

    if (todoInput == '') return

    await this.setState({ loading: true, error: undefined })

    const result = await dbLogic.updateTodo(todo, todoInput, handleRemoveUserAuthentication)

    if (result.error) this.setState({ error: result.error, loading: false })
    else handleSetTodos(result.todos)
  }

  render() {
    const { handleToggleEditTodo, todo } = this.props
    const {
      todoInput,
      error,
      loading
    } = this.state

    return (
      <div className="py-1">
        {loading ? <div className='loader inline-block w-6 h-6' /> : <div />}

        <form className='container flex'>
          <div className='flex-1'>
            <input
              className='todo-text'
              type='text'
              name='todoInput'
              autoComplete='off'
              value={todoInput}
              placeholder='To-do item'
              onChange={this.handleInputChange}
            />
          </div>

          <div className='flex-1 ml-4'>
            <input
              className='btn'
              type='submit'
              value='Save'
              disabled={!todoInput}
              onClick={this.handleSaveTodo}
            />
          </div>
          <div className='flex-1 ml-2'>
            <input
              className='btn-cancel'
              type='button'
              value='Cancel'
              onClick={(e) => handleToggleEditTodo(e, todo)}
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

EditTodoForm.propTypes = {
  handleRemoveUserAuthentication: func,
  handleToggleEditTodo: func,
  handleSetTodos: func,
  todo: object
}

export default EditTodoForm
