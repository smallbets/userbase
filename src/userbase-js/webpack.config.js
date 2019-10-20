const path = require('path')

module.exports = () => {

  return {
    entry: {
      main: './src/userbase-js/userbase.js'
    },
    output: {
      path: path.join(__dirname, '../../build/script/'),
      filename: 'userbase.js'
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
