import React, { Component } from 'react'
import { func } from 'prop-types'
import dbLogic from './logic'
import AddTodoForm from './AddTodoForm'
import EditTodoForm from './EditTodoForm'

export default class Dashboard extends Component {
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

    this.handleDbChange = this.handleDbChange.bind(this)
    this.handleToggleTodo = this.handleToggleTodo.bind(this)
    this.handleToggleEditTodo = this.handleToggleEditTodo.bind(this)
  }

  async componentDidMount() {
    dbLogic.init(this.handleDbChange, () => this.setState({ loading: false }))
    this.setState({ loading: true })
  }

  handleDbChange(todos) {
    this.setState({ todos, loading: false })
  }

  async handleToggleTodo(todo) {
    try {
      await dbLogic.toggleTodo(todo, this.props.handleRemoveUserAuthentication)
    } catch (error) {
      this.setState({ error })
    }
  }

  handleToggleEditTodo(event, todo) {
    if (event) event.preventDefault()
    const { editingTodos } = this.state
    editingTodos[todo.itemId] = !editingTodos[todo.itemId]
    this.setState({ editingTodos })
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
                    className={editingTodos[todo.itemId] ?
                      'cursor-default container' :
                      'cursor-pointer mouse:hover:bg-yellow-200 rounded container'}
                    key={todo.itemId}
                  >

                    {editingTodos[todo.itemId]

                      ? <EditTodoForm
                        handleToggleEditTodo={this.handleToggleEditTodo}
                        handleRemoveUserAuthentication={this.props.handleRemoveUserAuthentication}
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
                  <AddTodoForm handleRemoveUserAuthentication={this.props.handleRemoveUserAuthentication} />
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
