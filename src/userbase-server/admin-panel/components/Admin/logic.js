import axios from 'axios'
import { VERSION } from '../../config'

const TEN_SECONDS_MS = 10 * 1000

const UNAUTHORIZED = 401

const errorHandler = (e, signOutUnauthorized = true) => {
  if (e && e.response) {
    if (signOutUnauthorized && e.response.status === UNAUTHORIZED) {
      handleSignOut()
    } else {
      throw new Error(e.response.data)
    }
  } else {
    throw e
  }
}

const handleSignOut = () => {
  signOutLocalSession()
  window.location.hash = 'sign-in'
}

const signInLocalSession = (adminName) => {
  const adminSession = JSON.stringify({ adminName, signedIn: true })
  localStorage.setItem('adminSession', adminSession)
}

const signOutLocalSession = () => {
  const adminSessionJson = localStorage.getItem('adminSession')
  const adminSession = JSON.parse(adminSessionJson)
  const signedOutSession = JSON.stringify({ ...adminSession, signedIn: false })
  localStorage.setItem('adminSession', signedOutSession)
}

const removeLocalSession = () => {
  localStorage.removeItem('adminSession')
}

const createAdmin = async (adminName, password, fullName) => {
  try {
    const lowerCaseAdminName = adminName.toLowerCase()
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/create-admin`,
      data: {
        adminName: lowerCaseAdminName,
        password,
        fullName
      },
      timeout: TEN_SECONDS_MS
    })
    signInLocalSession(lowerCaseAdminName)
  } catch (e) {
    errorHandler(e)
  }
}

const createApp = async (appName) => {
  try {
    const appResponse = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/create-app`,
      data: {
        appName
      },
      timeout: TEN_SECONDS_MS
    })
    return appResponse.data
  } catch (e) {
    errorHandler(e)
  }
}

const signOut = async () => {
  handleSignOut()
  await axios({
    method: 'POST',
    url: `/${VERSION}/admin/sign-out`,
    timeout: TEN_SECONDS_MS
  })
}

const signIn = async (adminName, password) => {
  try {
    const lowerCaseAdminName = adminName.toLowerCase()
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/sign-in`,
      data: {
        adminName: lowerCaseAdminName,
        password
      },
      timeout: TEN_SECONDS_MS
    })
    signInLocalSession(lowerCaseAdminName)
  } catch (e) {
    errorHandler(e, false)
  }
}

const forgotPassword = async (adminName) => {
  try {
    const lowerCaseAdminName = adminName.toLowerCase()
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/forgot-password?adminName=${lowerCaseAdminName}`,
      timeout: TEN_SECONDS_MS
    })
  } catch (e) {
    errorHandler(e)
  }
}

const deleteAdmin = async () => {
  try {
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/delete-admin`,
      timeout: TEN_SECONDS_MS
    })
    removeLocalSession()
    window.location.hash = ''
  } catch (e) {
    errorHandler(e)
  }
}

export default {
  createAdmin,
  createApp,
  signOut,
  handleSignOut,
  signIn,
  errorHandler,
  forgotPassword,
  deleteAdmin
}
