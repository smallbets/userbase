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

const setSeedRequest = (username, seedRequestPublicKey, seedRequestPrivateKey) => {
  const seedRequest = seedRequestPublicKey + '|' + seedRequestPrivateKey
  localStorage.setItem(`userbaseSeedRequest.${username}`, seedRequest)
}

const getSeedRequest = (username) => {
  const seedRequest = localStorage.getItem(`userbaseSeedRequest.${username}`)
  if (!seedRequest) return null

  const seedRequestArray = seedRequest.split('|')
  const seedRequestPublicKey = seedRequestArray[0]
  const seedRequestPrivateKey = seedRequestArray[1]

  return { seedRequestPublicKey, seedRequestPrivateKey }
}

const removeSeedRequest = (username) => {
  return localStorage.removeItem(`userbaseSeedRequest.${username}`)
}

export default {
  signInSession,
  signOutSession,
  getCurrentSession,
  saveSeedString,
  removeSeedString,
  getSeedString,
  setSeedRequest,
  getSeedRequest,
  removeSeedRequest,
}
