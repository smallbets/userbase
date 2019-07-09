import encd from '../../encrypted-dev-sdk'

const _errorHandler = (e, operation) => {
  console.log(`Failed to ${operation} with`, e, e.response && e.response.data)
  const errorMsg = (e.response && e.response.data.readableMessage) || e.message
  return { error: errorMsg }
}

const signUp = async (username, password) => {
  try {
    const session = await encd.signUp(username, password)
    return session
  } catch (e) {
    return _errorHandler(e, 'sign up')
  }
}

const signOut = async () => {
  try {
    await encd.signOut()
  } catch (e) {
    return _errorHandler(e, 'sign out')
  }
}

const signIn = async (username, password) => {
  try {
    const session = await encd.signIn(username, password)
    return session
  } catch (e) {
    return _errorHandler(e, 'sign in')
  }
}

const getSession = () => {
  return encd.getCurrentSession()
}

export default {
  signUp,
  signOut,
  signIn,
  getSession,
}
