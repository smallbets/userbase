import ed from '../../encrypted-dev-sdk'

const _errorHandler = (e, operation) => {
  console.log(`Failed to ${operation} with`, e, e.response && e.response.data)
  const errorMsg = (e.response && e.response.data.readableMessage) || e.message
  return { error: errorMsg }
}

const insertTodo = async (todo) => {
  try {
    await ed.db.insert({ todo })
    return { todos: Object.values(ed.db.getLatestState()) }
  } catch (e) {
    return _errorHandler(e, 'insert todo')
  }
}

const getTodos = async () => {
  try {
    const response = await ed.db.query()
    return { todos: Object.values(response) }
  } catch (e) {
    return _errorHandler(e, 'get todos')
  }
}

const deleteTodos = async (todos) => {
  try {
    const deletePromises = todos.map(todo => ed.db.delete(todo))
    await Promise.all(deletePromises)
    return { todos: Object.values(ed.db.getLatestState()) }
  } catch (e) {
    return _errorHandler(e, 'delete todos')
  }
}

const markTodosCompleted = async (todos) => {
  try {
    const updatedTodosPromises = todos.map(todo => ed.db.update(todo, { todo: todo.record.todo, completed: true }))
    await Promise.all(updatedTodosPromises)
    return { todos: Object.values(ed.db.getLatestState()) }
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
