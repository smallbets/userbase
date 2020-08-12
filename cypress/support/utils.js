export const getRandomString = () => Math.random().toString().substring(2)

export const getStringOfByteLength = (byteLength) => {
  const BYTES_IN_STRING = 2
  return 'a'.repeat(byteLength / BYTES_IN_STRING)
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
