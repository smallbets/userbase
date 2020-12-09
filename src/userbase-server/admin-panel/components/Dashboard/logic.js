import axios from 'axios'
import { VERSION } from '../../config'
import adminLogic from '../Admin/logic'

const TEN_SECONDS_MS = 10 * 1000

const listApps = async () => {
  try {
    const listAppsResponse = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/list-apps`,
      timeout: TEN_SECONDS_MS
    })

    const apps = listAppsResponse.data
    return apps
  } catch (e) {
    adminLogic.errorHandler(e)
  }
}

const listAppUsers = async (appName) => {
  try {
    const listAppUsersResponse = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/list-app-users`,
      data: {
        appName
      },
      timeout: TEN_SECONDS_MS
    })

    const appUsers = listAppUsersResponse.data
    return appUsers
  } catch (e) {
    adminLogic.errorHandler(e)
  }
}

const deleteApp = async (appName) => {
  try {
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/delete-app`,
      data: {
        appName
      },
      timeout: TEN_SECONDS_MS
    })
  } catch (e) {
    adminLogic.errorHandler(e)
  }
}

const permanentDeleteApp = async (appId, appName) => {
  try {
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/permanent-delete-app`,
      data: {
        appId,
        appName,
      },
      timeout: TEN_SECONDS_MS
    })
  } catch (e) {
    adminLogic.errorHandler(e)
  }
}

const deleteUser = async (userId, appName, username) => {
  try {
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/delete-user`,
      data: {
        userId,
        appName,
        username
      },
      timeout: TEN_SECONDS_MS
    })
  } catch (e) {
    adminLogic.errorHandler(e)
  }
}

const permanentDeleteUser = async (userId, appName, username) => {
  try {
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/permanent-delete-user`,
      data: {
        userId,
        appName,
        username
      },
      timeout: TEN_SECONDS_MS
    })
  } catch (e) {
    adminLogic.errorHandler(e)
  }
}

const enableTestPayments = async (appName, appId) => {
  try {
    const paymentsModeResponse = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/stripe/connected/apps/${appId}/enable-test-payments?appName=${encodeURIComponent(appName)}`,
      timeout: TEN_SECONDS_MS
    })
    return paymentsModeResponse.data
  } catch (e) {
    adminLogic.errorHandler(e)
  }
}

const enableProdPayments = async (appName, appId) => {
  try {
    const paymentsModeResponse = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/stripe/connected/apps/${appId}/enable-prod-payments?appName=${encodeURIComponent(appName)}`,
      timeout: TEN_SECONDS_MS
    })
    return paymentsModeResponse.data
  } catch (e) {
    adminLogic.errorHandler(e)
  }
}

const setPaymentRequired = async (appName, appId, paymentRequired) => {
  try {
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/stripe/connected/apps/${appId}/payment-required?appName=${encodeURIComponent(appName)}`,
      data: {
        paymentRequired,
      },
      timeout: TEN_SECONDS_MS
    })
  } catch (e) {
    adminLogic.errorHandler(e)
  }
}

const setTrialPeriod = async (appName, appId, trialPeriodDays) => {
  try {
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/stripe/connected/apps/${appId}/trial-period?appName=${encodeURIComponent(appName)}`,
      data: {
        trialPeriodDays,
      },
      timeout: TEN_SECONDS_MS
    })
  } catch (e) {
    adminLogic.errorHandler(e)
  }
}

const deleteTrial = async (appName, appId) => {
  try {
    await axios({
      method: 'DELETE',
      url: `/${VERSION}/admin/stripe/connected/apps/${appId}/trial-period?appName=${encodeURIComponent(appName)}`,
      timeout: TEN_SECONDS_MS
    })
  } catch (e) {
    adminLogic.errorHandler(e)
  }
}

const modifyEncryptionMode = async (appId, appName, encryptionMode) => {
  try {
    await axios({
      method: 'POST',
      url: `/${VERSION}/admin/apps/${appId}/encryption-mode?appName=${encodeURIComponent(appName)}&encryptionMode=${encodeURIComponent(encryptionMode)}`,
      timeout: TEN_SECONDS_MS
    })
  } catch (e) {
    adminLogic.errorHandler(e)
  }
}

const addDomainToWhitelist = async (appId, domain) => {
  try {
    const domainResponse = await axios({
      method: 'POST',
      url: `/${VERSION}/admin/apps/${appId}/domain`,
      data: {
        domain
      },
      timeout: TEN_SECONDS_MS
    })
    return domainResponse.data
  } catch (e) {
    adminLogic.errorHandler(e)
  }
}

const getDomainWhitelist = async (appName) => {
  try {
    const domainWhitelistResponse = await axios({
      method: 'GET',
      url: `/${VERSION}/admin/apps/${encodeURIComponent(appName)}/domains`,
      timeout: TEN_SECONDS_MS
    })

    const domains = domainWhitelistResponse.data
    return domains
  } catch (e) {
    adminLogic.errorHandler(e)
  }
}

const deleteDomainFromWhitelist = async (appId, domain) => {
  try {
    await axios({
      method: 'DELETE',
      url: `/${VERSION}/admin/apps/${appId}/domain`,
      data: {
        domain
      },
      timeout: TEN_SECONDS_MS
    })
  } catch (e) {
    adminLogic.errorHandler(e)
  }
}

export default {
  listApps,
  listAppUsers,
  deleteApp,
  permanentDeleteApp,
  deleteUser,
  permanentDeleteUser,
  enableTestPayments,
  enableProdPayments,
  setPaymentRequired,
  setTrialPeriod,
  deleteTrial,
  modifyEncryptionMode,
  addDomainToWhitelist,
  getDomainWhitelist,
  deleteDomainFromWhitelist,
}
