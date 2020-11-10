import userbase from 'userbase-js'
import initSqlJs from 'sql.js'
import LZString from 'lz-string'
import uuidv4 from 'uuid/v4'

const SQL_JS_DATABASE_PREFIX = '__userbase_sql_js_'

const SQL_WASM = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.3.0/dist/sql-wasm.wasm'
const SQL_WASM_HASH = 'sha256-554pjdF4JmRsLOxZd/GaluNXtEoxucq8385FZPKV9Bs='

const NUM_SQL_STATEMENTS_TRIGGER_BUNDLE = 100
const NUM_SQL_STATEMENTS_TO_STAGE_NEXT_DATABASE = NUM_SQL_STATEMENTS_TRIGGER_BUNDLE * .1

// STATE
let bundleTracker = {}
let currentDatabases = {}
let openDatabases = {}

class SqlJsDatabase {
  constructor(data, numSqlStatementsTriggerBundle = NUM_SQL_STATEMENTS_TRIGGER_BUNDLE) {
    this.db = new window.sqlJs.Database(data)
    this.appliedSqlStatementIndex = 0
    this.registeredSqlStatements = {}
    this.numSqlStatementsTriggerBundle = numSqlStatementsTriggerBundle
  }

  isFull() {
    return this.appliedSqlStatementIndex === this.numSqlStatementsTriggerBundle
  }

  registerUnverifiedSqlStatement(itemId) {
    const that = this
    return new Promise((resolve, reject) => {
      that.registeredSqlStatements[itemId] = {
        resolve,
        reject,
        timeout: setTimeout(() => {
          reject(new Error('timeout'))
          delete that.registeredSqlStatements[itemId]
        }, 30000)
      }
    })
  }

  verifyPromise(itemId, result) {
    const registeredSqlStatement = this.registeredSqlStatements[itemId]
    if (!registeredSqlStatement) return

    const { resolve, reject, timeout } = registeredSqlStatement

    if (result.success) {
      resolve()
    } else {
      reject(result.error)
    }

    clearTimeout(timeout)
    delete this.registeredSqlStatements[itemId]
  }
}

// https://developers.google.com/web/updates/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
const stringToArrayBuffer = (str) => {
  let buf = new ArrayBuffer(str.length)
  let bufView = new Uint8Array(buf)
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i)
  }
  return buf
}

// https://stackoverflow.com/a/20604561/11601853
const arrayBufferToString = (buf) => {
  const bufView = new Uint8Array(buf)
  const length = bufView.length
  let result = ''
  let chunkSize = 10 * 1024 // using chunks prevents stack from blowing up

  for (var i = 0; i < length; i += chunkSize) {
    if (i + chunkSize > length) {
      chunkSize = length - i
    }
    const chunk = bufView.subarray(i, i + chunkSize)
    result += String.fromCharCode.apply(null, chunk)
  }

  return result
}

