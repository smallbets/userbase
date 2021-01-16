import errors from '../errors'

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

export const processXhr = (xhr, resolve, reject, timeout = TEN_SECONDS_MS) => {
  xhr.timeout = timeout
  xhr.onload = () => handleResponse(xhr, resolve, reject)
  xhr.onerror = () => reject(new errors.ServiceUnavailable)
  xhr.ontimeout = () => reject(new TimeoutError(timeout))
}
