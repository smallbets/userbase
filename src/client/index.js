import React from 'react'
import ReactDOM from 'react-dom'
import 'babel-polyfill'
import Welcome from './Welcome'

import './style.css'

ReactDOM.render(
  <Welcome />,
  document.getElementById('content')
)

if (module.hot) {
  module.hot.accept()
}
