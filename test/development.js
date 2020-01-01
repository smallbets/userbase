/* eslint-disable no-unused-vars */

const appId = 'test-id'
const endpoint = 'http://localhost:8080'

const wait = (ms) => new Promise(resolve => setTimeout(() => resolve(), ms))

const dbName = 'test-db'

const assert = (actual, expected, errorMsg) => console.assert(actual === expected, { actual, expected, errorMsg })

const completedTest = (testNum) => {
  console.log(`%cCompleted test ${testNum}!`, 'color: green; font-size: large')
  location.hash = '#test' + (testNum + 1)
  location.reload(true)
}
