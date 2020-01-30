const tryCatchWrapper = (func) => (...args) => {
  try {
    return func(...args)
  } catch (e) {
    // ok to swallow error
    //
    // local/sessionStorage are non-critical benefits. If they happen to be available,
    // they're helpful, but if not, the SDK functions totally fine.
    //
    // If a function fails, behavior is functionally the same as if rememberMe is 'none'.
    console.warn('Error accessing browser storage. Defaulting to memory.\n\n', e)
  }
}

const _getSeedName = (appId, username) => `userbaseSeed.${appId}.${username}`

const setCurrentSession = tryCatchWrapper((rememberMe, username, signedIn, sessionId, creationDate) => {
  const session = { username, signedIn, sessionId, creationDate }
  const sessionString = JSON.stringify(session)

  if (rememberMe === 'local') {
    localStorage.setItem('userbaseCurrentSession', sessionString)
  } else if (rememberMe === 'session') {
    sessionStorage.setItem('userbaseCurrentSession', sessionString)
  }
})

const getCurrentSession = tryCatchWrapper(() => {
  const sessionStorageCurrentSessionString = sessionStorage.getItem('userbaseCurrentSession')

  if (sessionStorageCurrentSessionString) {
    const currentSession = JSON.parse(sessionStorageCurrentSessionString)

    if (!currentSession.signedIn) {
      const localCurrentSessionString = localStorage.getItem('userbaseCurrentSession')

      if (localCurrentSessionString) {
        const localCurrentSession = JSON.parse(localCurrentSessionString)

        // allows session from localStorage to override sessionStorage if signed in
        // to localStorage session and not signed in to sessionStorage session
        if (localCurrentSession.signedIn) {
          return {
            ...localCurrentSession,
            rememberMe: 'local'
          }
        }
      }
    }

    return {
      ...JSON.parse(sessionStorageCurrentSessionString),
      rememberMe: 'session'
    }
  }

  const localSessionString = localStorage.getItem('userbaseCurrentSession')
  return localSessionString && {
    ...JSON.parse(localSessionString),
    rememberMe: 'local'
  }
})

const saveSeedString = tryCatchWrapper((rememberMe, appId, username, seedString) => {
  if (rememberMe === 'local') {
    localStorage.setItem(_getSeedName(appId, username), seedString)
  } else if (rememberMe === 'session') {
    sessionStorage.setItem(_getSeedName(appId, username), seedString)
  }
})

const removeSeedString = tryCatchWrapper((appId, username) => {
  const seedName = _getSeedName(appId, username)
  sessionStorage.removeItem(seedName)
  localStorage.removeItem(seedName)
})

const getSeedString = tryCatchWrapper((appId, username) => {
  const seedName = _getSeedName(appId, username)
  return sessionStorage.getItem(seedName) || localStorage.getItem(seedName)
})

const signInSession = (rememberMe, username, sessionId, creationDate) => {
  const signedIn = true
  setCurrentSession(rememberMe, username, signedIn, sessionId, creationDate)
}

const signOutSession = (rememberMe, username) => {
  const signedIn = false
  setCurrentSession(rememberMe, username, signedIn)
}

const removeCurrentSession = tryCatchWrapper(() => {
  sessionStorage.removeItem('userbaseCurrentSession')
  localStorage.removeItem('userbaseCurrentSession')
})

export default {
  signInSession,
  signOutSession,
  getCurrentSession,
  saveSeedString,
  removeSeedString,
  getSeedString,
  removeCurrentSession,
}
