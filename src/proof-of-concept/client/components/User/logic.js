import userbase from 'userbase-js'

const _errorHandler = (e, operation) => {
  console.log(`Failed to ${operation} with`, e, e.response && e.response.data)

  const timeout = e.response && e.response.status === 504 || e.message.includes('timeout')
  if (timeout) return { error: 'Something went wrong, please try again!' }

  const errorMsg = (e.response && e.response.data.readableMessage) || e.message
  return { error: errorMsg }
}

const signUp = async (username, password, onSessionChange) => {
  try {
    await userbase.signUp(username, password, onSessionChange)
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

const signIn = async (username, password, onSessionChange) => {
  try {
    await userbase.signIn(username, password, onSessionChange)
  } catch (e) {
    return _errorHandler(e, 'sign in')
  }
}

const saveKey = async (key) => {
  await userbase.importKey(key)
}

const initSession = async (onSessionChange) => {
  try {
    await userbase.initSession(onSessionChange)
  } catch (e) {
    return _errorHandler(e, 'init session')
  }
}

export default {
  signUp,
  signOut,
  signIn,
  saveKey,
  initSession
}
