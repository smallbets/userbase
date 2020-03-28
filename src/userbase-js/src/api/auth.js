import config from '../config'

const TEN_SECONDS_MS = 10 * 1000

class RequestError extends Error {
  constructor(data, status, statusText, ...params) {
    super(data, status, statusText, ...params)

    this.response = {
      data,
      status,
      statusText,
    }

    this.message = 'Request failed with status code ' + status
  }
}

class TimeoutError extends Error {
  constructor(timeout, ...params) {
    super(timeout, ...params)

    this.message = `timeout of ${timeout}ms exceeded`
  }
}

const handleResponse = (xhr, resolve, reject) => {
  let response
  try {
    response = JSON.parse(xhr.response)
  } catch {
    response = xhr.response
  }

  if (xhr.status >= 200 && xhr.status < 300) {
    resolve(response)
  } else {
    reject(new RequestError(response, xhr.status, xhr.statusText))
  }
}

const signUp = (username, passwordToken, publicKey, passwordSalts, keySalts, email, profile, passwordBasedBackup) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const method = 'POST'
    const url = `${config.getEndpoint()}/api/auth/sign-up?appId=${config.getAppId()}`
    const data = JSON.stringify({
      username,
      passwordToken,
      publicKey,
      passwordSalts,
      keySalts,
      email,
      profile,
      passwordBasedBackup
    })
    const timeout = TEN_SECONDS_MS

    xhr.open(method, url)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.timeout = timeout
    xhr.send(data)

    xhr.onload = () => handleResponse(xhr, resolve, reject)
    xhr.ontimeout = () => reject(new TimeoutError(timeout))
  })
}

const getPasswordSalts = (username) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const method = 'GET'
    const url = `${config.getEndpoint()}/api/auth/get-password-salts?appId=${config.getAppId()}&username=${encodeURIComponent(username)}`
    const timeout = TEN_SECONDS_MS

    xhr.open(method, url)
    xhr.timeout = timeout
    xhr.send()

    xhr.onload = () => handleResponse(xhr, resolve, reject)
    xhr.ontimeout = () => reject(new TimeoutError(timeout))
  })
}

const signIn = async (username, passwordToken) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const method = 'POST'
    const url = `${config.getEndpoint()}/api/auth/sign-in?appId=${config.getAppId()}`
    const data = JSON.stringify({
      username,
      passwordToken,
    })
    const timeout = TEN_SECONDS_MS

    xhr.open(method, url)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.timeout = timeout
    xhr.send(data)

    xhr.onload = () => handleResponse(xhr, resolve, reject)
    xhr.ontimeout = () => reject(new TimeoutError(timeout))
  })
}

const signInWithSession = (sessionId) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const method = 'POST'
    const url = `${config.getEndpoint()}/api/auth/sign-in-with-session?appId=${config.getAppId()}&sessionId=${sessionId}`
    const timeout = TEN_SECONDS_MS

    xhr.open(method, url)
    xhr.timeout = timeout
    xhr.send()

    xhr.onload = () => handleResponse(xhr, resolve, reject)
    xhr.ontimeout = () => reject(new TimeoutError(timeout))
  })
}

const getServerPublicKey = async () => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    const method = 'GET'
    const url = `${config.getEndpoint()}/api/auth/server-public-key`
    const timeout = timeout
    const responseType = 'arraybuffer'

    xhr.open(method, url)
    xhr.timeout = timeout
    xhr.responseType = responseType
    xhr.send()

    xhr.onload = () => handleResponse(xhr, resolve, reject)
    xhr.ontimeout = () => reject(new TimeoutError(timeout))
  })
}

export default {
  signUp,
  getPasswordSalts,
  signIn,
  signInWithSession,
  getServerPublicKey,
}
