import crypto from '../Crypto'

const signUp = async (username, password) => {
  const symmetricKey = await crypto.aesGcm.generateKey()
  if (symmetricKey) {
    await crypto.aesGcm.saveKeyToLocalStorage(symmetricKey)

    console.log(`Will call /api/auth/sign-up using username: '${username}' and password: '${password}'`)
  }

}

export default {
  signUp
}
