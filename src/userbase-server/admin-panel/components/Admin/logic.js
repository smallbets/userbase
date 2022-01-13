import axios from 'axios'
import { VERSION, STRIPE } from '../../config'

const TEN_SECONDS_MS = 10 * 1000

const UNAUTHORIZED = 401

const errorHandler = (e, signOutUnauthorized = true) => {
  if (e && e.response) {
    if (signOutUnauthorized && e.response.status === UNAUTHORIZED) {
      handleSignOut()
      throw new Error('Please sign in.')
    } else if (e.response.status >= 500) {
      throw new Error('Unknown Error')
    } else {
      throw new Error(e.response.data)
    }
  }
  throw new Error('Unknown Error')
}

const handleSignOut = () => {
  signOutLocalSession()
  window.location.hash = 'sign-in'
}

const signInLocalSession = (email, fullName) => {
  const adminSession = JSON.stringify({ email, fullName, signedIn: true })
  localStorage.setItem('adminSession', adminSession)
}

const updateLocalSession = (email, fullName) => {
  const adminSessionJson = localStorage.getItem('adminSession')
  const adminSession = JSON.parse(adminSessionJson)
  const updatedSession = { ...adminSession }
  if (email) updatedSession.email = email
  if (fullName) updatedSession.fullName = fullName
  localStorage.setItem('adminSession', JSON.stringify(updatedSession))
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

const createAdmin = async (email, password, fullName, receiveEmailUpdates) => {
  try {
    const lowerCaseEmail = email.toLowerCase()
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/create-admin`,
      data: {
        email: lowerCaseEmail,
        password,
        fullName,
        receiveEmailUpdates
      },
      timeout: TEN_SECONDS_MS
    })
    signInLocalSession(lowerCaseEmail, fullName)
  } catch (e) {
    errorHandler(e)
  }
}

const createApp = async (appName, encryptionMode) => {
  try {
    const appResponse = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/create-app`,
      data: {
        appName,
        encryptionMode,
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

const signIn = async (email, password) => {
  try {
    const lowerCaseEmail = email.toLowerCase()
    const signInResponse = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/sign-in`,
      data: {
        email: lowerCaseEmail,
        password
      },
      timeout: TEN_SECONDS_MS
    })
    signInLocalSession(lowerCaseEmail, signInResponse.data.fullName)
    return signInResponse.data
  } catch (e) {
    errorHandler(e, false)
  }
}

const forgotPassword = async (email) => {
  try {
    const lowerCaseEmail = email.toLowerCase()
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/forgot-password`,
      data: {
        email: lowerCaseEmail
      },
      timeout: TEN_SECONDS_MS
    })
  } catch (e) {
    errorHandler(e)
  }
}

const updateAdmin = async ({ email, fullName }) => {
  try {
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/update-admin`,
      data: {
        email,
        fullName
      },
      timeout: TEN_SECONDS_MS
    })
    updateLocalSession(email, fullName)
  } catch (e) {
    errorHandler(e)
  }
}

const changePassword = async ({ currentPassword, newPassword }) => {
  try {
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/change-password`,
      data: {
        currentPassword,
        newPassword
      },
      timeout: TEN_SECONDS_MS
    })
  } catch (e) {
    errorHandler(e, false)
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

const subscribeToSaas = async () => {
  try {
    const paymentSessionResponse = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/stripe/create-saas-payment-session`,
      timeout: TEN_SECONDS_MS
    })
    const sessionId = paymentSessionResponse.data

    const result = await STRIPE.redirectToCheckout({ sessionId })
    if (result.error) throw result.error

  } catch (e) {
    errorHandler(e)
  }
}

const updateSaasPaymentMethod = async () => {
  try {
    const updatePaymenSessionResponse = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/stripe/update-saas-payment-session`,
      timeout: TEN_SECONDS_MS
    })
    const sessionId = updatePaymenSessionResponse.data

    const result = await STRIPE.redirectToCheckout({ sessionId })
    if (result.error) throw result.error

  } catch (e) {
    errorHandler(e)
  }
}

