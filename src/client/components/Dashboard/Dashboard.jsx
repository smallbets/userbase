import React, { Component } from 'react'
import { object, func } from 'prop-types'
import userLogic from '../User/logic'
import dbLogic from './logic'

class Dashboard extends Component {
  constructor(props) {
    super(props)
    this.state = {
      todoInput: '',
      error: '',
      loading: false,
      todos: [],
      selectedTodos: {}
    }

    this.handleSignOut = this.handleSignOut.bind(this)
    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleAddTodo = this.handleAddTodo.bind(this)
    this.handleToggleSelectedTodo = this.handleToggleSelectedTodo.bind(this)
    this.handleDeleteSelectedTodos = this.handleDeleteSelectedTodos.bind(this)
    this.handleMarkSelectedTodosCompleted = this.handleMarkSelectedTodosCompleted.bind(this)
  }

  async componentWillMount() {
    const result = await dbLogic.getTodos()
    this.setState({ todos: result.todos })
  }

  async handleSignOut() {
    await userLogic.signOut()
    this.props.handleRemoveUserAuthentication()
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
    else this.setState({ todos: result.todos, todoInput: '', loading: false })
  }

  handleToggleSelectedTodo(todo) {
    const { selectedTodos } = this.state
    const updatedSelectedTodos = { ...selectedTodos }

    const itemId = todo['item-id']
    if (selectedTodos[itemId]) {
      delete updatedSelectedTodos[itemId]
    } else {
      updatedSelectedTodos[itemId] = todo
    }

    this.setState({ selectedTodos: updatedSelectedTodos })
  }

  async handleDeleteSelectedTodos(event) {
    const { selectedTodos } = this.state
    event.preventDefault()

    await this.setState({ loading: true, error: undefined })

    const result = await dbLogic.deleteTodos(Object.values(selectedTodos))

    const updatedState = {
      loading: false,
      selectedTodos: []
    }

    if (result.error) this.setState({ error: result.error, ...updatedState })
    else this.setState({ todos: result.todos, ...updatedState })
  }

  async handleMarkSelectedTodosCompleted(event) {
    const { selectedTodos } = this.state
    event.preventDefault()

    await this.setState({ loading: true, error: undefined })

    const result = await dbLogic.markTodosCompleted(Object.values(selectedTodos))

    const updatedState = {
      loading: false,
      selectedTodos: []
    }

    if (result.error) this.setState({ error: result.error, ...updatedState })
    else this.setState({ todos: result.todos, ...updatedState })
  }

  render() {
    const { user } = this.props
    const { todoInput, error, loading, todos, selectedTodos } = this.state

    return (
      <div style={{ marginTop: '50px', maxWidth: '400px', wordBreak: 'break-word' }}>
        <div >
          Welcome, {user.username}!
        </div>

        <form style={{ marginTop: '25px' }}>

          <div style={{ display: 'flex' }}>
            <span style={{ display: 'inline-flex', width: '20%' }}>
              To-do:
            </span>
            <input
              style={{ display: 'inline-flex', width: '80%', marginLeft: 'auto', padding: '5px' }}
              type='text'
              name='todoInput'
              value={todoInput}
              onChange={this.handleInputChange}
            />
          </div>

          <div style={{ display: 'flex', marginTop: '20px' }}>
            {loading
              ? <div className='loader' style={{ margin: 'auto', height: '15px', width: '15px' }} />
              : <input
                style={{ width: '100%' }}
                type='submit'
                value='Add'
                disabled={!todoInput}
                onClick={this.handleAddTodo}
              />
            }
          </div>

          <div style={{ display: 'flex', marginTop: '20px' }}>
            <button disabled={!Object.keys(selectedTodos).length} style={{ width: '150px', marginLeft: '7%' }} onClick={this.handleMarkSelectedTodosCompleted}>Mark Selected Complete</button>
            <button disabled={!Object.keys(selectedTodos).length} style={{ width: '150px', marginRight: '7%', marginLeft: 'auto' }} onClick={this.handleDeleteSelectedTodos}>Delete Selected</button>
          </div>

          {todos && todos.length !== 0 && todos.map((todo) => {
            return todo.command !== 'Delete'
              ? (
                <div
                  style={{
                    textAlign: 'left',
                    marginTop: '10px',
                    textDecoration: todo.record.completed ? 'line-through' : null
                  }}
                  key={todo['sequence-no']}
                >
                  <input type='checkbox' style={{ marginRight: '1vw' }} onClick={() => this.handleToggleSelectedTodo(todo)} />
                  {todo.record.todo}
                </div>
              )
              : null
          })}

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

        <button style={{ marginTop: '25px' }} onClick={this.handleSignOut}>Sign Out</button>

      </div>
    )
  }
}

Dashboard.propTypes = {
  user: object,
  handleRemoveUserAuthentication: func
}

export default Dashboard
