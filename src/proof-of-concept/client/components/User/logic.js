import userbase from 'userbase-js'

const _errorHandler = (e, operation) => {
  console.log(`Failed to ${operation} with`, e)

  return { error: e.message }
}

const signUp = async (username, password) => {
  try {
    const user = await userbase.signUp(username, password)
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

const signIn = async (username, password) => {
  try {
    const result = await userbase.signIn(username, password)
    return result
  } catch (e) {
    return _errorHandler(e, 'sign in')
  }
}

const init = async (appId, endpoint) => {
  try {
    const session = await userbase.init({ appId, endpoint })
    return session
  } catch (e) {
    return _errorHandler(e, 'init')
  }
}

export default {
  signUp,
  signOut,
  signIn,
  init
}
