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

    const target = event.target
    const value = target.value
    const name = target.name

    this.setState({
      [name]: value
    })
  }

  async handleAddTodo(event) {
    const { todoInput } = this.state
    event.preventDefault()

    await this.setState({ loading: true, error: undefined })

    const result = await dbLogic.insertTodo(todoInput)

    if (result.error) this.setState({ error: result.error, loading: false })
    else this.props.handleSetTodos(result.todos)
  }

  render() {
    const { handleCloseAddTodoForm } = this.props
    const {
      todoInput,
      error,
      loading
    } = this.state

    return (
      <form style={{ marginTop: '25px' }}>

        <div style={{ display: 'flex' }}>
          <textarea
            style={{ width: '100%', padding: '5px', fontSize: '14px', height: '7vh', resize: 'vertical' }}
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
            : <div style={{ width: '100%', textAlign: 'left' }}>
              <input
                style={{ width: '25%', color: 'green', borderColor: 'green' }}
                type='submit'
                value='Add'
                disabled={!todoInput}
                onClick={this.handleAddTodo}
              />
              <input
                style={{ marginLeft: '5%', width: '25%' }}
                type='submit'
                value='Cancel'
                onClick={handleCloseAddTodoForm}
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

AddTodoForm.propTypes = {
  handleCloseAddTodoForm: func,
  handleSetTodos: func
}

export default AddTodoForm
