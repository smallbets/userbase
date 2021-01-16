export const getRandomString = () => Math.random().toString().substring(2)

const BYTES_IN_STRING = 2

export const getStringOfByteLength = (byteLength) => 'a'.repeat(byteLength / BYTES_IN_STRING)

export const getRandomStringOfByteLength = (byteLength) => {
  const numRandomStrings = byteLength / (getRandomString().length * BYTES_IN_STRING)
  let string = ''
  for (let i = 0; i < numRandomStrings; i++) {
    string += getRandomString()
  }
  return string
}

export const getOperationsThatTriggerBundle = () => {
  const ITEM_SIZE = 5 * 1024
  const MAX_TRANSACTIONS = 10

  const operations = []
  for (let i = 0; i < MAX_TRANSACTIONS; i++) {
    operations.push({ command: 'Insert', item: getRandomStringOfByteLength(ITEM_SIZE), itemId: i.toString() })
  }
  return operations
}

export const wait = (ms) => new Promise(resolve => {
  setTimeout(() => resolve(), ms)
})

export const readBlobAsText = async (blob) => {
  const reader = new FileReader()

  return new Promise((resolve, reject) => {
    reader.onload = (e) => {
      if (!e.target.error) {
        resolve(e.target.result)
      } else {
        reject(e.target.error)
      }
    }

    reader.readAsText(blob)
  })
}

export const readBlobAsArrayBuffer = async (blob) => {
  const reader = new FileReader()

  return new Promise((resolve, reject) => {
    reader.onload = (e) => {
      if (!e.target.error) {
        resolve(e.target.result)
      } else {
        reject(e.target.error)
      }
    }

    reader.readAsArrayBuffer(blob)
  })
}

// constructs the next page token same way the server does
export const constructNextPageToken = (object) => {
  const lastEvaluatedKeyString = JSON.stringify(object)
  const nextPageToken = Buffer.from(lastEvaluatedKeyString).toString('base64')
  return nextPageToken
}