const readBlobAsArrayBuffer = async (blob) => {
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

const _getNumSqlStatementsTriggerBundle = (databaseName) => {
  const splitDatabaseName = databaseName.split('_')
  return Number(splitDatabaseName[splitDatabaseName.length - 2])
}

const _getNextDatabaseName = (providedDatabaseName, currentDatabaseName) => {
  const indexOfSqlStatementSet = currentDatabaseName.lastIndexOf('_')
  const currentSqlStatementSet = Number(currentDatabaseName.substring(indexOfSqlStatementSet + 1))
  const nextSqlStatementSet = currentSqlStatementSet + 1
  return SQL_JS_DATABASE_PREFIX + providedDatabaseName + '_' + NUM_SQL_STATEMENTS_TRIGGER_BUNDLE + '_' + nextSqlStatementSet
}

const _getInitDatabaseName = (providedDatabaseName) => {
  return SQL_JS_DATABASE_PREFIX + providedDatabaseName + '_' + NUM_SQL_STATEMENTS_TRIGGER_BUNDLE + '_0'
}

const _openNextDatabase = async (sqlJsDb, providedDatabaseName, currentDatabaseName, allowWrites) => {
  if (allowWrites && !sqlJsDb.isFull()) {
    console.warn('Cannot allow writes to next database until current is full')
    return
  }

  const nextDatabaseName = _getNextDatabaseName(providedDatabaseName, currentDatabaseName)

  // a copy prevents the current database from using the incorrect database state to bundle
  const sqlJsDbCopy = openDatabases[nextDatabaseName] || new SqlJsDatabase(sqlJsDb.db.export())
  if (sqlJsDbCopy.opened) return

  // use the same copy of the sql.js db once writes are allowed since it won't change
  if (allowWrites) openDatabases[nextDatabaseName] = sqlJsDbCopy

  // no need to open again if already opened
  await userbase.openDatabase({
    databaseName: nextDatabaseName,
    changeHandler: allowWrites
      ? (items) => _sqlJsChangeHandler(items, sqlJsDbCopy, providedDatabaseName, nextDatabaseName)
      : () => { } // simply staging the next database
  })
}

const _bundleSqlJsDatabase = async (sqlJsDb, providedDatabaseName, currentDatabaseName) => {
  const database = sqlJsDb.db.export()
  const compressedDatabase = LZString.compressToUint8Array(arrayBufferToString(database))

  const bundleTrackerDatabaseName = SQL_JS_DATABASE_PREFIX + providedDatabaseName + '_bundle_tracker'

  let foundBundleItem, foundBundle
  for (let i = 0; i < bundleTracker[bundleTrackerDatabaseName].length && !foundBundleItem; i++) {
    // if item there with file already present, no need to bundle
    const bundle = bundleTracker[bundleTrackerDatabaseName][i]
    const bundledDatabaseName = bundle.itemId

    foundBundleItem = bundledDatabaseName === currentDatabaseName
    if (foundBundleItem) foundBundle = bundle.fileName
  }

  try {
    if (!foundBundleItem) {
      await userbase.insertItem({ databaseName: bundleTrackerDatabaseName, itemId: currentDatabaseName, item: 'BUNDLE' })
    }
  } catch (e) {
    if (e.name !== 'ItemAlreadyExists') return // swallow error
  }

  if (!foundBundle) {
    try {
      const fileName = 'bundle.txt'
      await userbase.uploadFile({
        databaseName: bundleTrackerDatabaseName,
        itemId: currentDatabaseName,
        file: new File([compressedDatabase], fileName)
      })
    } catch (e) {
      // for development purposes
      if (e.name !== 'FileUploadConflict') console.warn(`Failed to bundle sql.js database with `, e)
    }
  }
}

const _applySql = (db, sqlStatement) => {
  if (typeof sqlStatement !== 'object') return { error: 'Unknown Object' }

  try {
    db.run('PRAGMA query_only = false;')
    db.run('BEGIN TRANSACTION;')

    const sqlStatements = sqlStatement.sqlStatements || [{ ...sqlStatement }]

    for (let i = 0; i < sqlStatements.length; i++) {
      const { sql, bindValues } = sqlStatements[i]

      try {
        db.run(sql, bindValues)

        // for development purposes
        // console.log(sql, bindValues)
      } catch (e) {

        // for development purposes
        console.warn(`Failed to apply SQL statement:\n    ${sql}\n    ${JSON.stringify(bindValues)}\n\n`, e)

        throw e
      }
    }

    db.run('COMMIT;')
    return { success: true }
  } catch (e) {
    db.run('ROLLBACK;')

    return { error: e }
  } finally {
    db.run('PRAGMA query_only = true;')
  }
}

const _sqlJsChangeHandler = (items, sqlJsDb, providedDatabaseName, currentDatabaseName, firstOpen) => {
  // never re-apply SQL statement, or apply SQL statement >= numSqlStatementsInSet
  let i = sqlJsDb.appliedSqlStatementIndex
  let appliedSql

  for (; i < items.length && i < sqlJsDb.numSqlStatementsTriggerBundle; i++) {
    const item = items[i]
    const sqlStatement = item.item
    const result = _applySql(sqlJsDb.db, sqlStatement)
    sqlJsDb.verifyPromise(item.itemId, result)
    appliedSql = true
  }

  sqlJsDb.appliedSqlStatementIndex = i

  if (i <= sqlJsDb.numSqlStatementsTriggerBundle) {
    currentDatabases[providedDatabaseName] = { ...currentDatabases[providedDatabaseName], currentDatabaseName, sqlJsDb }

    // only call changeHandler if have not opened yet, or if applying new SQL statements
    if ((firstOpen && !sqlJsDb.opened) || appliedSql) {
      currentDatabases[providedDatabaseName].changeHandler({ db: new window.sqlJs.Database(sqlJsDb.db.export()) })
      sqlJsDb.opened = true
    }
  }

  // time to move to next database
  if (sqlJsDb.isFull()) {
    // don't wait for bundle to finish. it's just an optimization for next load
    _bundleSqlJsDatabase(sqlJsDb, providedDatabaseName, currentDatabaseName)
    _openNextDatabase(sqlJsDb, providedDatabaseName, currentDatabaseName, true)
  } else if (i > NUM_SQL_STATEMENTS_TO_STAGE_NEXT_DATABASE) {
    // stage the next database so that it's open and ready when it's time to move to next database, but don't allow writes yet
    _openNextDatabase(sqlJsDb, providedDatabaseName, currentDatabaseName, false)
  }

  // iterate over remaining SQL statements and throw DatabaseFull
  for (; i < items.length; i++) {
    sqlJsDb.verifyPromise(items[i].itemId, { error: 'DatabaseFull' })
  }
}

const _loadSqlJsDatabase = async (databaseName) => {
  const bundleTrackerDatabaseName = SQL_JS_DATABASE_PREFIX + databaseName + '_bundle_tracker'

  const changeHandler = (items) => {
    bundleTracker[bundleTrackerDatabaseName] = items
  }

  await userbase.openDatabase({ databaseName: bundleTrackerDatabaseName, changeHandler })
  const bundles = bundleTracker[bundleTrackerDatabaseName] || []

  // find the largest bundle by scanning bundles in reverse until find a bundle
  for (let i = bundles.length - 1; i >= 0; i--) {
    const bundle = bundles[i]
    const { itemId, fileId } = bundle

    if (fileId) {
      const compressedFile = (await userbase.getFile({ databaseName: bundleTrackerDatabaseName, fileId })).file
      const compressedDatabase = await readBlobAsArrayBuffer(compressedFile)
      const database = new Uint8Array(stringToArrayBuffer(LZString.decompressFromUint8Array(new Uint8Array(compressedDatabase))))
      const compressedDatabaseName = itemId
      const numSqlStatementsTriggerBundle = _getNumSqlStatementsTriggerBundle(compressedDatabaseName)

      return {
        sqlJsDb: new SqlJsDatabase(database, numSqlStatementsTriggerBundle),
        startingDatabaseName: _getNextDatabaseName(databaseName, compressedDatabaseName)
      }
    }
  }

  // didn't find bundle, just load empty sql.js database
  return {
    sqlJsDb: new SqlJsDatabase(),
    startingDatabaseName: _getInitDatabaseName(databaseName)
  }
}

const _loadSqlJs = async () => {
  const sqlWasmResponse = await fetch(SQL_WASM, { integrity: SQL_WASM_HASH })
  const sqlWasm = await sqlWasmResponse.blob()
  const sqlWasmFileUrl = URL.createObjectURL(sqlWasm)
  window.sqlJs = await initSqlJs({ locateFile: () => sqlWasmFileUrl })
}

const openSqlJsDatabase = async (params) => {
  // validate params, don't allow databaseId
  const { databaseName, changeHandler } = params

  // overwrite changeHandler and call overwritten changeHandler on open
  currentDatabases[databaseName] = { ...currentDatabases[databaseName], changeHandler }

  // enable idempotent calls to openSqlJsDatabase
  if (currentDatabases[databaseName].sqlJsDb && currentDatabases[databaseName].sqlJsDb.opened) {
    currentDatabases[databaseName].changeHandler({ db: new window.sqlJs.Database(currentDatabases[databaseName].sqlJsDb.db.export()) })
    return
  }

  if (!window.sqlJs) await _loadSqlJs()

  // load sql.js database from bundle if present
  const { sqlJsDb, startingDatabaseName } = await _loadSqlJsDatabase(databaseName)

  await userbase.openDatabase({
    databaseName: startingDatabaseName,
    changeHandler: (items) => _sqlJsChangeHandler(items, sqlJsDb, databaseName, startingDatabaseName, true)
  })
}

const _handleFullDatabase = async (sqlJsDb, params, currentDatabaseName) => {
  await _openNextDatabase(sqlJsDb, params.databaseName, currentDatabaseName, true)
  return execSql(params)
}

const execSql = async (params) => {
  const { sql, bindValues, sqlStatements } = params
  const currentDatabase = currentDatabases[params.databaseName]

  const { currentDatabaseName, sqlJsDb } = currentDatabase

  if (sqlJsDb.isFull()) return _handleFullDatabase(sqlJsDb, params, currentDatabaseName)

  const itemId = uuidv4()
  const registeredSqlStatement = sqlJsDb.registerUnverifiedSqlStatement(itemId)

  await userbase.insertItem({ databaseName: currentDatabaseName, itemId, item: { sql, bindValues, sqlStatements } })

  try {
    await registeredSqlStatement
  } catch (e) {
    if (e === 'DatabaseFull') return _handleFullDatabase(sqlJsDb, params, currentDatabaseName)
    else throw e
  }
}

const init = async (params) => {
  if (!window.sqlJs) _loadSqlJs()
  return userbase.init(params)
}

const signOut = () => {
  bundleTracker = {}
  currentDatabases = {}
  openDatabases = {}
  return userbase.signOut()
}

const openDatabase = (params) => {
  if (params && typeof params.databaseName === 'string' && params.databaseName.indexOf(SQL_JS_DATABASE_PREFIX) === 0) {
    throw 'Cannot open sql.js database with openDatabase'
  } else {
    return userbase.openDatabase(params)
  }
}

const shareDatabase = (params) => {
  if (params && typeof params.databaseName === 'string' && params.databaseName.indexOf(SQL_JS_DATABASE_PREFIX) === 0) {
    throw 'Cannot share sql.js database'
  } else {
    return userbase.shareDatabase(params)
  }
}

export default {
  ...userbase,
  init,
  signOut,
  openSqlJsDatabase,
  execSql,
  openDatabase,
  shareDatabase,
}
