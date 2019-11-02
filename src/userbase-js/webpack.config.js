const path = require('path')
const packageJson = require('./package.json')

module.exports = () => {

  const version = packageJson.version

  return {
    entry: {
      main: './src/userbase-js/userbase.js'
    },
    output: {
      path: path.join(__dirname, '../../build/script/'),
      filename: `userbase-${version}.js`
    },
    target: 'web',
    devtool: 'source-map',
    resolve: {
      extensions: ['.js'],
    },
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
              plugins: ['@babel/transform-runtime']
            }
          }
        }
      ]
    }
  }
}
