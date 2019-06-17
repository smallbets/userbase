import encd from '../client/encrypted-dev-sdk'

const USERNAME_1K = 'test-1k'
// const USERNAME_10K = 'test-10k'
// const USERNAME_100K = 'test-100k'

const PASSWORD = 'Test1234'
const BATCH_SIZE = 6 // max TCP sockets chrome allows: https://developers.google.com/web/tools/chrome-devtools/network/reference#timing-explanation

const insert = async (i) => {
  try {
    const result = await encd.db.insert({ todo: i })
    return result
  } catch (e) {
    console.log(`Failed insertion ${i} with`, e)
  }
}

const update = async (oldItem) => {
  try {
    await encd.db.update(oldItem, { todo: oldItem.record.todo, completed: true })
  } catch (e) {
    console.log(`Failed update on item ${oldItem && oldItem['sequence-no']} with`, e)
  }
}

const deleteFunction = async (oldItem) => {
  try {
    await encd.db.delete(oldItem)
  } catch (e) {
    console.log(`Failed update on item ${oldItem['sequence-no']} with`, e)
  }
}

const init = async (username, limit) => {
  await encd.signUp(username, PASSWORD)

  let items = []
  let insertionPromises = []
  for (let i = 1; i <= limit; i++) {
    insertionPromises.push(insert(i))

    if (i % BATCH_SIZE === 0) {
      console.log(`Inserting todos ${i - BATCH_SIZE + 1} through ${i}`)
      const itemResponses = await Promise.all(insertionPromises)
      items = items.concat(itemResponses)
      insertionPromises = []
    }
  }

  const ninetyNinePercentOfLimit = limit * .99
  let updatePromises = []
  for (let i = 1; i <= ninetyNinePercentOfLimit; i++) {
    items[i] && updatePromises.push(update(items[i]))

    if (i % BATCH_SIZE === 0) {
      console.log(`Marking todos ${i - BATCH_SIZE + 1} through ${i} complete`)
      await Promise.all(updatePromises)
      updatePromises = []
    }
  }

  const fiftyPercentOfLimit = limit * .5
  let deletePromises = []
  for (let i = 1; i <= fiftyPercentOfLimit; i++) {
    items[i] && deletePromises.push(deleteFunction(items[i]))

    if (i % BATCH_SIZE === 0) {
      console.log(`Deleting todos ${i - BATCH_SIZE + 1} through ${i} complete`)
      await Promise.all(deletePromises)
      deletePromises = []
    }
  }

  const key = localStorage.getItem('key')
  console.log(`To test user ${username}, input this into the console:
  localStorage.setItem('key', '${key}'), then sign in with password ${PASSWORD}.`)
}

init(USERNAME_1K, 1000)
// init(USERNAME_10K, 10000)
// init(USERNAME_100K, 100000)
