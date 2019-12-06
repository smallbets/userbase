import axios from 'axios'
import adminLogic from '../Admin/logic'
import { VERSION } from '../../config'

const TEN_SECONDS_MS = 10 * 1000

const UNAUTHORIZED = 401

const errorHandler = (e) => {
  if (e && e.response) {
    if (e.response.status === UNAUTHORIZED) {
      adminLogic.handleSignOut()
    } else {
      throw new Error(e.response.data)
    }
  } else {
    throw e
  }
}

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
    errorHandler(e)
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
    errorHandler(e)
  }
}

export default {
  listApps,
  listAppUsers
}
