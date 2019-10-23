import userbase from 'userbase-js'

const getDbName = (username) => {
  if (!username) throw new Error('Empty username')
  return username + '-todos'
}

const createOrOpenDatabase = async (username, onDbChangeHandler, onWebSocketConnect) => {
  try {
    await userbase.createOrOpenDatabase(getDbName(username), onDbChangeHandler)
    onWebSocketConnect()
    return true
  } catch (e) {
    return false
  }
}

const _errorHandler = (e, operation, handleRemoveUserAuthentication) => {
  console.log(`Failed to ${operation} with ${e.message}${e.response ? ': ' + e.response.data : ''}`)

  const unauthorized = e.response && e.response.status === 401
  if (unauthorized) handleRemoveUserAuthentication()

  const timeout = e.response && e.response.status === 504 || e.message.includes('timeout')
  if (timeout) throw new Error('Something went wrong, please try again!')

  throw new Error((e.response && e.response.data) || e.message)
}

const insertTodo = async (username, todo, handleRemoveUserAuthentication) => {
  try {
    await userbase.insert(getDbName(username), { todo })
  } catch (e) {
    _errorHandler(e, 'insert todo', handleRemoveUserAuthentication)
  }
}

const deleteTodo = async (username, todo, handleRemoveUserAuthentication) => {
  try {
    await userbase.delete(getDbName(username), todo.itemId)
  } catch (e) {
    _errorHandler(e, 'delete todos', handleRemoveUserAuthentication)
  }
}

const toggleTodo = async (username, todo, handleRemoveUserAuthentication) => {
  try {
    const markingComplete = !todo.record.completed
    await userbase.update(getDbName(username), todo.itemId, { todo: todo.record.todo, completed: markingComplete })
  } catch (e) {
    _errorHandler(e, 'toggle todos', handleRemoveUserAuthentication)
  }
}

const updateTodo = async (username, todo, newTodoInput, handleRemoveUserAuthentication) => {
  try {
    await userbase.update(getDbName(username), todo.itemId, { todo: newTodoInput, completed: todo.record.completed })
  } catch (e) {
    _errorHandler(e, 'update todo', handleRemoveUserAuthentication)
  }
}

export default {
  createOrOpenDatabase,
  insertTodo,
  deleteTodo,
  toggleTodo,
  updateTodo,
}
