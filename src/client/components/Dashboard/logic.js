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
    return _errorHandler(e, 'insert')
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

export default {
  insertTodo,
  getTodos,
}
