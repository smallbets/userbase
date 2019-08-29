import base64 from 'base64-arraybuffer'
import crypto from './Crypto'

const setCurrentSession = (username, signedIn) => {
  const session = { username, signedIn }
  const sessionString = JSON.stringify(session)
  localStorage.setItem('currentSession', sessionString)

  const keyString = localStorage.getItem('key.' + session.username)
  return { ...session, key: keyString }
}

const getCurrentSession = () => {
  const currentSessionString = localStorage.getItem('currentSession')
  const currentSession = JSON.parse(currentSessionString)

  if (!currentSession) return undefined

  const keyString = localStorage.getItem('key.' + currentSession.username)

  return { ...currentSession, key: keyString }
}

const saveKeyStringToLocalStorage = async (username, keyString) => {
  const rawKey = base64.decode(keyString)
  await crypto.aesGcm.getKeyFromRawKey(rawKey) // ensures key is valid, would throw if invalid

  localStorage.setItem('key.' + username, keyString)
}

const saveKeyToLocalStorage = async (username, key) => {
  const keyString = await crypto.aesGcm.getKeyStringFromKey(key)
  localStorage.setItem('key.' + username, keyString)
}

const getRawKeyByUsername = async (username) => {
  const keyString = localStorage.getItem('key.' + username)
  if (!keyString) {
    return undefined
  }
  const rawKey = base64.decode(keyString)
  return rawKey
}

const signOutSession = (session) => {
  const signedIn = false
  setCurrentSession(session.username, signedIn)
  return { username: session.username, signedIn }
}

const setTempRequestForMasterKey = (username, requesterPublicKey, tempKeyToRequestMasterKey) => {
  const request = requesterPublicKey + '|' + tempKeyToRequestMasterKey
  localStorage.setItem(`${username}.temp-request-for-master-key`, request)
}

const getTempRequestForMasterKey = (username) => {
  const request = localStorage.getItem(`${username}.temp-request-for-master-key`)
  if (!request) return request

  const requestForMasterKey = request.split('|')
  const requesterPublicKey = requestForMasterKey[0]
  const tempKeyToRequestMasterKey = requestForMasterKey[1]

  return { requesterPublicKey, tempKeyToRequestMasterKey }
}

const removeRequestForMasterKey = (username) => {
  return localStorage.removeItem(`${username}.temp-request-for-master-key`)
}

export default {
  setCurrentSession,
  getCurrentSession,
  getRawKeyByUsername,
  saveKeyStringToLocalStorage,
  saveKeyToLocalStorage,
  signOutSession,
  setTempRequestForMasterKey,
  getTempRequestForMasterKey,
  removeRequestForMasterKey,
}
