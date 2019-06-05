import axios from 'axios'
import crypto from '../Crypto'

const signUp = async (username, password) => {
  const symmetricKey = await crypto.aesGcm.generateKey()
  if (symmetricKey) {
    await crypto.aesGcm.saveKeyToLocalStorage(symmetricKey)

    try {
      const response = await axios.post('/api/auth/sign-up', {
        username,
        password
      })

      console.log(response)

    } catch (e) {
      console.log('Failed to sign up with', e)
    }

  }

}

export default {
  signUp
}
