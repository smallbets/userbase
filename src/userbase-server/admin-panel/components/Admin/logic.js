import axios from 'axios'
import { VERSION, STRIPE } from '../../config'

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

const createAdmin = async (email, password, fullName) => {
  try {
    const lowerCaseEmail = email.toLowerCase()
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/create-admin`,
      data: {
        email: lowerCaseEmail,
        password,
        fullName
      },
      timeout: TEN_SECONDS_MS
    })
    signInLocalSession(lowerCaseEmail, fullName)
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
    const { fullName, paymentStatus } = signInResponse.data
    signInLocalSession(lowerCaseEmail, fullName)
    return paymentStatus
  } catch (e) {
    errorHandler(e, false)
  }
}

const forgotPassword = async (email) => {
  try {
    const lowerCaseEmail = email.toLowerCase()
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/forgot-password?email=${lowerCaseEmail}`,
      timeout: TEN_SECONDS_MS
    })
  } catch (e) {
    errorHandler(e)
  }
}

const updateAdmin = async ({ email, password, fullName }) => {
  try {
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/update-admin`,
      data: {
        email,
        password,
        fullName
      },
      timeout: TEN_SECONDS_MS
    })
    if (email || fullName) updateLocalSession(email, fullName)
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
    const paymentStatus = cancelResponse.data
    return paymentStatus
  } catch (e) {
    errorHandler(e)
  }
}

const resumeSaasSubscription = async () => {
  try {
    const resumeResponse = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/stripe/resume-saas-subscription`,
      timeout: TEN_SECONDS_MS
    })
    const paymentStatus = resumeResponse.data
    return paymentStatus
  } catch (e) {
    errorHandler(e)
  }
}

const getPaymentStatus = async () => {
  try {
    const paymentStatusResponse = await axios({
      method: 'GET',
      url: `/${VERSION}/admin/payment-status`,
      timeout: TEN_SECONDS_MS
    })
    const paymentStatus = paymentStatusResponse.data
    return paymentStatus
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
  updateAdmin,
  deleteAdmin,
  subscribeToSaas,
  updateSaasPaymentMethod,
  cancelSaasSubscription,
  resumeSaasSubscription,
  getPaymentStatus
}
