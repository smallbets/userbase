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
    else this.setState({
      todos: this.state.todos.concat({
        record: { todo: todoInput },
        command: 'Insert',
        ...result.item
      }),
      loading: false
    })
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

    if (result.error) this.setState({ error: result.error, loading: false })
    else {
      const deletedTodos = result.deletedTodos.map(deletedTodo => ({
        command: 'Delete',
        ...deletedTodo
      }))

      this.setState({
        todos: this.state.todos.concat(deletedTodos),
        loading: false
      })
    }
  }

  async handleMarkSelectedTodosCompleted(event) {
    const { selectedTodos } = this.state
    event.preventDefault()

    await this.setState({ loading: true, error: undefined })

    const result = await dbLogic.markTodosCompleted(Object.values(selectedTodos))

    if (result.error) this.setState({ error: result.error, loading: false })
    else {
      const completedTodos = result.completedTodos.map(completedTodo => ({
        command: 'Update',
        ...completedTodo
      }))

      this.setState({
        todos: this.state.todos.concat(completedTodos),
        loading: false
      })
    }
  }

  render() {
    const { user } = this.props
    const { todoInput, error, loading, todos } = this.state

    return (
      <div style={{ marginTop: '50px' }}>
        <div >
          Welcome, {user.username}!
        </div>

        <form style={{ marginTop: '25px' }}>

          <div style={{ width: '250px', margin: 'auto' }}>

            <div style={{ display: 'flex' }}>
              To-do:
              <input
                style={{ marginLeft: 'auto', padding: '5px' }}
                type='text'
                name='todoInput'
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
              <button onClick={this.handleMarkSelectedTodosCompleted}>Mark Selected Complete</button>
              <button onClick={this.handleDeleteSelectedTodos}>Delete Selected</button>
            </div>

            {todos && todos.length !== 0 && todos.map((todo) => {
              return (
                <div style={{ marginTop: '10px' }} key={todo['sequence-no']}>
                  <input type='checkbox' onClick={() => this.handleToggleSelectedTodo(todo)} />
                  {JSON.stringify(todo, null, 2)}
                </div>
              )
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

          </div>

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
