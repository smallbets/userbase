import base64 from 'base64-arraybuffer'
import crypto from './Crypto'

const setCurrentSession = (username, signedIn) => {
  const session = { username, signedIn }
  const sessionString = JSON.stringify(session)
  localStorage.setItem('currentSession', sessionString)

  const seedString = localStorage.getItem('seed.' + session.username)
  return { ...session, seed: seedString }
}

const getCurrentSession = () => {
  const currentSessionString = localStorage.getItem('currentSession')
  const currentSession = JSON.parse(currentSessionString)

  if (!currentSession) return undefined

  const seedString = localStorage.getItem('seed.' + currentSession.username)
  return { ...currentSession, seed: seedString }
}

const saveSeedStringToLocalStorage = async (username, seedString) => {
  const seed = base64.decode(seedString)
  await crypto.hkdf.importMasterKey(seed) // ensures seed is valid, would throw if invalid

  localStorage.setItem('seed.' + username, seedString)
}

const saveSeedToLocalStorage = async (username, seed) => {
  const seedString = base64.encode(seed)
  localStorage.setItem('seed.' + username, seedString)
}

const signInSession = (username) => {
  const signedIn = true
  return setCurrentSession(username, signedIn)
}

const signOutSession = (username) => {
  const signedIn = false
  setCurrentSession(username, signedIn)
  return { username, signedIn }
}

const setTempRequestForSeed = (username, requesterPublicKey, tempKeyToRequestSeed) => {
  const request = requesterPublicKey + '|' + tempKeyToRequestSeed
  localStorage.setItem(`${username}.temp-request-for-seed`, request)
}

const getTempRequestForSeed = (username) => {
  const request = localStorage.getItem(`${username}.temp-request-for-seed`)
  if (!request) return request

  const requestForSeed = request.split('|')
  const requesterPublicKey = requestForSeed[0]
  const tempKeyToRequestSeed = requestForSeed[1]

  return { requesterPublicKey, tempKeyToRequestSeed }
}

const removeRequestForSeed = (username) => {
  return localStorage.removeItem(`${username}.temp-request-for-seed`)
}

export default {
  signInSession,
  signOutSession,
  getCurrentSession,
  saveSeedStringToLocalStorage,
  saveSeedToLocalStorage,
  setTempRequestForSeed,
  getTempRequestForSeed,
  removeRequestForSeed,
}
