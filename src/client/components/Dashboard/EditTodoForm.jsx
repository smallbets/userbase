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

  // hacky fix to prevent last pass error in console: https://github.com/KillerCodeMonkey/ngx-quill/issues/351
  componentDidMount() {
    document.addEventListener('keydown', this.handleHitEnterToSaveTodo, true)
  }
  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleHitEnterToSaveTodo, true)
  }
  handleHitEnterToSaveTodo(e) {
    e.stopPropagation()
  }

  handleInputChange(event) {
    if (this.state.error) this.setState({ error: undefined })

    this.setState({ todoInput: event.target.value })
  }

  async handleSaveTodo(event) {
    const { todo, handleSetTodos, handleRemoveUserAuthentication, handleToggleEditTodo } = this.props
    const { todoInput } = this.state

    event.preventDefault()

    if (todoInput == '') return

    await this.setState({ loading: true, error: undefined })

    const result = await dbLogic.updateTodo(todo, todoInput, handleRemoveUserAuthentication)

    if (result.error) this.setState({ error: result.error, loading: false })
    else {
      handleSetTodos(result.todos)
      handleToggleEditTodo(null, todo)
    }
  }

  render() {
    const { handleToggleEditTodo, handleDeleteTodo, todo } = this.props
    const {
      todoInput,
      error,
      loading
    } = this.state

    return (
      <div className="py-1">
        {loading && <div className="h-8"><div className='loader inline-block w-6 h-6' /></div>}

        {!loading && <form className='container flex h-8'>
          <div className='flex-1'>
            <input
              className='todo-text text-xs xs:text-sm w-24 xs:w-40 sm:w-48'
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
          <div
            className='fas fa-trash-alt ml-4 pt-1 font-normal text-lg cursor-pointer text-yellow-700'
            onClick={(e) => handleDeleteTodo(e, todo)}
          />
          <div
            className='fas fa-times-circle ml-4 pt-1 font-normal text-lg cursor-pointer text-yellow-700'
            onClick={(e) => handleToggleEditTodo(e, todo)}
          />
        </form>
        }

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
  handleDeleteTodo: func,
  handleSetTodos: func,
  todo: object
}

export default EditTodoForm
