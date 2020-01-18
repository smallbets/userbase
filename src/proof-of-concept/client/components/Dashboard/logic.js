import userbase from 'userbase-js'

const getDbName = (username) => {
  if (!username) throw new Error('Empty username')
  return username + '-todos'
}

const openDatabase = async (username, onDbChangeHandler) => {
  await userbase.openDatabase({ databaseName: getDbName(username), changeHandler: onDbChangeHandler })
}

const _errorHandler = (e, operation, handleRemoveUserAuthentication) => {
  console.log(`Failed to ${operation} with`, e)

  const unauthorized = e.status === 401
  if (unauthorized) handleRemoveUserAuthentication()

  throw new Error(e.message)
}

const insertTodo = async (username, todo, handleRemoveUserAuthentication) => {
  try {
    await userbase.insertItem({ databaseName: getDbName(username), item: { todo } })
  } catch (e) {
    _errorHandler(e, 'insert todo', handleRemoveUserAuthentication)
  }
}

const deleteTodo = async (username, todo, handleRemoveUserAuthentication) => {
  try {
    console.log(todo.itemId)

    await userbase.deleteItem({ databaseName: getDbName(username), id: todo.itemId })
  } catch (e) {
    _errorHandler(e, 'delete todos', handleRemoveUserAuthentication)
  }
}

const toggleTodo = async (username, todo, handleRemoveUserAuthentication) => {
  try {
    const markingComplete = !todo.item.completed
    await userbase.updateItem({
      databaseName: getDbName(username),
      item: { todo: todo.item.todo, completed: markingComplete },
      id: todo.itemId
    })
  } catch (e) {
    _errorHandler(e, 'toggle todos', handleRemoveUserAuthentication)
  }
}

const updateTodo = async (username, todo, newTodoInput, handleRemoveUserAuthentication) => {
  try {
    await userbase.updateItem({
      databaseName: getDbName(username),
      item: { todo: newTodoInput, completed: todo.item.completed },
      id: todo.itemId
    })
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
