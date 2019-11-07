const path = require('path')
const TerserPlugin = require('terser-webpack-plugin')
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin')
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
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
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
        },
        {
          test: /\.(woff|woff2|eot|ttf|otf|png|svg|jpg|gif)$/,
          use: {
            loader: 'url-loader'
          }
        }
      ]
    },
    optimization: {
      minimizer: [
        new TerserPlugin({
          cache: true,
          parallel: true,
          sourceMap: true
        }),
        new OptimizeCSSAssetsPlugin({})
      ]
    }
  }
}
