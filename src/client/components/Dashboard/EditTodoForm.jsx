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
    this.handleDeleteTodo = this.handleDeleteTodo.bind(this)
  }

  handleInputChange(event) {
    if (this.state.error) this.setState({ error: undefined })

    const target = event.target
    const value = target.value
    const name = target.name

    this.setState({
      [name]: value
    })
  }

  async handleSaveTodo(event) {
    const { todo, handleSetTodos } = this.props
    const { todoInput } = this.state
    event.preventDefault()

    await this.setState({ loading: true, error: undefined })

    const result = await dbLogic.updateTodo(todo, todoInput)

    if (result.error) this.setState({ error: result.error, loading: false })
    else handleSetTodos(result.todos)
  }

  async handleDeleteTodo(event) {
    const { todo, handleSetTodos } = this.props
    event.preventDefault()

    await this.setState({ loading: true, error: undefined })

    const result = await dbLogic.deleteTodo(todo)

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
      <form style={{ marginTop: '25px', padding: '10px', border: '1px solid', borderRadius: '10px' }}>

        <div style={{ display: 'flex' }}>
          <textarea
            style={{ width: '100%', padding: '5px', fontSize: '14px', height: '52px', resize: 'vertical' }}
            type='text'
            name='todoInput'
            value={todoInput}
            placeholder='To-do description...'
            onChange={this.handleInputChange}
          />
        </div>

        <div style={{ display: 'flex', marginTop: '20px' }}>
          {loading
            ? <div className='loader' style={{ margin: 'auto', height: '15px', width: '15px' }} />
            : <div style={{ width: '100%', display: 'flex', alignItems: 'center' }}>
              <input
                style={{ width: '25%', color: 'green', borderColor: 'green' }}
                type='submit'
                value='Save'
                disabled={!todoInput}
                onClick={this.handleSaveTodo}
              />
              <input
                style={{ marginLeft: '5%', width: '25%' }}
                type='submit'
                value='Cancel'
                onClick={(e) => handleToggleEditTodo(e, todo)}
              />

              <i
                className='fas fa-trash-alt'
                style={{ marginLeft: 'auto', marginRight: '10px', cursor: 'pointer', fontSize: '16px' }}
                onClick={(e) => this.handleDeleteTodo(e, todo)}
              />
            </div>
          }
        </div>

        {error && (
          <div style={{
            marginTop: '10px',
            color: 'red',
            fontSize: '.75em',
            textAlign: 'left',
            wordBreak: 'break-word',
            fontStyle: 'italic'
          }}>
            {error}
          </div>
        )}

      </form>
    )
  }
}

EditTodoForm.propTypes = {
  handleToggleEditTodo: func,
  handleSetTodos: func,
  todo: object
}

export default EditTodoForm
