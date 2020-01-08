const path = require('path')
const merge = require('webpack-merge')
const nodeExternals = require('webpack-node-externals')
const common = require('./webpack.common.js')

module.exports = merge(common, {
  output: {
    path: path.join(__dirname, 'dist'),
    filename: 'userbase.cjs.js',
    libraryExport: 'default',
    libraryTarget: 'commonjs'
  },
  target: 'node',
  externals: [
    nodeExternals({
      whitelist: [
        '@fortawesome/fontawesome-svg-core',
        '@fortawesome/free-solid-svg-icons',
        'argon2-browser'
      ]
    })
  ],
  optimization: {
    minimize: false
  }
})
