import uuidv4 from 'uuid/v4'

const SECONDS_ALLOWED_TO_KEEP_LOCK = 300

function Lock() {
  this.locks = {}
}

Lock.prototype.callerOwnsLock = function (userId, lockId) {
  const lock = this.locks[userId]
  return lock && lock.lockId === lockId
}

Lock.prototype.releaseLock = function (userId, lockId) {
  if (!this.callerOwnsLock(userId, lockId)) return false
  this.locks[userId] = null
  return true
}

Lock.prototype.acquireLock = function (userId) {
  const lock = this.locks[userId]
  if (lock) {
    const timeSinceLockWasAcquired = process.hrtime(lock.timeAcquired)
    const secondsSinceLockWasAcquired = timeSinceLockWasAcquired[0]

    if (secondsSinceLockWasAcquired < SECONDS_ALLOWED_TO_KEEP_LOCK) {
      return false
    } else {
      // if this warning appears in the logs often, consider raising SECONDS_ALLOWED_TO_KEEP_BUNDLE_LOCK
      console.warn(`User ${userId} has been holding lock ${lock.lockId} for ${secondsSinceLockWasAcquired}`)
    }
  }

  const newLock = {
    timeAcquired: process.hrtime(),
    lockId: uuidv4()
  }

  this.locks[userId] = newLock
  return newLock
}

export default new Lock()
