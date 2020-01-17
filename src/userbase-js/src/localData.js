const setCurrentSession = (username, signedIn, sessionId, creationDate) => {
  const session = { username, signedIn, sessionId, creationDate }
  const sessionString = JSON.stringify(session)
  localStorage.setItem('userbaseCurrentSession', sessionString)
}

const getCurrentSession = () => {
  const currentSessionString = localStorage.getItem('userbaseCurrentSession')
  return JSON.parse(currentSessionString)
}

const saveSeedString = (username, seedString) => {
  localStorage.setItem('userbaseSeed.' + username, seedString)
}

const removeSeedString = (username) => {
  localStorage.removeItem('userbaseSeed.' + username)
}

const getSeedString = (username) => {
  return localStorage.getItem('userbaseSeed.' + username)
}

const signInSession = (username, sessionId, creationDate) => {
  const signedIn = true
  setCurrentSession(username, signedIn, sessionId, creationDate)
}

const signOutSession = (username) => {
  const signedIn = false
  setCurrentSession(username, signedIn)
}

const removeCurrentSession = () => localStorage.removeItem('userbaseCurrentSession')

export default {
  signInSession,
  signOutSession,
  getCurrentSession,
  saveSeedString,
  removeSeedString,
  getSeedString,
  removeCurrentSession,
}
