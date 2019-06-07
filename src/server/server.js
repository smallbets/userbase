import express from 'express'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import setup from './setup'
import auth from './auth'
import user from './user'
import db from './db'

const app = express()
const distDir = "./dist"
const port = process.env.PORT || 8080

if (process.env.NODE_ENV == 'development') {
  console.log("Development Mode")
}

setup.init()

app.use(express.static(distDir))
app.use(bodyParser.json())
app.use(cookieParser())

app.post('/api/auth/sign-up', auth.signUp)
app.post('/api/auth/sign-in', auth.signIn)
app.post('/api/auth/sign-out', auth.authenticateUser, auth.signOut)

app.get('/api/user/find', auth.authenticateUser, user.find)

app.post('/api/db/insert', auth.authenticateUser, db.insert)
app.post('/api/db/update', auth.authenticateUser, db.update)
app.post('/api/db/delete', auth.authenticateUser, db.delete)
app.get('/api/db/query', auth.authenticateUser, db.query)

app.listen(port, () => {
  console.log(`App listening to ${port}....`)
  console.log('Press Ctrl+C to quit.')
})
