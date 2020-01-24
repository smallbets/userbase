import uuidv4 from 'uuid/v4'
import connection from './connection'
import setup from './setup'
import statusCodes from './statusCodes'
import responseBuilder from './responseBuilder'
import crypto from './crypto'
import logger from './logger'
import { validateEmail } from './utils'
import appController from './app'
import adminController from './admin'

// source: https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Session_Management_Cheat_Sheet.md#session-id-length
const ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID = 16

const VALIDATION_MESSAGE_LENGTH = 16

const HOURS_IN_A_DAY = 24
const SECONDS_IN_A_DAY = 60 * 60 * HOURS_IN_A_DAY
const MS_IN_A_DAY = 1000 * SECONDS_IN_A_DAY
const SESSION_LENGTH = MS_IN_A_DAY

const MAX_USERNAME_CHAR_LENGTH = 100

const MAX_PROFILE_OBJECT_KEY_CHAR_LENGTH = 20
const MAX_PROFILE_OBJECT_VALUE_CHAR_LENGTH = 1000
const MAX_PROFILE_OBJECT_KEYS = 100

const LIMIT_NUM_TRIAL_USERS = 3

const MAX_INCORRECT_PASSWORD_GUESSES = 25

const createSession = async function (userId, appId) {
  const sessionId = crypto
    .randomBytes(ACCEPTABLE_RANDOM_BYTES_FOR_SAFE_SESSION_ID)
    .toString('hex')

  const creationDate = new Date().toISOString()
  const session = {
    'session-id': sessionId,
    'user-id': userId,
    'app-id': appId,
    'creation-date': creationDate
  }

  const params = {
    TableName: setup.sessionsTableName,
    Item: session
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.put(params).promise()

  return { sessionId, creationDate }
}

const _buildSignUpParams = (username, passwordToken, appId, userId,
  publicKey, passwordSalts, keySalts, email, profile, passwordBasedBackup) => {

  const {
    passwordSalt,
    passwordTokenSalt
  } = passwordSalts

  const {
    encryptionKeySalt,
    dhKeySalt,
    hmacKeySalt
  } = keySalts

  const { passwordBasedEncryptionKeySalt, passwordEncryptedSeed } = passwordBasedBackup

  const user = {
    username: username.toLowerCase(),
    'password-token': crypto.sha256.hash(passwordToken),
    'password-salt': passwordSalt,
    'password-token-salt': passwordTokenSalt,
    'app-id': appId,
    'user-id': userId,
    'public-key': publicKey,
    'encryption-key-salt': encryptionKeySalt,
    'diffie-hellman-key-salt': dhKeySalt,
    'hmac-key-salt': hmacKeySalt,
    'seed-not-saved-yet': true,
    'creation-date': new Date().toISOString(),
    email: email ? email.toLowerCase() : undefined,
    profile: profile || undefined,
    'password-based-encryption-key-salt': passwordBasedEncryptionKeySalt,
    'password-encrypted-seed': passwordEncryptedSeed
  }

  return {
    TableName: setup.usersTableName,
    Item: user,
    // if username does not exist, insert
    // if it already exists and user hasn't saved seed yet, overwrite (to allow another sign up attempt)
    // if it already exists and user has saved seed, fail with ConditionalCheckFailedException
    ConditionExpression: 'attribute_not_exists(username) or attribute_exists(#seedNotSavedYet)',
    ExpressionAttributeNames: {
      '#seedNotSavedYet': 'seed-not-saved-yet'
    }
  }
}

const _allowUserToRetryPassword = async (user) => {
  const params = {
    TableName: setup.usersTableName,
    Key: {
      'username': user['username'],
      'app-id': user['app-id']
    },
    UpdateExpression: 'REMOVE #suspendedAt SET #incorrectAttempts = :incorrectAttempts',
    ExpressionAttributeNames: {
      '#suspendedAt': 'suspended-at',
      '#incorrectAttempts': 'incorrect-password-attempts-in-a-row'
    },
    ExpressionAttributeValues: {
      ':incorrectAttempts': 0
    }
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.update(params).promise()
}

const _suspendUser = async (user) => {
  const params = {
    TableName: setup.usersTableName,
    Key: {
      'username': user['username'],
      'app-id': user['app-id']
    },
    UpdateExpression: 'SET #suspendedAt = :suspendedAt',
    ExpressionAttributeNames: {
      '#suspendedAt': 'suspended-at'
    },
    ExpressionAttributeValues: {
      ':suspendedAt': new Date().toISOString()
    }
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.update(params).promise()
}

const _incrementIncorrectPasswordAttempt = async (user) => {
  const incrementParams = {
    TableName: setup.usersTableName,
    Key: {
      'username': user['username'],
      'app-id': user['app-id']
    },
    UpdateExpression: 'add #incorrectAttempts :num',
    ExpressionAttributeNames: {
      '#incorrectAttempts': 'incorrect-password-attempts-in-a-row'
    },
    ExpressionAttributeValues: {
      ':num': 1
    }
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.update(incrementParams).promise()
}

const _validatePassword = (passwordToken, user, req) => {
  if (!user || user['deleted']) throw new Error('User does not exist')

  if (user['incorrect-password-attempts-in-a-row'] >= MAX_INCORRECT_PASSWORD_GUESSES) {

    const dateSuspended = user['suspended-at']
    if (!dateSuspended) {
      _suspendUser(user)

      logger
        .child({ userId: user['user-id'], reqId: req && req.id })
        .warn('Someone has exceeded the password attempt limit')
    }

    if (!dateSuspended || new Date() - new Date(dateSuspended) < MS_IN_A_DAY) {
      throw {
        error: 'PasswordAttemptLimitExceeded',
        delay: '24 hours'
      }
    } else {
      _allowUserToRetryPassword(user)
    }
  }

  const passwordTokenHash = crypto.sha256.hash(passwordToken)
  const passwordIsCorrect = passwordTokenHash.equals(user['password-token'])

  if (passwordIsCorrect && user['incorrect-password-attempts-in-a-row']) {
    _allowUserToRetryPassword(user)
  } else if (!passwordIsCorrect) {
    _incrementIncorrectPasswordAttempt(user)
    throw new Error('Incorrect password')
  }
}

const _validateProfile = (profile) => {
  if (typeof profile !== 'object') throw { error: 'ProfileMustBeObject' }

  let counter = 0
  for (const key in profile) {
    if (typeof key !== 'string') throw { error: 'ProfileKeyMustBeString', key }
    if (key.length > MAX_PROFILE_OBJECT_KEY_CHAR_LENGTH) {
      throw { error: 'ProfileKeyTooLong', key, maxLen: MAX_PROFILE_OBJECT_KEY_CHAR_LENGTH }
    }

    const value = profile[key]
    if (value) {
      if (typeof value !== 'string') throw { error: 'ProfileValueMustBeString', key, value }
      if (value.length > MAX_PROFILE_OBJECT_VALUE_CHAR_LENGTH) {
        throw { error: 'ProfileValueTooLong', key, value, maxLen: MAX_PROFILE_OBJECT_VALUE_CHAR_LENGTH }
      }
    }

    counter += 1
    if (counter > MAX_PROFILE_OBJECT_KEYS) {
      throw { error: 'ProfileHasTooManyKeys', maxKeys: MAX_PROFILE_OBJECT_KEYS }
    }
  }

  if (!counter) throw { error: 'ProfileCannotBeEmpty' }
}

const _validateUsernameInput = (username) => {
  if (typeof username !== 'string') throw {
    error: 'UsernameMustBeString'
  }

  if (username.length > MAX_USERNAME_CHAR_LENGTH) throw {
    error: 'UsernameTooLong',
    maxLen: MAX_USERNAME_CHAR_LENGTH
  }
}

exports.signUp = async function (req, res) {
  const appId = req.query.appId

  const username = req.body.username
  const passwordToken = req.body.passwordToken

  const publicKey = req.body.publicKey

  const passwordSalts = req.body.passwordSalts
  const keySalts = req.body.keySalts

  const email = req.body.email
  const profile = req.body.profile
  const passwordBasedBackup = req.body.passwordBasedBackup

  if (!appId || !username || !passwordToken || !publicKey || !passwordSalts || !keySalts || !passwordBasedBackup) {
    return res.status(statusCodes['Bad Request']).send('Missing required items')
  }

  const {
    passwordSalt,
    passwordTokenSalt
  } = passwordSalts

  const {
    encryptionKeySalt,
    dhKeySalt,
    hmacKeySalt
  } = keySalts

  if (!passwordSalt || !passwordTokenSalt || !encryptionKeySalt || !dhKeySalt || !hmacKeySalt) {
    return res.status(statusCodes['Bad Request']).send('Missing required salts')
  }

  const { passwordBasedEncryptionKeySalt, passwordEncryptedSeed } = passwordBasedBackup

  if (!passwordBasedEncryptionKeySalt || !passwordEncryptedSeed) {
    return res.status(statusCodes['Bad Request']).send('Missing password-based backup items')
  }

  try {
    _validateUsernameInput(username)

    if (email && !validateEmail(email)) return res.status(statusCodes['Bad Request'])
      .send({ error: 'EmailNotValid' })

    if (profile) _validateProfile(profile)
  } catch (e) {
    return res.status(statusCodes['Bad Request']).send(e)
  }

  try {
    const userId = uuidv4()

    // Warning: uses secondary index here. It's possible index won't be up to date and this fails
    const app = await appController.getAppByAppId(appId)
    if (!app || app['deleted']) return res.status(statusCodes['Unauthorized']).send('App ID not valid')

    const admin = await adminController.findAdminByAdminId(app['admin-id'])
    if (!admin || admin['deleted']) return res.status(statusCodes['Unauthorized']).send('App ID not valid')

    const subscription = await adminController.getSaasSubscription(admin['admin-id'], admin['stripe-customer-id'])
    const unpaidSubscription = !subscription || subscription.cancel_at_period_end || subscription.status !== 'active'
    if (unpaidSubscription && app['num-users'] >= LIMIT_NUM_TRIAL_USERS) {
      return res.status(statusCodes['Payment Required']).send('TrialExceededLimit')
    }

    const params = _buildSignUpParams(username, passwordToken, appId, userId,
      publicKey, passwordSalts, keySalts, email, profile, passwordBasedBackup)

    try {
      const ddbClient = connection.ddbClient()
      await ddbClient.put(params).promise()
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') {
        return res.status(statusCodes['Conflict']).send('UsernameAlreadyExists')
      }
      throw e
    }

    // best effort increment, no need to wait for response
    appController.incrementNumAppUsers(admin['admin-id'], app['app-name'], appId)

    const session = await createSession(userId, appId)
    return res.send(session)
  } catch (e) {
    logger.warn(`Failed to sign up user '${username}' of app '${appId}' with ${e}`)
    return res.status(statusCodes['Internal Server Error']).end()
  }
}

exports.authenticateUser = async function (req, res, next) {
  const sessionId = req.query.sessionId
  const appId = req.query.appId

  if (!sessionId || !appId) return res
    .status(statusCodes['Unauthorized'])
    .send('Missing session token or app id')

  const params = {
    TableName: setup.sessionsTableName,
    Key: {
      'session-id': sessionId
    }
  }

  try {
    const ddbClient = connection.ddbClient()
    const sessionResponse = await ddbClient.get(params).promise()

    const session = sessionResponse.Item

    const doesNotExist = !session
    const invalidated = doesNotExist || session.invalidated

    const sessionStartDate = invalidated || new Date(session['extended-date'] || session['creation-date'])
    const expired = invalidated || new Date() - sessionStartDate > SESSION_LENGTH

    const isNotUserSession = expired || !session['user-id']

    if (doesNotExist || invalidated || expired || isNotUserSession) return res
      .status(statusCodes['Unauthorized']).send('Session invalid')

    const appDoesNotMatch = isNotUserSession || session['app-id'] !== appId
    if (appDoesNotMatch) return res
      .status(statusCodes['Unauthorized']).send('App ID not valid')

    // Warning: uses secondary indexes here. It's possible index won't be up to date and this fails
    const [user, app] = await Promise.all([
      getUserByUserId(session['user-id']),
      appController.getAppByAppId(session['app-id'])
    ])

    if (!user || user['deleted']) return res.status(statusCodes['Unauthorized']).send('Session invalid')
    if (!app || app['deleted']) return res.status(statusCodes['Unauthorized']).send('App ID not valid')

    const admin = await adminController.findAdminByAdminId(app['admin-id'])
    if (!admin || admin['deleted']) return res.status(statusCodes['Unauthorized']).send('App ID not valid')

    // makes all the following objects available in next route
    res.locals.user = user
    res.locals.admin = admin
    res.locals.app = app
    next()
  } catch (e) {
    logger.error(`Failed to authenticate user session ${sessionId} with ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to authenticate user')
  }
}

exports.getValidationMessage = (publicKey) => {
  const validationMessage = crypto.randomBytes(VALIDATION_MESSAGE_LENGTH)

  const publicKeyArrayBuffer = Buffer.from(publicKey, 'base64')
  const sharedSecret = crypto.diffieHellman.computeSecret(publicKeyArrayBuffer)
  const sharedKey = crypto.sha256.hash(sharedSecret)
  const encryptedValidationMessage = crypto.aesGcm.encrypt(sharedKey, validationMessage)

  return {
    validationMessage,
    encryptedValidationMessage
  }
}

const userSavedSeed = async function (userId, appId, username, publicKey) {
  const updateUserParams = {
    TableName: setup.usersTableName,
    Key: {
      'username': username,
      'app-id': appId
    },
    UpdateExpression: 'remove #seedNotSavedYet',
    ConditionExpression: 'attribute_exists(#seedNotSavedYet) and #userId = :userId and #publicKey = :publicKey',
    ExpressionAttributeNames: {
      '#seedNotSavedYet': 'seed-not-saved-yet',
      '#userId': 'user-id',
      '#publicKey': 'public-key'
    },
    ExpressionAttributeValues: {
      ':userId': userId,
      ':publicKey': publicKey
    },
  }

  const ddbClient = connection.ddbClient()
  await ddbClient.update(updateUserParams).promise()
}

exports.validateKey = async function (validationMessage, userProvidedValidationMessage, user, conn) {
  const seedNotSavedYet = user['seed-not-saved-yet']
  const userId = user['user-id']
  const appId = user['app-id']
  const username = user['username']
  const userPublicKey = user['public-key']

  if (validationMessage.toString('base64') === userProvidedValidationMessage) {
    try {
      if (seedNotSavedYet) {
        try {
          await userSavedSeed(userId, appId, username, userPublicKey)
        } catch (e) {
          if (e.name === 'ConditionalCheckFailedException') {
            return responseBuilder.errorResponse(statusCodes['Unauthorized'], 'Invalid seed')
          }

          throw e
        }
      }

      conn.validateKey()

      return responseBuilder.successResponse('Success!')
    } catch (e) {
      logger.error(`Failed to validate key with ${e}`)
      return responseBuilder.errorResponse(
        statusCodes['Internal Server Error'],
        'Failed to validate key'
      )
    }
  } else {
    return responseBuilder.errorResponse(statusCodes['Unauthorized'], 'Failed to validate key')
  }
}

exports.getPasswordSaltsByUserId = async function (userId) {
  try {
    const user = await getUserByUserId(userId)
    if (!user || user['deleted']) return responseBuilder.errorResponse(
      statusCodes['Not Found'],
      'User not found'
    )

    const result = {
      passwordSalt: user['password-salt'],
      passwordTokenSalt: user['password-token-salt']
    }

    return responseBuilder.successResponse(result)
  } catch (e) {
    logger.error(`User id '${userId}' failed to get password salts with ${e}`)
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'])
  }
}

exports.getPasswordSaltsController = async function (req, res) {
  const appId = req.query.appId
  const username = req.query.username

  if (!appId || !username) return res
    .status(statusCodes['Bad Request'])
    .send('Missing required items')

  try {
    _validateUsernameInput(username)
  } catch (e) {
    return res.status(statusCodes['Bad Request']).send(e)
  }

  try {
    // Warning: uses secondary index here. It's possible index won't be up to date and this fails
    const app = await appController.getAppByAppId(appId)
    if (!app) return res.status(statusCodes['Unauthorized']).send('App ID not valid')

    const params = {
      TableName: setup.usersTableName,
      Key: {
        username: username.toLowerCase(),
        'app-id': appId
      },
    }

    const ddbClient = connection.ddbClient()
    const userResponse = await ddbClient.get(params).promise()

    const user = userResponse.Item

    if (!user || user['deleted']) return res.status(statusCodes['Not Found']).send('User not found')

    const result = {
      passwordSalt: user['password-salt'],
      passwordTokenSalt: user['password-token-salt']
    }

    return res.send(result)
  } catch (e) {
    logger.error(`Username '${username}' failed to get password salts with ${e}`)
    return res.status(statusCodes['Internal Server Error']).end()
  }
}

exports.signIn = async function (req, res) {
  const appId = req.query.appId

  const username = req.body.username
  const passwordToken = req.body.passwordToken

  if (!appId || !username || !passwordToken) return res
    .status(statusCodes['Bad Request'])
    .send('Missing required items')

  try {
    _validateUsernameInput(username)
  } catch (e) {
    return res.status(statusCodes['Bad Request']).send(e)
  }

  try {
    // Warning: uses secondary index here. It's possible index won't be up to date and this fails
    const app = await appController.getAppByAppId(appId)
    if (!app || app['deleted']) return res.status(statusCodes['Unauthorized']).send('App ID not valid')

    const admin = await adminController.findAdminByAdminId(app['admin-id'])
    if (!admin || admin['deleted']) return res.status(statusCodes['Unauthorized']).send('App ID not valid')

    const params = {
      TableName: setup.usersTableName,
      Key: {
        username: username.toLowerCase(),
        'app-id': appId
      },
    }

    const ddbClient = connection.ddbClient()
    const userResponse = await ddbClient.get(params).promise()

    const user = userResponse.Item

    try {
      _validatePassword(passwordToken, user, req)
    } catch (e) {
      if (e.error === 'PasswordAttemptLimitExceeded') {
        return res.status(statusCodes['Unauthorized']).send(e)
      }

      return res.status(statusCodes['Unauthorized']).send('Invalid password')
    }

    const session = await createSession(user['user-id'], appId)

    const result = { session }

    if (user['email']) result.email = user['email']
    if (user['profile']) result.profile = user['profile']
    if (user['password-based-encryption-key-salt'] && user['password-encrypted-seed']) result.passwordBasedBackup = {
      passwordBasedEncryptionKeySalt: user['password-based-encryption-key-salt'],
      passwordEncryptedSeed: user['password-encrypted-seed']
    }

    return res.send(result)
  } catch (e) {
    logger.error(`Username '${username}' failed to sign in with ${e}`)
    return res.status(statusCodes['Internal Server Error']).end()
  }
}

exports.signOut = async function (sessionId) {
  if (!sessionId) return responseBuilder.errorResponse(
    statusCodes['Unauthorized'],
    'Missing session id'
  )

  const params = {
    TableName: setup.sessionsTableName,
    Key: {
      'session-id': sessionId
    },
    UpdateExpression: 'set invalidated = :invalidated',
    ExpressionAttributeValues: {
      ':invalidated': true,
    }
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.update(params).promise()

    return responseBuilder.successResponse('Success!')
  } catch (e) {
    logger.error(`Failed to sign out session ${sessionId} with ${e}`)
    return responseBuilder.errorResponse(
      statusCodes['Internal Server Error'],
      'Failed to sign out!'
    )
  }
}

async function getUserByUserId(userId) {
  const params = {
    TableName: setup.usersTableName,
    IndexName: setup.userIdIndex,
    KeyConditionExpression: '#userId = :userId',
    ExpressionAttributeNames: {
      '#userId': 'user-id'
    },
    ExpressionAttributeValues: {
      ':userId': userId
    },
    Select: 'ALL_ATTRIBUTES'
  }

  const ddbClient = connection.ddbClient()
  const userResponse = await ddbClient.query(params).promise()

  if (!userResponse || userResponse.Items.length === 0) return null

  if (userResponse.Items.length > 1) {
    const errorMsg = `Too many users found with id ${userId}`
    logger.fatal(errorMsg)
    throw new Error(errorMsg)
  }

  return userResponse.Items[0]
}
exports.getUserByUserId = getUserByUserId

exports.extendSession = async function (req, res) {
  const user = res.locals.user

  const sessionId = req.query.sessionId

  const extendedDate = new Date().toISOString()

  const params = {
    TableName: setup.sessionsTableName,
    Key: {
      'session-id': sessionId
    },
    UpdateExpression: 'set #extendedDate = :extendedDate',
    ExpressionAttributeNames: {
      '#extendedDate': 'extended-date'
    },
    ExpressionAttributeValues: {
      ':extendedDate': extendedDate
    }
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.update(params).promise()

    const result = { extendedDate, username: user['username'] }

    if (user['email']) result.email = user['email']
    if (user['profile']) result.profile = user['profile']
    result.backUpKey = (user['password-based-encryption-key-salt'] && user['password-encrypted-seed']) ? true : false

    return res.send(result)
  } catch (e) {
    logger.error(`Unable to extend session ${sessionId} with: ${e}`)
    return res
      .status(statusCodes['Internal Server Error'])
      .send('Failed to extend session')
  }
}

exports.getServerPublicKey = async function (_, res) {
  try {
    return res.send(crypto.diffieHellman.getPublicKey())
  } catch (e) {
    logger.error(`Failed to get server public key with ${e}`)
    return res.status(statusCodes['Internal Server Error']).send('Failed to get server public key')
  }
}

const _updateUserExcludingUsernameUpdate = async (user, userId, passwordToken, passwordSalts,
  email, profile, passwordBasedBackup) => {
  const updateUserParams = conditionCheckUserExists(user['username'], user['app-id'], userId)

  let UpdateExpression = ''

  if (passwordToken || email || profile) {
    UpdateExpression = 'SET '

    if (passwordToken) {
      UpdateExpression += '#passwordToken = :passwordToken, #passwordSalt = :passwordSalt, #passwordTokenSalt = :passwordTokenSalt'

      updateUserParams.ExpressionAttributeNames['#passwordToken'] = 'password-token'
      updateUserParams.ExpressionAttributeNames['#passwordSalt'] = 'password-salt'
      updateUserParams.ExpressionAttributeNames['#passwordTokenSalt'] = 'password-token-salt'

      updateUserParams.ExpressionAttributeValues[':passwordToken'] = crypto.sha256.hash(passwordToken)
      updateUserParams.ExpressionAttributeValues[':passwordSalt'] = passwordSalts.passwordSalt
      updateUserParams.ExpressionAttributeValues[':passwordTokenSalt'] = passwordSalts.passwordTokenSalt

      // password-based backup
      UpdateExpression += ', #passwordBasedEncryptionKeySalt = :passwordBasedEncryptionKeySalt, #passwordEncryptedSeed = :passwordEncryptedSeed'

      updateUserParams.ExpressionAttributeNames['#passwordBasedEncryptionKeySalt'] = 'password-based-encryption-key-salt'
      updateUserParams.ExpressionAttributeNames['#passwordEncryptedSeed'] = 'password-encrypted-seed'

      updateUserParams.ExpressionAttributeValues[':passwordBasedEncryptionKeySalt'] = passwordBasedBackup.passwordBasedEncryptionKeySalt
      updateUserParams.ExpressionAttributeValues[':passwordEncryptedSeed'] = passwordBasedBackup.passwordEncryptedSeed
    }

    if (email) {
      UpdateExpression += (passwordToken ? ', ' : '') + 'email = :email'
      updateUserParams.ExpressionAttributeValues[':email'] = email.toLowerCase()
    }

    if (profile) {
      UpdateExpression += ((passwordToken || email) ? ', ' : '') + 'profile = :profile'
      updateUserParams.ExpressionAttributeValues[':profile'] = profile
    }
  }

  if (email === false || profile === false) {
    UpdateExpression += ' REMOVE '

    if (email === false) {
      UpdateExpression += 'email'
    }

    if (profile === false) {
      UpdateExpression += (email === false ? ', ' : '') + 'profile'
    }
  }

  updateUserParams.UpdateExpression = UpdateExpression

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.update(updateUserParams).promise()
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      throw new Error('UserNotFound')
    }
    throw e
  }
}

const _updateUserIncludingUsernameUpdate = async (oldUser, userId, passwordToken,
  passwordSalts, email, profile, passwordBasedBackup, username) => {

  // if updating username, need to Delete existing DDB item and Put new one because username is partition key
  const deleteUserParams = conditionCheckUserExists(oldUser['username'], oldUser['app-id'], userId)

  const updatedUser = {
    ...oldUser,
    username: username.toLowerCase()
  }

  if (passwordToken) {
    updatedUser['password-token'] = crypto.sha256.hash(passwordToken)
    updatedUser['password-salt'] = passwordSalts.passwordSalt
    updatedUser['password-token-salt'] = passwordSalts.passwordTokenSalt

    updatedUser['password-based-encryption-key-salt'] = passwordBasedBackup.passwordBasedEncryptionKeySalt
    updatedUser['password-encrypted-seed'] = passwordBasedBackup.passwordEncryptedSeed
  }

  if (email) updatedUser.email = email.toLowerCase()
  else if (email === false) delete updatedUser.email

  if (profile) updatedUser.profile = profile
  else if (profile === false) delete updatedUser.profile

  const updateUserParams = {
    TableName: setup.usersTableName,
    Item: updatedUser,
    // if username does not exist, insert
    // if it already exists and user hasn't saved seed yet, overwrite
    // if it already exists and user has saved seed, fail with ConditionalCheckFailedException
    ConditionExpression: 'attribute_not_exists(username) or attribute_exists(#seedNotSavedYet)',
    ExpressionAttributeNames: {
      '#seedNotSavedYet': 'seed-not-saved-yet'
    }
  }

  const params = {
    TransactItems: [
      { Delete: deleteUserParams },
      { Put: updateUserParams }
    ]
  }

  try {
    const ddbClient = connection.ddbClient()
    await ddbClient.transactWrite(params).promise()
  } catch (e) {
    if (e.message.includes('[ConditionalCheckFailed')) {
      throw new Error('UserNotFound')
    } else if (e.message.includes('ConditionalCheckFailed]')) {
      throw new Error('UsernameAlreadyExists')
    }
    throw e
  }
}

exports.updateUser = async function (userId, username, currentPasswordToken, passwordToken, passwordSalts,
  email, profile, passwordBasedBackup) {
  if (!username && !currentPasswordToken && !passwordToken && !email && !profile && email !== false && profile !== false) {
    return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing all params')
  }

  if (passwordToken) {
    if (!passwordSalts || !passwordSalts.passwordSalt || !passwordSalts.passwordTokenSalt) {
      return responseBuilder.errorResponse(statusCodes['Bad Request'], 'Missing password salts')

    } else if (!passwordBasedBackup || !passwordBasedBackup.passwordBasedEncryptionKeySalt
      || !passwordBasedBackup.passwordEncryptedSeed) {

      return responseBuilder
        .errorResponse(statusCodes['Bad Request'], 'Missing password-based key backup')

    } else if (!currentPasswordToken) {
      return responseBuilder
        .errorResponse(statusCodes['Bad Request'], 'Missing current password token')
    }
  }

  try {
    if (username) _validateUsernameInput(username)
    if (email && !validateEmail(email)) throw { error: 'EmailNotValid' }
    if (profile) _validateProfile(profile)
  } catch (e) {
    return responseBuilder.errorResponse(statusCodes['Bad Request'], e)
  }

  try {
    const user = await getUserByUserId(userId)
    if (!user || user['deleted']) throw new Error('UserNotFound')

    if (passwordToken) {
      try {
        _validatePassword(currentPasswordToken, user)
      } catch (e) {
        if (e.error === 'PasswordAttemptLimitExceeded') {
          return responseBuilder.errorResponse(status(statusCodes['Unauthorized']), e)
        }

        return responseBuilder.errorResponse(statusCodes['Bad Request'], 'CurrentPasswordIncorrect')
      }
    }

    if (username && username.toLowerCase() !== user['username']) {

      await _updateUserIncludingUsernameUpdate(
        user, userId, passwordToken, passwordSalts, email, profile, passwordBasedBackup, username
      )

    } else if (passwordToken || (email || email === false) || (profile || profile === false)) {

      await _updateUserExcludingUsernameUpdate(
        user, userId, passwordToken, passwordSalts, email, profile, passwordBasedBackup
      )

    }

    return responseBuilder.successResponse()
  } catch (e) {
    if (e.message === 'UserNotFound') return responseBuilder.errorResponse(statusCodes['Not Found'], 'UserNotFound')
    else if (e.message === 'UsernameAlreadyExists') return responseBuilder.errorResponse(statusCodes['Conflict'], 'UsernameAlreadyExists')

    logger.error(`Failed to update user '${userId}' with ${e}`)
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], 'Failed to update user')
  }
}

const deleteUser = async (username, appId, userId, adminId, appName) => {
  const params = conditionCheckUserExists(username, appId, userId)

  params.UpdateExpression = 'set deleted = :deleted'
  params.ExpressionAttributeValues[':deleted'] = new Date().toISOString()

  const ddbClient = connection.ddbClient()
  await ddbClient.update(params).promise()

  // best effort decrement
  appController.decrementNumAppUsers(adminId, appName, appId)
}
exports.deleteUser = deleteUser

exports.deleteUserController = async function (userId, adminId, appName) {
  try {
    if (!userId || !adminId || !appName) return responseBuilder
      .errorResponse(statusCodes['Bad Request'], 'Missing params')

    const user = await getUserByUserId(userId)
    if (!user || user['deleted']) return responseBuilder.errorResponse(statusCodes['Not Found'], 'UserNotFound')

    await deleteUser(user['username'], user['app-id'], userId, adminId, appName)

    return responseBuilder.successResponse()
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      return responseBuilder.errorResponse(statusCodes['Not Found'], 'UserNotFound')
    }

    logger.error(`Failed to delete user '${userId}' with ${e}`)
    return responseBuilder.errorResponse(statusCodes['Internal Server Error'], 'Failed to delete user')
  }
}

const conditionCheckUserExists = (username, appId, userId) => {
  return {
    TableName: setup.usersTableName,
    Key: {
      username,
      'app-id': appId
    },
    ConditionExpression: 'attribute_exists(username) and attribute_not_exists(deleted) and #userId = :userId',
    ExpressionAttributeNames: {
      '#userId': 'user-id'
    },
    ExpressionAttributeValues: {
      ':userId': userId
    }
  }
}
