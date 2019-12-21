module.exports = {
  entry: {
   main: './src/index.js'
  },
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
              ['@babel/plugin-transform-runtime', { corejs: 3, version: '^7.7.6' }]
            ]
          }
        }
      }
    ]
  }
}
