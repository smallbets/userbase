const webpack = require('webpack')
const merge = require('webpack-merge')
const common = require('./webpack.common.js')
const OpenBrowserPlugin = require('open-browser-webpack-plugin')

module.exports = merge(common, {
  entry: {
    main: ['./src/client/index.js']
  },
  mode: 'development',
  devtool: 'inline-source-map',
  devServer: {
    historyApiFallback: true,
    hot: true,
    inline: true,

    host: 'localhost',
    port: 3000,
    proxy: {
      '/api/*': {
        target: 'http://localhost:8080/',
        secure: false
      }
    }
  },
  module: {
    rules: [
      {
        test: /\.html$/,
        use: [
          {
            loader: "html-loader"
          }
        ]
      },
      {
        test: /\.(png|svg|jpg|gif)$/,
        use: ['file-loader']
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new webpack.HotModuleReplacementPlugin(),
    new OpenBrowserPlugin({ url: 'http://localhost:3000' })
  ]
})