const cancelSaasSubscription = async () => {
  try {
    const cancelResponse = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/stripe/cancel-saas-subscription`,
      timeout: TEN_SECONDS_MS
    })
    return cancelResponse.data
  } catch (e) {
    errorHandler(e)
  }
}

const resumeSaasSubscription = async () => {
  try {
    const response = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/stripe/resume-saas-subscription`,
      timeout: TEN_SECONDS_MS
    })
    return response.data
  } catch (e) {
    errorHandler(e)
  }
}

const buyStoragePlan = async (plan) => {
  try {
    const response = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/stripe/storage-plan/`,
      data: {
        plan
      },
      timeout: TEN_SECONDS_MS
    })
    return response.data
  } catch (e) {
    errorHandler(e)
  }
}

const cancelStorageSubscription = async () => {
  try {
    const response = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/stripe/cancel-storage-subscription`,
      timeout: TEN_SECONDS_MS
    })
    return response.data
  } catch (e) {
    errorHandler(e)
  }
}

const resumeStorageSubscription = async () => {
  try {
    const response = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/stripe/resume-storage-subscription`,
      timeout: TEN_SECONDS_MS
    })
    return response.data
  } catch (e) {
    errorHandler(e)
  }
}

const getAdminAccount = async () => {
  try {
    const adminAccountResponse = await axios({
      method: 'GET',
      url: `/${VERSION}/admin/account`,
      timeout: TEN_SECONDS_MS
    })
    const { email, fullName } = adminAccountResponse.data
    updateLocalSession(email, fullName)
    return adminAccountResponse.data
  } catch (e) {
    errorHandler(e)
  }
}

const getAccessTokens = async () => {
  try {
    const accessTokenResponse = await axios({
      method: 'GET',
      url: `/${VERSION}/admin/access-tokens`,
      timeout: TEN_SECONDS_MS
    })

    const accessTokens = accessTokenResponse.data

    const sortedAccessTokensByDate = accessTokens.sort((a, b) => new Date(b['creationDate']) - new Date(a['creationDate']))

    return sortedAccessTokensByDate
  } catch (e) {
    errorHandler(e)
  }
}

const generateAccessToken = async (currentPassword, label) => {
  try {
    const accessTokenResponse = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/access-token`,
      data: {
        currentPassword,
        label
      },
      timeout: TEN_SECONDS_MS
    })
    return accessTokenResponse.data
  } catch (e) {
    errorHandler(e, false)
  }
}

const deleteAccessToken = async (label) => {
  try {
    const accessTokenResponse = await axios({
      method: 'DELETE',
      url: `/${VERSION}/admin/access-token`,
      data: {
        label
      },
      timeout: TEN_SECONDS_MS
    })
    return accessTokenResponse.data
  } catch (e) {
    errorHandler(e)
  }
}

const completeStripeConnection = async (authCode) => {
  try {
    const connectionResponse = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/stripe/connection/${authCode}`,
      timeout: TEN_SECONDS_MS
    })
    return connectionResponse.data
  } catch (e) {
    errorHandler(e)
  }
}

const disconnectStripeAccount = async () => {
  try {
    await axios({
      method: 'DELETE',
      url: `/${VERSION}/admin/stripe/connection`,
      timeout: TEN_SECONDS_MS
    })
  } catch (e) {
    errorHandler(e)
  }
}

const saasSubscriptionActive = (admin) => {
  const { paymentStatus, cancelSaasSubscriptionAt, altPaymentStatus } = admin
  return (paymentStatus === 'active' && !cancelSaasSubscriptionAt) ||
    altPaymentStatus === 'active'
}

export default {
  createAdmin,
  createApp,
  signOut,
  handleSignOut,
  signIn,
  errorHandler,
  forgotPassword,
  updateAdmin,
  changePassword,
  deleteAdmin,
  subscribeToSaas,
  updateSaasPaymentMethod,
  cancelSaasSubscription,
  resumeSaasSubscription,
  buyStoragePlan,
  cancelStorageSubscription,
  resumeStorageSubscription,
  getAdminAccount,
  getAccessTokens,
  generateAccessToken,
  deleteAccessToken,
  completeStripeConnection,
  disconnectStripeAccount,
  saasSubscriptionActive,
}
