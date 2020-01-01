const path = require('path')
const merge = require('webpack-merge')
const common = require('./webpack.common.js')

module.exports = merge(common, {
  output: {
    path: path.join(__dirname, 'dist'),
    filename: `userbase.js`,
    library: 'userbase',
    libraryExport: 'default'
  },
  target: 'web'
})
