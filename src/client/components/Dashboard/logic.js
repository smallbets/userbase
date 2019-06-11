import ed from '../../encrypted-dev-sdk'

const _errorHandler = (e, operation) => {
  console.log(`Failed to ${operation} with`, e, e.response && e.response.data)
  const errorMsg = (e.response && e.response.data.readableMessage) || e.message
  return { error: errorMsg }
}

const insertTodo = async (todo) => {
  try {
    const response = await ed.db.insert({ todo })
    return { item: response.data }
  } catch (e) {
    return _errorHandler(e, 'insert todo')
  }
}

const getTodos = async () => {
  try {
    const response = await ed.db.query()
    return { todos: response }
  } catch (e) {
    return _errorHandler(e, 'get todos')
  }
}

const deleteTodos = async (todos) => {
  try {
    const deletePromises = todos.map(todo => ed.db.delete(todo))
    const response = await Promise.all(deletePromises)
    return { deletedTodos: response.map(r => r.data) }
  } catch (e) {
    return _errorHandler(e, 'delete todos')
  }
}

const markTodosCompleted = async (todos) => {
  try {
    const updatePromises = todos.map(todo => ed.db.update(todo, { todo: todo.record.todo, completed: true }))
    const response = await Promise.all(updatePromises)
    return { completedTodos: response.map(r => r.data) }
  } catch (e) {
    return _errorHandler(e, 'mark todos completed')
  }
}

export default {
  insertTodo,
  getTodos,
  deleteTodos,
  markTodosCompleted,
}
