import React from 'react'
import ReactDOM from 'react-dom'
import 'babel-polyfill'
import App from './App'
import userbase from 'userbase-js'

import './style.css'

// use our own server for development
if (window.location.host === 'localhost:3000') userbase.updateConfig('http://localhost:3000')
else if (window.location.host === 'staging.encrypted.dev') userbase.updateConfig('https://staging.encrypted.dev')

ReactDOM.render(<App />, document.getElementById('content'))

if (module.hot) {
  module.hot.accept()
}
