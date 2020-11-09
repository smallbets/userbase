const path = require('path')
const merge = require('webpack-merge')
const common = require('./webpack.common.js')

module.exports = merge(common, {
  output: {
    path: path.join(__dirname, 'dist'),
    filename: `userbase-sql.js`,
    library: 'userbaseSqlJs',
    libraryExport: 'default'
  },
  target: 'web'
})
