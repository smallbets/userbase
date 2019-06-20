import encd from '../client/encrypted-dev-sdk'

const USERNAME_1K = 'test-1k'
// const USERNAME_10K = 'test-10k'
// const USERNAME_100K = 'test-100k'

const PASSWORD = 'Test1234'

const MAX_TCP_CONNECTIONS = 6 // max TCP sockets chrome allows: https://developers.google.com/web/tools/chrome-devtools/network/reference#timing-explanation
const INSERTION_BATCH_SIZE = 25 // max size for DynamoDB

const wrapInTryCatch = async (promise) => {
  try {
    const result = await promise()
    return result
  } catch (e) {
    console.log(e)
  }
}

const init = async (username, limit) => {
  await encd.signUp(username, PASSWORD)

  // INSERT
  let insertionBatch = []
  let batchOfInsertionBatches = []
  for (let i = 0; i < limit; i++) {
    insertionBatch.push({ todo: i })

    if (insertionBatch.length === INSERTION_BATCH_SIZE || i === limit - 1) {
      batchOfInsertionBatches.push(insertionBatch)
      insertionBatch = []
    }

    if (batchOfInsertionBatches.length === MAX_TCP_CONNECTIONS || i === limit - 1) {
      const numInsertionsInBatch = batchOfInsertionBatches
        .map(batch => batch.length)
        .reduce((sum, len) => sum + len)
      console.log(`Inserting todos ${i - numInsertionsInBatch + 1} through ${i}...`)

      const promises = batchOfInsertionBatches.map(batch => wrapInTryCatch(() => encd.db.batchInsert(batch)))
      await Promise.all(promises)
      batchOfInsertionBatches = []
    }
  }

  let items = encd.db.getLatestState()

  // UPDATE
  const ninetyNinePercentOfLimit = Math.floor(limit * .99)
  let updateBatch = {
    oldItems: [],
    newItems: []
  }
  let batchOfUpdateBatches = []
  for (let i = 0; i < ninetyNinePercentOfLimit; i++) {
    updateBatch.oldItems.push(items[i])
    updateBatch.newItems.push({ todo: items[i].record.todo, completed: true })

    if (updateBatch.oldItems.length === INSERTION_BATCH_SIZE || i === ninetyNinePercentOfLimit - 1) {
      batchOfUpdateBatches.push(updateBatch)
      updateBatch = {
        oldItems: [],
        newItems: []
      }
    }

    if (batchOfUpdateBatches.length === MAX_TCP_CONNECTIONS || i === ninetyNinePercentOfLimit - 1) {
      const numUpdatesInBatch = batchOfUpdateBatches
        .map(batch => batch.oldItems.length)
        .reduce((sum, len) => sum + len)
      console.log(`Marking todos ${i - numUpdatesInBatch + 1} through ${i} complete...`)

      const promises = batchOfUpdateBatches.map(batch => wrapInTryCatch(() => encd.db.batchUpdate(batch.oldItems, batch.newItems)))
      await Promise.all(promises)
      batchOfUpdateBatches = []
    }
  }

  items = encd.db.getLatestState()

  // DELETE
  const fiftyPercentOfLimit = Math.floor(limit * .5)
  let deleteBatch = []
  let batchOfDeleteBatches = []
  for (let i = 0; i < fiftyPercentOfLimit; i++) {
    deleteBatch.push(items[i])

    if (deleteBatch.length === INSERTION_BATCH_SIZE || i === fiftyPercentOfLimit - 1) {
      batchOfDeleteBatches.push(deleteBatch)
      deleteBatch = []
    }

    if (batchOfDeleteBatches.length === MAX_TCP_CONNECTIONS || i === fiftyPercentOfLimit - 1) {
      const numUpdatesInBatch = batchOfDeleteBatches
        .map(batch => batch.length)
        .reduce((sum, len) => sum + len)
      console.log(`Deleting todos ${i - numUpdatesInBatch + 1} through ${i}...`)

      const promises = batchOfDeleteBatches.map(batch => wrapInTryCatch(() => encd.db.batchDelete(batch)))
      await Promise.all(promises)
      batchOfDeleteBatches = []
    }
  }

  const key = localStorage.getItem('key')
  console.log(`To test user ${username}, input this into the console:
  localStorage.setItem('key', '${key}'), then sign in with password ${PASSWORD}.`)
}

init(USERNAME_1K, 1000)
// init(USERNAME_10K, 10000)
// init(USERNAME_100K, 100000)
