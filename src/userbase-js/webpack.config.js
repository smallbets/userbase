const path = require('path')
const packageJson = require('./package.json')

const version = packageJson.version

module.exports = {
  entry: {
    main: './src/userbase-js/index.js'
  },
  output: {
    path: path.join(__dirname, '../../build/script/'),
    filename: `userbase-${version}.js`,
    library: 'userbase',
    libraryExport: 'default'
  },
  target: 'web',
  devtool: 'source-map',
  module: {
    rules: [
      {
        enforce: 'pre',
        test: /\.js$/,
        use: ['source-map-loader'],
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: [
              'emotion',
              ['@babel/plugin-transform-runtime', { corejs: 3, useESModules: true, version: '^7.7.6' }]
            ]
          }
        }
      }
    ]
  }
}
