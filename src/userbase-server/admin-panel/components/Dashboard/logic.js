import axios from 'axios'
import adminLogic from '../Admin/logic'

const TEN_SECONDS_MS = 10 * 1000

const UNAUTHORIZED = 401

const listApps = async () => {
  try {
    const listAppsResponse = await axios({
      method: 'POST',
      url: '/admin/list-apps',
      timeout: TEN_SECONDS_MS
    })

    const apps = listAppsResponse.data
    return apps
  } catch (e) {
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
}

export default {
  listApps
}
