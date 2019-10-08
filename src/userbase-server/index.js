import server from './server'

if (!global._babelPolyfill) {
  require('babel-polyfill')
}

export default server
