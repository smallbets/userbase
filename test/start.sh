node ./test/genLoginInfo.js

rsync -am ./src/userbase-js/dist/ ./test/browser1/tmp/
cp -rf ./test/development.js ./test/browser1/tmp/development.js
cp -rf ./test/loginInfo.js ./test/browser1/tmp/loginInfo.js

rsync -am ./src/userbase-js/dist/ ./test/browser2/tmp/
cp -rf ./test/development.js ./test/browser2/tmp/development.js
cp -rf ./test/loginInfo.js ./test/browser2/tmp/loginInfo.js

npx http-server ./test/browser1 -o -c-1 -p 3000 &
npx http-server ./test/browser2 -o -c-1 -p 3001
