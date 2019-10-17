module.exports = {
  theme: {
    container: {
      center: true,
    },
    screens: {
      'xs': '350px',
      'sm': '500px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px'
    },
    extend: {
      colors: {
        primary: '#ffe77a',
        secondary: '#ffd005'
      },
      screens: {
        // for devices with the ability to hover
        'mouse': { 'raw': '(hover)' },
      }
    }
  },
  variants: {},
  plugins: []
}
