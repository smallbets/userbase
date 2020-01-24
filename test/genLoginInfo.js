const fs = require('fs')

const NUM_USERS = 100

const random = () => Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
const randomUsername = () => `${random()}-user`
const randomPassword = () => random()

const users = []
for (let i = 0; i < NUM_USERS; i++) {
  users.push({ username: randomUsername(), password: randomPassword() })
}

const loginInfoJs = `const USERS = ${JSON.stringify(users)}`

fs.writeFileSync('./test/loginInfo.js', loginInfoJs)
