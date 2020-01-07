module.exports = {
  "env": {
    "browser": true,
    "amd": true,
    "node": true,
    "jest": true,
    "es6": true
  },
  "plugins": ["react", "cypress"],
  "extends": [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:cypress/recommended"
  ],
  "rules": {
    "no-console": "off",
    "semi": [2, "never"]
  },
  "parser": "babel-eslint",
  "settings": {
    "react": {
      "version": "^16.8.6",
    }
  }
}
