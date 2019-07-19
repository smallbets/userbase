import encd from '../../encrypted-dev-sdk'

const _errorHandler = (e, operation, handleRemoveUserAuthentication) => {
  console.log(`Failed to ${operation} with`, e, e.response && e.response.data)

  const unauthorized = e.response && e.response.status === 401
  if (unauthorized) handleRemoveUserAuthentication()

  const timeout = e.response && e.response.status === 504 || e.message.includes('timeout')
  if (timeout) return { error: 'Something went wrong, please try again!' }

  const errorMsg = (e.response && e.response.data.readableMessage) || e.message
  return { error: errorMsg }
}

const insertTodo = async (todo, handleRemoveUserAuthentication) => {
  try {
    await encd.db.insert({ todo })
    return { todos: encd.db.getLatestState() }
  } catch (e) {
    return _errorHandler(e, 'insert todo', handleRemoveUserAuthentication)
  }
}

const getTodos = async (handleRemoveUserAuthentication) => {
  try {
    const t0 = performance.now()
    const response = await encd.db.query()
    const t1 = performance.now()
    const timeToRun = `${((t1 - t0) / 1000).toFixed(2)}`
    console.log('Call to SDK db query took ' + timeToRun + 's')
    return { todos: response }
  } catch (e) {
    return _errorHandler(e, 'get todos', handleRemoveUserAuthentication)
  }
}

const deleteTodo = async (todo, handleRemoveUserAuthentication) => {
  try {
    const itemId = todo['item-id']
    await encd.db.delete(itemId)
    return { todos: encd.db.getLatestState() }
  } catch (e) {
    return _errorHandler(e, 'delete todo', handleRemoveUserAuthentication)
  }
}

const toggleTodo = async (todo, handleRemoveUserAuthentication) => {
  try {
    const markingComplete = !todo.record.completed
    const itemId = todo['item-id']
    await encd.db.update(itemId, { todo: todo.record.todo, completed: markingComplete })
    return { todos: encd.db.getLatestState() }
  } catch (e) {
    return _errorHandler(e, 'toggle todo', handleRemoveUserAuthentication)
  }
}

const updateTodo = async (todo, newTodoInput, handleRemoveUserAuthentication) => {
  try {
    const itemId = todo['item-id']
    await encd.db.update(itemId, { todo: newTodoInput, completed: todo.record.completed })
    return { todos: encd.db.getLatestState() }
  } catch (e) {
    return _errorHandler(e, 'update todo', handleRemoveUserAuthentication)
  }
}

export default {
  insertTodo,
  getTodos,
  deleteTodo,
  toggleTodo,
  updateTodo,
}
