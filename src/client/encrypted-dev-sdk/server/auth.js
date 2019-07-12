import axios from 'axios'

const signUp = async (username, password, userId) => {
  await axios.post('/api/auth/sign-up', {
    username,
    password,
    userId
  })
}

const signOut = async () => {
  await axios.post('/api/auth/sign-out')
}

const signIn = async (username, password) => {
  await axios.post('/api/auth/sign-in', {
    username,
    password
  })
}

export default {
  signUp,
  signOut,
  signIn,
}
