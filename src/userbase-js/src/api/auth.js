import config from '../config'
import { processXhr } from './utils'

const signUp = (username, passwordToken, ecKeyData, passwordSalts, keySalts, email, profile, passwordBasedBackup, sessionLength) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const method = 'POST'
    const url = `${config.getEndpoint()}/api/auth/sign-up?appId=${config.getAppId()}&userbaseJsVersion=${config.USERBASE_JS_VERSION}`
    const data = JSON.stringify({
      username,
      passwordToken,
      ecKeyData,
      passwordSalts,
      keySalts,
      email,
      profile,
      passwordBasedBackup,
      sessionLength,
    })

    xhr.open(method, url)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.send(data)

    processXhr(xhr, resolve, reject)
  })
}

const getPasswordSalts = (username) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const method = 'GET'
    const url = `${config.getEndpoint()}/api/auth/get-password-salts?appId=${config.getAppId()}&username=${encodeURIComponent(username)}&userbaseJsVersion=${config.USERBASE_JS_VERSION}`

    xhr.open(method, url)
    xhr.send()

    processXhr(xhr, resolve, reject)
  })
}

const signIn = async (username, passwordToken, sessionLength) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const method = 'POST'
    const url = `${config.getEndpoint()}/api/auth/sign-in?appId=${config.getAppId()}&userbaseJsVersion=${config.USERBASE_JS_VERSION}`
    const data = JSON.stringify({
      username,
      passwordToken,
      sessionLength,
    })

    xhr.open(method, url)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.send(data)

    processXhr(xhr, resolve, reject)
  })
}

const signInWithSession = (sessionId, sessionLength) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const method = 'POST'
    const url = `${config.getEndpoint()}/api/auth/sign-in-with-session?appId=${config.getAppId()}&sessionId=${sessionId}&userbaseJsVersion=${config.USERBASE_JS_VERSION}`
    const data = JSON.stringify({
      sessionLength,
    })

    xhr.open(method, url)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.send(data)

    processXhr(xhr, resolve, reject)
  })
}

const getServerPublicKey = async () => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const method = 'GET'
    const url = `${config.getEndpoint()}/api/auth/server-public-key?&userbaseJsVersion=${config.USERBASE_JS_VERSION}`
    const responseType = 'arraybuffer'

    xhr.open(method, url)
    xhr.responseType = responseType
    xhr.send()

    processXhr(xhr, resolve, reject)
  })
}

const getPublicKey = (username) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const method = 'GET'
    const url = `${config.getEndpoint()}/api/public-key?appId=${config.getAppId()}&username=${encodeURIComponent(username)}&userbaseJsVersion=${config.USERBASE_JS_VERSION}`

    xhr.open(method, url)
    xhr.send()

    processXhr(xhr, resolve, reject)
  })
}

const uploadBundleChunk = async (chunk, token) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const method = 'POST'
    const url = `${config.getEndpoint()}/api/bundle-chunk?userbaseJsVersion=${config.USERBASE_JS_VERSION}`

    xhr.setRequestHeader('Authorization', 'Bearer ' + token)

    xhr.open(method, url)
    xhr.send(chunk)

    processXhr(xhr, resolve, reject)
  })
}

export default {
  signUp,
  getPasswordSalts,
  signIn,
  signInWithSession,
  getServerPublicKey,
  getPublicKey,
  uploadBundleChunk,
}
