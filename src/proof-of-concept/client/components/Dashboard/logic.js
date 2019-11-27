import userbase from 'userbase-js'

const getDbName = (username) => {
  if (!username) throw new Error('Empty username')
  return username + '-todos'
}

const openDatabase = async (username, onDbChangeHandler) => {
  await userbase.openDatabase(getDbName(username), onDbChangeHandler)
}

const _errorHandler = (e, operation, handleRemoveUserAuthentication) => {
  console.log(`Failed to ${operation} with`, e)

  const unauthorized = e.status === 401
  if (unauthorized) handleRemoveUserAuthentication()

  throw new Error(e.message)
}

const insertTodo = async (username, todo, handleRemoveUserAuthentication) => {
  try {
    await userbase.insertItem(getDbName(username), { todo })
  } catch (e) {
    _errorHandler(e, 'insert todo', handleRemoveUserAuthentication)
  }
}

const deleteTodo = async (username, todo, handleRemoveUserAuthentication) => {
  try {
    await userbase.deleteItem(getDbName(username), todo.itemId)
  } catch (e) {
    _errorHandler(e, 'delete todos', handleRemoveUserAuthentication)
  }
}

const toggleTodo = async (username, todo, handleRemoveUserAuthentication) => {
  try {
    const markingComplete = !todo.item.completed
    await userbase.updateItem(getDbName(username), { todo: todo.item.todo, completed: markingComplete }, todo.itemId)
  } catch (e) {
    _errorHandler(e, 'toggle todos', handleRemoveUserAuthentication)
  }
}

const updateTodo = async (username, todo, newTodoInput, handleRemoveUserAuthentication) => {
  try {
    await userbase.updateItem(getDbName(username), { todo: newTodoInput, completed: todo.item.completed }, todo.itemId)
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
