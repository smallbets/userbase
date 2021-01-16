/* eslint-disable no-unused-vars */

const appId = 'test-id'
const endpoint = 'http://localhost:8080/v1'

const wait = (ms) => new Promise(resolve => setTimeout(() => resolve(), ms))

const databaseName = 'test-db'

const rememberMe = 'none'

const assert = (actual, expected, errorMsg) => console.assert(actual === expected, { actual, expected, errorMsg })

const completedTest = (testNum, userbase) => {
  console.log(`%cCompleted test ${testNum}!`, 'color: green; font-size: large')
  location.hash = 'test' + (testNum + 1)
  userbase.deleteUser()
    .catch(() => { }) // swallow error - best effort
    .finally(() => location.reload(true))
}

const CONCURRENCY = 150

const getOperationsThatTriggerBundle = () => {
  const ITEM_SIZE = 5 * 1024 // can be anything so long as BUNDLE_SIZE / ITEM_SIZE < 10
  const MAX_TRANSACTIONS = 10

  const operations = []
  for (let i = 0; i < MAX_TRANSACTIONS; i++) {
    operations.push({ command: 'Insert', item: getRandomStringOfByteLength(ITEM_SIZE), itemId: i.toString() })
  }
  return operations
}

const getRandomString = () => Math.random().toString().substring(2)

const BYTES_IN_STRING = 2
const getRandomStringOfByteLength = (byteLength) => {
  const numRandomStrings = byteLength / (getRandomString().length * BYTES_IN_STRING)
  let string = ''
  for (let i = 0; i < numRandomStrings; i++) {
    string += getRandomString()
  }
  return string
}
