import encd from '../../encrypted-dev-sdk'

const DB_NAME = 'Todos'

const openDatabase = async (onDbChangeHandler, onWebSocketConnect) => {
  try {
    await encd.openDatabase(DB_NAME, onDbChangeHandler)
    onWebSocketConnect()
    return true
  } catch (e) {
    if (e.response && e.response.data === 'Database not found') {
      try {
        await encd.createDatabase(DB_NAME)
        await encd.openDatabase(DB_NAME, onDbChangeHandler)
        onWebSocketConnect()
        return true
      } catch (err) {
        // do nothing
      }
    }

    encd.clearAuthenticatedDataFromBrowser()
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

const insertTodo = async (todo, handleRemoveUserAuthentication) => {
  try {
    await encd.insert(DB_NAME, { todo })
  } catch (e) {
    _errorHandler(e, 'insert todo', handleRemoveUserAuthentication)
  }
}

const deleteTodo = async (todo, handleRemoveUserAuthentication) => {
  try {
    await encd.delete(DB_NAME, todo.itemId)
  } catch (e) {
    _errorHandler(e, 'delete todos', handleRemoveUserAuthentication)
  }
}

const toggleTodo = async (todo, handleRemoveUserAuthentication) => {
  try {
    const markingComplete = !todo.record.completed
    await encd.update(DB_NAME, todo.itemId, { todo: todo.record.todo, completed: markingComplete })
  } catch (e) {
    _errorHandler(e, 'toggle todos', handleRemoveUserAuthentication)
  }
}

const updateTodo = async (todo, newTodoInput, handleRemoveUserAuthentication) => {
  try {
    await encd.update(DB_NAME, todo.itemId, { todo: newTodoInput, completed: todo.record.completed })
  } catch (e) {
    _errorHandler(e, 'update todo', handleRemoveUserAuthentication)
  }
}

export default {
  openDatabase,
  insertTodo,
  deleteTodo,
  toggleTodo,
  updateTodo,
}
