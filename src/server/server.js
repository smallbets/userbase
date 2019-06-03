import express from 'express'
import setup from './setup'
import auth from './auth'
import db from './db'

const app = express()
const distDir = "./dist"
const port = process.env.PORT || 8080

if (process.env.NODE_ENV == 'development') {
  console.log("Development Mode")
}

setup.init()

app.use(express.static(distDir))

app.post('/api/auth/sign-up', auth.signUp)
app.post('/api/auth/sign-in', auth.signIn)
app.post('/api/auth/sign-out', auth.signOut)

app.post('/api/db/insert', db.insert)
app.post('/api/db/update', db.update)
app.post('/api/db/delete', db.delete)
app.post('/api/db/query', db.query)

app.listen(port, () => {
  console.log(`App listening to ${port}....`)
  console.log('Press Ctrl+C to quit.')
})
