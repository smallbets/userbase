export const getSecondsSinceT0 = (t0) => {
  return `${((performance.now() - t0) / 1000).toFixed(2)}`
}

export const readArrayBufferAsString = (arrayBuffer) => {
  return new Promise(resolve => {
    let reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsText(new Blob([arrayBuffer]))
  })
}

const removeProtocolFromEndpoint = (endpoint) => {
  const http = 'http://'
  const https = 'https://'

  if (endpoint.substring(0, http.length) === http) {
    return endpoint.substring(http.length)
  } else if (endpoint.substring(0, https.length) === https) {
    return endpoint.substring(https.length)
  } else {
    return endpoint
  }
}

const getProtocolFromEndpoint = (endpoint) => {
  return endpoint.split(':')[0]
}

export const getWsUrl = (endpoint) => {
  const host = removeProtocolFromEndpoint(endpoint)
  const protocol = getProtocolFromEndpoint(endpoint)

  return ((protocol === 'https') ?
    'wss://' : 'ws://') + host
}

export const byteSizeOfString = (string) => {
  return string.length * 2
}

export const objectHasOwnProperty = (object, property) => {
  return Object.prototype.hasOwnProperty.call(object, property)
}

// source: http://code.iamkate.com/javascript/queues
export function Queue() {
  let queue = []
  let offset = 0

  this.getLength = () => queue.length - offset

  this.isEmpty = () => queue.length === 0

  this.enqueue = (item) => {
    queue.push(item)
    return this.getLength()
  }

  this.dequeue = () => {
    // get item from front of the queue
    const item = queue[offset]

    offset += 1

    // garbage collect unused space in queue when it grows large
    if (offset * 2 > queue.length) {
      queue = queue.slice(offset)
      offset = 0
    }

    return item
  }

  this.peek = () => queue[offset]
}
