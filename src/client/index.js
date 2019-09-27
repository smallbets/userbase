import React from 'react'
import ReactDOM from 'react-dom'
import 'babel-polyfill'
import App from './App'
import encd from './encrypted-dev-sdk'

import './style.css'

// use our own server for development
if (window.location.host === 'localhost:3000') encd.updateConfig('http://localhost:3000')

ReactDOM.render(<App />, document.getElementById('content'))

if (module.hot) {
  module.hot.accept()
}
