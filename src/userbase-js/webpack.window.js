const path = require('path')
const merge = require('webpack-merge')
const common = require('./webpack.common.js')

// explicilty sets Userbase on to window object
module.exports = merge(common, {
  output: {
    path: path.join(__dirname, 'dist'),
    filename: `window.userbase.js`,
    library: 'userbase',
    libraryExport: 'default',
    libraryTarget: 'window'
  },
  target: 'web',
  devtool: false
})
