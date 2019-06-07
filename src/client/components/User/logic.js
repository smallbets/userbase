import ed from '../../encrypted-dev-sdk'

const _errorHandler = (e, operation) => {
  console.log(`Failed to ${operation} with`, e, e.response && e.response.data)
  const errorMsg = (e.response && e.response.data.readableMessage) || e.message
  return { error: errorMsg }
}

const signUp = async (username, password) => {
  try {
    const response = await ed.signUp(username, password)
    return { user: response.data }
  } catch (e) {
    return _errorHandler(e, 'sign up')
  }
}

const signOut = async () => {
  try {
    const response = await ed.signOut()
    localStorage.setItem('signedIn', false)
    return { response }
  } catch (e) {
    return _errorHandler(e, 'sign out')
  }
}

const signIn = async (username, password) => {
  try {
    const response = await ed.signIn(username, password)
    localStorage.setItem('signedIn', true)
    return { user: response.data }
  } catch (e) {
    return _errorHandler(e, 'sign in')
  }
}

const isUserSignedIn = async () => {
  try {
    const signedIn = localStorage.getItem('signedIn')
    if (!signedIn) return false
    const response = await ed.user.find()
    return { user: response.data }
  } catch (e) {
    return false
  }
}

export default {
  signUp,
  signOut,
  signIn,
  isUserSignedIn,
}
