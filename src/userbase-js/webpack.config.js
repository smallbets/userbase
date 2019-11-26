const path = require('path')
const TerserPlugin = require('terser-webpack-plugin')
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin')
const nodeExternals = require('webpack-node-externals')
const packageJson = require('./package.json')

module.exports = (env) => {

  const version = packageJson.version
  const buildType = env.BUILD_TYPE

  const output = {
    path: path.join(__dirname, `../../${buildType === 'sdk-script' ? 'build/script/' : 'npm_build/userbase-js/'}`),
    filename: buildType === 'sdk-script' ? `userbase-${version}.js` : 'index.js',
  }

  if (buildType === 'npm-package') {
    output.libraryTarget = 'umd' // makes default exportable
  }

  return {
    entry: {
      main: `../userbase-js/${buildType === 'sdk-script' ? 'userbase.js' : ''}`
    },
    output,
    target: buildType === 'sdk-script' ? 'web' : 'node',
    externals: buildType === 'npm-package'
      ? [nodeExternals()] // ignores node_modules
      : [],
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
