import axios from 'axios'

const find = async () => axios.get('/api/user/find')

export default {
  find
}
