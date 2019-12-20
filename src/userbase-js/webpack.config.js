const path = require('path')

module.exports = {
  entry: {
    main: './src/index.js'
  },
  output: {
    path: path.join(__dirname, 'dist'),
    filename: `userbase.js`,
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
