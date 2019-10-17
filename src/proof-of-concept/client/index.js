import React from 'react'
import ReactDOM from 'react-dom'
import 'babel-polyfill'
import userbase from 'userbase-js'
import App from './App'

import './style.css'

const APP_ID = 'poc-id'
userbase.updateConfig({ appId: APP_ID })

// use our own server for development
if (window.location.host === 'localhost:3000') userbase.updateConfig({ newEndpoint: 'http://localhost:3000' })
else if (window.location.host === 'staging.encrypted.dev') userbase.updateConfig({ newEndpoint: 'https://staging.encrypted.dev' })

ReactDOM.render(<App />, document.getElementById('content'))

if (module.hot) {
  module.hot.accept()
}
