import userbase from 'userbase-js'

const _errorHandler = (e, operation) => {
  console.log(`Failed to ${operation} with`, e)

  return { error: e.message }
}

const signUp = async (username, password, email, rememberMe) => {
  try {
    const user = await userbase.signUp({ username, password, email, rememberMe })
    return user
  } catch (e) {
    return _errorHandler(e, 'sign up')
  }
}

const signOut = async () => {
  try {
    await userbase.signOut()
  } catch (e) {
    return _errorHandler(e, 'sign out')
  }
}

const signIn = async (username, password, rememberMe) => {
  try {
    const result = await userbase.signIn({ username, password, rememberMe })
    return result
  } catch (e) {
    return _errorHandler(e, 'sign in')
  }
}

const init = async (settings) => {
  try {
    const session = await userbase.init(settings)
    return session
  } catch (e) {
    return _errorHandler(e, 'init')
  }
}

export default {
  signUp,
  signOut,
  signIn,
  init,
}
