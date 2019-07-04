import React, { Component } from 'react'
import { object, func } from 'prop-types'
import userLogic from '../User/logic'
import dbLogic from './logic'
import AddTodoForm from './AddTodoForm'
import EditTodoForm from './EditTodoForm'

const userHasNoTodos = (todos) => {
  let encounteredActiveTodo = false
  for (const todo of todos) {
    if (todo.command === 'Insert' || todo.command === 'Update') {
      encounteredActiveTodo = true
      break
    }
  }
  return !encounteredActiveTodo
}

class Dashboard extends Component {
  constructor(props) {
    super(props)
    this.state = {
      todoInput: '',
      error: '',
      loading: false,
      todos: [],
      editingTodos: {},
      addTodoFormOpen: false
    }

    this.handleSignOut = this.handleSignOut.bind(this)
    this.handleSetTodos = this.handleSetTodos.bind(this)
    this.handleToggleTodo = this.handleToggleTodo.bind(this)
    this.handleToggleEditTodo = this.handleToggleEditTodo.bind(this)
    this.handleOpenAddTodoForm = this.handleOpenAddTodoForm.bind(this)
    this.handleCloseAddTodoForm = this.handleCloseAddTodoForm.bind(this)
  }

  async componentWillMount() {
    const result = await dbLogic.getTodos()
    this.setState({ todos: result.todos })
  }

  async handleSignOut() {
    this.setState({ signingOut: true })
    await userLogic.signOut()
    this.props.handleRemoveUserAuthentication()
  }

  handleSetTodos(todos) {
    this.setState({ todos, addTodoFormOpen: false })
  }

  async handleToggleTodo(todo) {
    const result = await dbLogic.toggleTodo(todo)
    this.setState({ todos: result.todos })
  }

  handleToggleEditTodo(event, todo) {
    event.preventDefault()
    if (todo.record.completed) return
    const { editingTodos } = this.state
    editingTodos[todo['sequence-no']] = !editingTodos[todo['sequence-no']]
    this.setState({ editingTodos })
  }

  handleOpenAddTodoForm() {
    this.setState({ addTodoFormOpen: true })
  }

  handleCloseAddTodoForm(e) {
    e.preventDefault()
    this.setState({ addTodoFormOpen: false })
  }

  render() {
    const { user } = this.props
    const {
      todos,
      signingOut,
      addTodoFormOpen,
      editingTodos
    } = this.state

    const displayAddFirstTodoButton = !addTodoFormOpen && userHasNoTodos(todos)

    return (
      <div style={{ marginTop: '50px', maxWidth: '400px', wordBreak: 'break-word' }}>
        <div style={{ display: 'flex', height: '100%', lineHeight: '100%' }}>
          Welcome, {user.username}!

          {signingOut
            ? <div className='loader' style={{ marginLeft: 'auto', marginRight: '40px', height: '15px', width: '15px' }} />
            : <button
              style={{
                color: 'red',
                borderColor: 'red',
                height: '100%',
                marginLeft: 'auto'
              }}
              onClick={this.handleSignOut}
            >
              Sign Out
            </button>
          }

        </div>

        {displayAddFirstTodoButton
          ? <div style={{ marginTop: '75px', marginBottom: '50px' }}>
            <button onClick={this.handleOpenAddTodoForm} >Add your first To-Do!</button>
          </div>
          : <div style={{ marginTop: '30px' }}>

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

                    {editingTodos[todo['sequence-no']]

                      ? <EditTodoForm
                        handleToggleEditTodo={this.handleToggleEditTodo}
                        handleSetTodos={this.handleSetTodos}
                        todo={todo}
                      />

                      :
                      <span style={{ display: 'flex' }}>
                        <input
                          type='checkbox'
                          style={{ marginRight: '1vw', cursor: 'pointer' }}
                          onChange={() => this.handleToggleTodo(todo)}
                          checked={todo.record.completed}
                        />
                        <span
                          onClick={(e) => this.handleToggleEditTodo(e, todo)}
                          style={{
                            cursor: todo.record.completed ? 'normal' : 'pointer',
                            fontSize: '16px'
                          }}
                        >
                          {todo.record.todo}
                        </span>
                      </span>
                    }

                  </div>
                )
                : null
            })}

            <div style={{ marginTop: '30px' }}>
              {addTodoFormOpen
                ? <AddTodoForm
                  handleCloseAddTodoForm={this.handleCloseAddTodoForm}
                  handleSetTodos={this.handleSetTodos}
                />
                : <div style={{ textAlign: 'left' }}>
                  <button onClick={this.handleOpenAddTodoForm}>Add To-Do!</button>
                </div>
              }
            </div>
          </div>
        }

      </div>
    )
  }
}

Dashboard.propTypes = {
  user: object,
  handleRemoveUserAuthentication: func
}

export default Dashboard
