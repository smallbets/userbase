import userbase from 'userbase-js'

const _errorHandler = (e, operation) => {
  console.log(`Failed to ${operation} with`, e, e.response && e.response.data)

  const timeout = e.response && e.response.status === 504 || e.message.includes('timeout')
  if (timeout) return { error: 'Something went wrong, please try again!' }

  const errorMsg = (e.response && e.response.data) || e.message
  return { error: errorMsg }
}

const signUp = async (username, password) => {
  try {
    const session = await userbase.signUp(username, password)
    return session
  } catch (e) {
    return _errorHandler(e, 'sign up')
  }
}

const signOut = async () => {
  try {
    const session = await userbase.signOut()
    return session
  } catch (e) {
    return _errorHandler(e, 'sign out')
  }
}

const signIn = async (username, password) => {
  try {
    const session = await userbase.signIn(username, password)
    return session
  } catch (e) {
    return _errorHandler(e, 'sign in')
  }
}

const signInWithSession = async () => {
  try {
    const session = await userbase.signInWithSession()
    return session
  } catch (e) {
    return _errorHandler(e, 'sign in with session')
  }
}

export default {
  signUp,
  signOut,
  signIn,
  signInWithSession
}
