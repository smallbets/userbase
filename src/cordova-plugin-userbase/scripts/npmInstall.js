const child_process = require('child_process')

// run the command `npm install` so that userbase-js installs
child_process.execSync('npm install', {
  // print output
  stdio: [process.stdin, process.stdout, process.stderr]
})