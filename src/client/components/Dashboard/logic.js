import encd from '../../encrypted-dev-sdk'

const init = (onDbChangeHandler, onWebSocketConnect) => {
  encd.db.init(onDbChangeHandler, onWebSocketConnect)
}

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
  } catch (e) {
    return _errorHandler(e, 'insert todo', handleRemoveUserAuthentication)
  }
}

const deleteTodo = async (todo, handleRemoveUserAuthentication) => {
  try {
    await encd.db.delete(todo)
  } catch (e) {
    return _errorHandler(e, 'delete todos', handleRemoveUserAuthentication)
  }
}

const toggleTodo = async (todo, handleRemoveUserAuthentication) => {
  try {
    const markingComplete = !todo.record.completed
    await encd.db.update(todo, { todo: todo.record.todo, completed: markingComplete })
  } catch (e) {
    return _errorHandler(e, 'toggle todos', handleRemoveUserAuthentication)
  }
}

const updateTodo = async (todo, newTodoInput, handleRemoveUserAuthentication) => {
  try {
    await encd.db.update(todo, { todo: newTodoInput, completed: todo.record.completed })
  } catch (e) {
    return _errorHandler(e, 'update todo', handleRemoveUserAuthentication)
  }
}

export default {
  init,
  insertTodo,
  deleteTodo,
  toggleTodo,
  updateTodo,
}
