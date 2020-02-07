export const getRandomString = () => Math.random().toString().substring(2)

export const getStringOfByteLength = (byteLength) => {
  const BYTES_IN_STRING = 2
  return 'a'.repeat(byteLength / BYTES_IN_STRING)
}

export const wait = (ms) => new Promise(resolve => {
  setTimeout(() => resolve(), ms)
})
