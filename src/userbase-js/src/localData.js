const setCurrentSession = (username, signedIn, sessionId, creationDate) => {
  const session = { username, signedIn, sessionId, creationDate }
  const sessionString = JSON.stringify(session)
  localStorage.setItem('userbaseCurrentSession', sessionString)
}

const getCurrentSession = () => {
  const currentSessionString = localStorage.getItem('userbaseCurrentSession')
  return JSON.parse(currentSessionString)
}

const saveSeedString = (appId, username, seedString) => {
  localStorage.setItem(`userbaseSeed.${appId}.${username}`, seedString)
}

const removeSeedString = (appId, username) => {
  localStorage.removeItem(`userbaseSeed.${appId}.${username}`)
}

const getSeedString = (appId, username) => {
  return localStorage.getItem(`userbaseSeed.${appId}.${username}`)
}

const signInSession = (username, sessionId, creationDate) => {
  const signedIn = true
  setCurrentSession(username, signedIn, sessionId, creationDate)
}

const signOutSession = (username) => {
  const signedIn = false
  setCurrentSession(username, signedIn)
}

const removeCurrentSession = () => {
  localStorage.removeItem('userbaseCurrentSession')
}

export default {
  signInSession,
  signOutSession,
  getCurrentSession,
  saveSeedString,
  removeSeedString,
  getSeedString,
  removeCurrentSession,
}
