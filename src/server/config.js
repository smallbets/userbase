import dotenv from 'dotenv'

const result = dotenv.config({ path: __dirname + '/.env' })

if (result.error) {
  throw result.error
}
