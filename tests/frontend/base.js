import { userInfo } from "os";

// describe('My First Test', function () {
//   it('Does not do much!', function () {
//     Cypress.$.getScript('https://userbase-public.s3-us-west-2.amazonaws.com/userbase-js/userbase.js', function () {
//       //alert("Script loaded but not necessarily executed.");
//     });
//     expect(true).to.equal(true);
//   })

// })

function loadScript(url, callback) {
  // Adding the script tag to the head as suggested before
  var head = document.head;
  var script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = url;

  // Then bind the event to the callback function.
  // There are several events for cross browser compatibility.
  script.onreadystatechange = callback;
  script.onload = callback;

  // Fire the loading
  head.appendChild(script);
}

loadScript("https://userbase-public.s3-us-west-2.amazonaws.com/userbase-js/userbase.js", myPrettyCode);


describe('It Logs the user', function () {
  it('set username correctly', function () {
    userbase.configure({ appId: 'a43ae910-fc89-43fe-a7a3-a11a53b49325' })
    // set the variable that will hold the data for the test
    let database = []

    // helper method to generate a random string
    const randomString = function () { return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) }

    // the function that gets called when the Userbase database gets updated
    const databaseChange = function (items) {
      // clear the database variable
      database = []

      // copy all the iterms to the database
      for (let i = 0; i < items.length; i++) {
        database.push(items[i])
      }
    }

    // generate a random username and password
    const username = randomString() + "-user"
    const password = randomString() + "-pass"


    userbase.signUp(username, password)
      .then((session) => {
        expect(session.username).to.equal(username);
        expect(session.signedIn).to.be.true;
      })
  })
})


var myPrettyCode = function () {

  userbase.configure({ appId: 'a43ae910-fc89-43fe-a7a3-a11a53b49325' })
  // set the variable that will hold the data for the test
  let database = []

  // helper method to generate a random string
  const randomString = function () { return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) }

  // the function that gets called when the Userbase database gets updated
  const databaseChange = function (items) {
    // clear the database variable
    database = []

    // copy all the iterms to the database
    for (let i = 0; i < items.length; i++) {
      database.push(items[i])
    }
  }

  // generate a random username and password
  const username = randomString() + "-user"
  const password = randomString() + "-pass"


  // sign up the user
  userbase.signUp(username, password)
    .then((session) => {
      // verify the session
      console.assert(session.username === username, 'username does not match')
      console.assert(session.signedIn, 'signedIn should be true')
      console.assert(session.seed, 'seed should not be empty')
      console.log('login successful', session)

      // open the database
      return userbase.openDatabase('test', databaseChange)
    })
    .then(() => console.log('database open successful'))
    // do some inserts
    .then(() => { return userbase.insert('test', { 'item': 'Item 1' }, '1') })
    .then(() => { return userbase.insert('test', { 'item': 'Item 2' }, '2') })
    .then(() => { return userbase.insert('test', { 'item': 'Item 3' }, '3') })
    .then(() => {
      // verify that the database contains all the inserted items
      console.log('inserts successful')
      console.assert(database.length === 3, 'database size should be 3')
      console.assert(database[0].record.item === 'Item 1', 'item 1 mismatch')
      console.assert(database[1].record.item === 'Item 2', 'item 2 mismatch')
      console.assert(database[2].record.item === 'Item 3', 'item 3 mismatch')
      console.log('all items found')
    })

};
