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
