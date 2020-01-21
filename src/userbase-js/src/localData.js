const _getSeedName = (appId, username) => `userbaseSeed.${appId}.${username}`

const setCurrentSession = (rememberMe, username, signedIn, sessionId, creationDate) => {
  const session = { username, signedIn, sessionId, creationDate }
  const sessionString = JSON.stringify(session)

  if (rememberMe) {
    localStorage.setItem('userbaseCurrentSession', sessionString)
  } else {
    sessionStorage.setItem('userbaseCurrentSession', sessionString)
  }
}

const getCurrentSession = () => {
  const sessionStorageCurrentSessionString = sessionStorage.getItem('userbaseCurrentSession')

  if (sessionStorageCurrentSessionString) return JSON.parse(sessionStorageCurrentSessionString)

  const currentSessionString = localStorage.getItem('userbaseCurrentSession')
  return currentSessionString && {
    ...JSON.parse(currentSessionString),
    rememberMe: true
  }
}

const saveSeedString = (rememberMe, appId, username, seedString) => {
  if (rememberMe) {
    localStorage.setItem(_getSeedName(appId, username), seedString)
  } else {
    sessionStorage.setItem(_getSeedName(appId, username), seedString)
  }
}

const removeSeedString = (appId, username) => {
  const seedName = _getSeedName(appId, username)
  sessionStorage.removeItem(seedName)
  localStorage.removeItem(seedName)
}

const getSeedString = (appId, username) => {
  const seedName = _getSeedName(appId, username)
  return sessionStorage.getItem(seedName) || localStorage.getItem(seedName)
}

const signInSession = (rememberMe, username, sessionId, creationDate) => {
  const signedIn = true
  setCurrentSession(rememberMe, username, signedIn, sessionId, creationDate)
}

const signOutSession = (rememberMe, username) => {
  const signedIn = false
  setCurrentSession(rememberMe, username, signedIn)
}

const removeCurrentSession = () => {
  sessionStorage.removeItem('userbaseCurrentSession')
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
