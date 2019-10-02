import userbase from '../../userbase-js'

const getDbName = (username) => {
  if (!username) throw new Error('Empty username')
  return username + '-todos'
}

const openDatabase = async (username, onDbChangeHandler, onWebSocketConnect) => {
  try {
    await userbase.openDatabase(getDbName(username), onDbChangeHandler)
    onWebSocketConnect()
    return true
  } catch (e) {
    if (e.response && e.response.data === 'Database not found') {
      try {
        await userbase.createDatabase(getDbName(username))
        await userbase.openDatabase(getDbName(username), onDbChangeHandler)
        onWebSocketConnect()
        return true
      } catch (err) {
        // do nothing
      }
    }

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

const grantDatabaseAccess = async (grantorUsername, granteeUsername, readOnly) => {
  try {
    await userbase.grantDatabaseAccess(getDbName(grantorUsername), granteeUsername, readOnly)
  } catch (e) {
    _errorHandler(e, 'grant db access')
  }
}

export default {
  openDatabase,
  insertTodo,
  deleteTodo,
  toggleTodo,
  updateTodo,
  grantDatabaseAccess,
}
