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

export default {
  listApps,
  listAppUsers
}
