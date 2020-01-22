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
      url: `/${VERSION}/admin/list-app-users?appName=${appName}`,
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
      url: `/${VERSION}/admin/delete-app?appName=${appName}`,
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
      url: `/${VERSION}/admin/permanent-delete-app?appId=${appId}&appName=${appName}`,
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

export default {
  listApps,
  listAppUsers,
  deleteApp,
  permanentDeleteApp,
  deleteUser,
  permanentDeleteUser
}
