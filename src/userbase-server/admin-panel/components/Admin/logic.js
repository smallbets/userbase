import axios from 'axios'

const TEN_SECONDS_MS = 10 * 1000

const handleSignOut = () => {
  signOutLocalSession()
  window.location.hash = 'sign-in'
}

const UNAUTHORIZED = 401

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

const createAdmin = async (adminName, password) => {
  try {
    await axios({
      method: 'POST',
      url: '/admin/create-admin',
      data: {
        adminName,
        password
      },
      timeout: TEN_SECONDS_MS
    })
    signInLocalSession(adminName)
  } catch (e) {
    if (e && e.response) {
      throw new Error(e.response.data)
    } else {
      throw e
    }
  }
}

const createApp = async (appName) => {
  try {
    await axios({
      method: 'POST',
      url: '/admin/create-app',
      data: {
        appName
      },
      timeout: TEN_SECONDS_MS
    })
  } catch (e) {
    if (e && e.response && e.response.status === UNAUTHORIZED) {
      handleSignOut()
    }
    throw e
  }
}

const signOut = async () => {
  handleSignOut()
  await axios({
    method: 'POST',
    url: '/admin/sign-out',
    timeout: TEN_SECONDS_MS
  })
}

const signIn = async (adminName, password) => {
  try {
    await axios({
      method: 'POST',
      url: '/admin/sign-in',
      data: {
        adminName,
        password
      },
      timeout: TEN_SECONDS_MS
    })
  } catch (e) {
    if (e && e.response) {
      throw new Error(e.response.data)
    } else {
      throw e
    }
  }

  signInLocalSession(adminName)
}

export default {
  createAdmin,
  createApp,
  signOut,
  handleSignOut,
  signIn
}
