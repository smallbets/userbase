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

  async componentDidMount() {
    const result = await dbLogic.getTodos(this.props.handleRemoveUserAuthentication)
    if (result) await this.setState({ todos: result.todos, loading: false })
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
      <div className='text-xs xs:text-base'>
        {
          loading
            ? <div className='text-center'><div className='loader w-6 h-6 inline-block' /></div>
            : <div className='container content'>
              <div>
                {todos && todos.length !== 0 && todos.map((todo) => (
                  <div
                    className={editingTodos[todo['item-id']] ?
                      'cursor-default container' :
                      'cursor-pointer mouse:hover:bg-yellow-200 rounded container'}
                    key={todo['item-id']}
                  >

                    {editingTodos[todo['item-id']]

                      ? <EditTodoForm
                        handleToggleEditTodo={this.handleToggleEditTodo}
                        handleDeleteTodo={this.handleDeleteTodo}
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
                            'todo-item text-sm xs:text-base line-through text-gray-600' :
                            'todo-item text-sm xs:text-base'}
                          onClick={(e) => this.handleToggleEditTodo(e, todo)}
                        >
                          {todo.record.todo}
                        </div>
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
