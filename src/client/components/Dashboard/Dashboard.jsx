import React, { Component } from 'react'
import { func } from 'prop-types'
import dbLogic from './logic'
import AddTodoForm from './AddTodoForm'
import EditTodoForm from './EditTodoForm'

class Dashboard extends Component {
  constructor(props) {
    super(props)
    this.state = {
      todoInput: '',
      error: '',
      loading: true,
      todos: [],
      editingTodos: {},
      addTodoFormOpen: false
    }

    this.handleSetTodos = this.handleSetTodos.bind(this)
    this.handleToggleTodo = this.handleToggleTodo.bind(this)
    this.handleToggleEditTodo = this.handleToggleEditTodo.bind(this)
    this.handleDeleteTodo = this.handleDeleteTodo.bind(this)
  }

  async componentWillMount() {
    const result = await dbLogic.getTodos(this.props.handleRemoveUserAuthentication)
    if (result) this.setState({ todos: result.todos, loading: false })
  }

  handleSetTodos(todos) {
    this.setState({ todos })
  }

  async handleToggleTodo(todo) {
    const result = await dbLogic.toggleTodo(todo, this.props.handleRemoveUserAuthentication)
    this.setState({ todos: result.todos })
  }

  handleToggleEditTodo(event, todo) {
    if (event) event.preventDefault()
    if (todo.record.completed) return
    const { editingTodos } = this.state
    editingTodos[todo['item-id']] = !editingTodos[todo['item-id']]
    this.setState({ editingTodos })
  }

  async handleDeleteTodo(event, todo) {
    event.preventDefault()

    await this.setState({ error: undefined })

    const result = await dbLogic.deleteTodo(todo, this.props.handleRemoveUserAuthentication)

    if (result.error) this.setState({ error: result.error })
    else this.handleSetTodos(result.todos)
  }

  render() {
    const {
      todos,
      editingTodos,
      loading
    } = this.state

    return (
      <div>
        {
          loading
            ? <div className='text-center'><div className='loader w-6 h-6 inline-block' /></div>
            : <div className='container content'>
              <div>
                {todos && todos.length !== 0 && todos.map((todo) => (
                  <div
                    className={editingTodos[todo['item-id']] ?
                      'cursor-default relative container group' :
                      'cursor-pointer relative hover:bg-yellow-200 rounded container group'}
                    key={todo['item-id']}
                  >

                    {editingTodos[todo['item-id']]

                      ? <EditTodoForm
                        handleToggleEditTodo={this.handleToggleEditTodo}
                        handleSetTodos={this.handleSetTodos}
                        todo={todo}
                      />

                      :
                      <div className='py-2 container flex'>
                        <div
                          className={todo.record.completed ? 'checkbox-checked fa-check' : 'checkbox fa-check-empty'}
                          onClick={() => this.handleToggleTodo(todo)}
                        />
                        <div
                          className={todo.record.completed ?
                            'inline-block ml-2 font-semibold line-through text-gray-600 flex-1' :
                            'inline-block ml-2 font-semibold flex-1'}
                          onClick={(e) => this.handleToggleEditTodo(e, todo)}
                        >
                          {todo.record.todo}
                        </div>
                        <div
                          className='fas fa-trash-alt absolute inset-y-0 right-0 mr-2 rounded-lg pt-2 pb-2 bg-transparent font-normal text-yellow-700 invisible group-hover:visible'
                          onClick={(e) => this.handleDeleteTodo(e, todo)}
                        />
                      </div>
                    }

                  </div>
                )

                )}

                <div>
                  <hr className='border border-t-0 border-gray-400 mt-4 mb-4' />
                  <AddTodoForm handleSetTodos={this.handleSetTodos} />
                </div>
              </div>
            </div>
        }
      </div>
    )
  }
}

Dashboard.propTypes = {
  handleRemoveUserAuthentication: func
}

export default Dashboard
