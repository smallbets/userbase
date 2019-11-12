import React from 'react'
import ReactDOM from 'react-dom'
import 'babel-polyfill'
import App from './App'

import './style.css'

ReactDOM.render(<App />, document.getElementById('content'))

if (module.hot) {
  module.hot.accept()
}
