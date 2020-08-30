node ./test/genLoginInfo.js

rsync -am ./src/userbase-js/dist/ ./test/browser1/tmp/
cp -rf ./test/development.js ./test/browser1/tmp/development.js
cp -rf ./test/loginInfo.js ./test/browser1/tmp/loginInfo.js

rsync -am ./src/userbase-js/dist/ ./test/browser2/tmp/
cp -rf ./test/development.js ./test/browser2/tmp/development.js
cp -rf ./test/loginInfo.js ./test/browser2/tmp/loginInfo.js

echo "\n\n\n  ************  \n\n\n   Open localhost:3000 and localhost:3001 in your browser!\n\n\n  ************  \n\n\n"

npx http-server ./test/browser1 -c-1 -p 3000 &
npx http-server ./test/browser2 -c-1 -p 3001
