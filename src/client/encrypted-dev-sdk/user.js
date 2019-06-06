import axios from 'axios'

const query = async () => axios.get('/api/user/query')

export default {
  query
}
