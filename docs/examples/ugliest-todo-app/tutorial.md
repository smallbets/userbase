# Tutorial: Intro to Userbase

This tutorial doesn't assume any existing Userbase knowledge.


## Table of Contents

1. [Before we get started](#before-we-get-started)
  1. [Prerequisites](#prerequisites)
  2. [What's in a name](#whats-in-a-name)
  3. [What is Userbase?](#what-is-userbase)
  4. [Getting help](#getting-help)
2. [Setup](#setup)
  1. [Create project file](#create-project-file)
  2. [Create a Userbase App](#create-a-userbase-app) 
3. [Building the application](#building-the-application)
  1. [Loading the Userbase client](#loading-the-userbase-client)
  2. [Configuring the Userbase client](#configuring-the-userbase-client)
  3. [Registering new users](#registering-new-users)
  4. [Signing in users](#signing-in-users)
  5. [Display a different view after a user signs in](#display-a-different-view-after-a-user-signs-in)
  6. [Connecting to the database](#connecting-to-the-database)
  7. [Displaying the to-dos](#displaying-the-to-dos)
  8. [Adding to-dos](#adding-to-dos)
  7. [Updating to-dos](#updating-to-dos)
  8. [Deleting to-dos](#deleting-to-dos)
  9. [Automatically resuming a session](#automatically-resuming-a-session)
  10. [Signing out users](#signing-out-users)
4. [Next Steps](#next-steps)


## Before we get started

In this tutorial we will build a simple to-do app. Even if the app you are
building has nothing to do with to-dos, the techniques we'll cover can be
applied to make all kinds of apps.

With just 199 lines code inside a single static HTML file we will create an
end-to-end encrypted web application with:

- user sign up, sign in and sign out
- user data persistence
- E2E encryption of user data
- live data synchornization across sessions

You can see a live demo of what we'll building [here](https://ugliest-todo.netlify.com/). 


### Prerequisites

You'll need to be familiar with HTML and JavaScript. Beyond the [basics of JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/A_re-introduction_to_JavaScript), you will need to be familiar with [DOM manipulation](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Client-side_web_APIs/Manipulating_documents#Active_learning_Basic_DOM_manipulation), [events](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events), and [Promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises).


### What's in a name

The reason we are calling our application "Ugly To-Do" is because we aren't
going to apply any styling but solely focus on core functionality. You can think
of this tutorial as a sort of "hello world" for Userbase, a demonstration of the
core functionality in the simplest way possible.

What this tutorial is not is a complete guide on how to build a real-world
application with Userbase. In a real project you'll likely want a more
sophisticated approach: for instance, you may use React to control the DOM or a
module bundler to package your application from multiple files, and at the very
least you'll want to display better error messages and add some styling.

We are working on a collection of tutorials and sample applications that will
show you how to do all these things with Userbase and more. You can [subscribe
to our mailing list](https://userbase.dev/mailing-list) to get updates on these
and more.


### What is Userbase?

*If you are already familiar with Userbase feel free to [skip ahead](#setup).*

Userbase is a database and backend service, purpose-built for web apps. It
enables you to write secure and GDPR-compliant web apps using only JavaScript,
HTML, and CSS.

Normally when you build a web app you'd provision a database for storing data
and deploy a backend to handle user accounts and surface an API for securely
loading and persisting data.

With Userbase, all this is handled for you, letting you build rich web
applications that:
  - don't require you to write any backend code
  - don't require you to manage a database
  - have radically simple deployment process
  - are end-to-end encrypted and GDPR-compliant
  - are ready to scale to millions of users
  - keep things really simple


## Setup

Let's get setup to build our application.


### Create project file 

Open up a new file in your favorite editor:

`vim ulgy-todo.html`

And add some boilerplate HTML:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Ugly To-Do</title>
  </head>

  <body>
    <!-- application code -->
    <script type="text/javascript">
    </script>
  </body>
</html>
```

Now open up this file in the web browser of your choosing, at this point all
you'll see is a blank page. As we add functionality throughout the tutorial, you
can reload the app by refreshing this page to see changes.


### Create a Userbase App

To complete this tutorial, you'll need to create a Userbase App. Create a free
developer App (here)[https://demo.encrypted.dev/admin/#create-admin] and take
note of its ID.


### Getting help

If you get stuck during the tutorial, you can tweet us at
[@UserbaseHQ](https://twitter.com/userbasehq).


## Building the app

We are now ready to start building the application. We'll start by implementing
functionality to sign up and sign in users and then implement to-do
functionality.

 
### Loading the Userbase client

To use the Userbase JavaScript SDK (from here on referred to as the "Userbase
client") on our page, we'll load it from a CDN with a script tag in the head of
our page: 

```diff
   <head>
     <meta charset="UTF-8">
     <title>Ugliest To-Do App</title>
+    <script type="text/javascript" src="https://userbase-public.s3-us-west-2.amazonaws.com/userbase-js/userbase.js"></script>
   </head>
```

The Userbase client will now be accessible via the global `userbase` variable.


### Configuring the Userbase client

Before doing anything with the Userbase client, we need to configure it with our
app ID (make sure to replace YOUR_APP_ID with the ID of the Userbase App you
created earlier):

```diff
   <head>
     <meta charset="UTF-8">
     <title>Ugliest To-Do App</title>
     <script type="text/javascript" src="https://userbase-public.s3-us-west-2.amazonaws.com/userbase-js/userbase.js"></script>
+    <script type="text/javascript">
+      userbase.configure({ appId: 'YOUR_APP_ID' })
+    </script>
   </head>
```

Now anything we do with the client (e.g. sign in a user, persist data) will
happen within the context of the app whose ID we specified.


### Registering new users 

Since we're building an end-to-end encrypted app, the actions our users take
will need to take place within an authenticated session. We'll start off by
adding a way to for new users to create an account for our app.

First, we'll add a sign up form:

```diff
   <body>
+    <!-- Auth View -->
+    <div id="auth-view">
+      <h1>Create an account</h1>
+      <form id="create-account-form">
+        <input id="create-account-username" type="email" required placeholder="Email">
+        <input id="create-account-password" type="password" required placeholder="Password">
+        <input type="submit" value="Create an account">
+      </form>
+      <div id="create-account-error"></div>
+    </div>
+
     <!-- application code -->
     <script type="text/javascript"></script>
   </body>
```

Then, we'll add code to handle the form submissions:

```diff
     <!-- application code -->
     <script type="text/javascript">
+      function handleCreateAccount(e) {
+        e.preventDefault()
+
+        const username = document.getElementById('create-account-username').value
+        const password = document.getElementById('create-account-password').value
+
+        userbase.signUp(username, password)
+          .then((session) => alert('You signed up!'))
+          .catch((e) => document.getElementById('create-account-error').innerHTML = e)
+      }
+
+      document.getElementById('create-account-form').addEventListener('submit', handleCreateAccount)
     </script>
```

Whenever a submit event is triggered on our sign up form, `handleCreateAccount`
will be called.

The first thing we do in `handleCreateAccount` is call `preventDefault()` on the
submit event that is passed in as the only parameter. This will prevent the page
from submitting to the server.

Next we get the values of the email and password inputs and call
`userbase.signUp(username, password)` which will request a new account to be
created with the Userbase service. A Promise is returned that either resolves
with a new session object, in which case we fire an alert (for now), or rejects
with an error, in which case we display the error message.

Remember, since we configured the Userbase client this will create a new user
account within the app whose ID we specified above.

Go ahead and reload the web app in your browser. Enter an email and password
in the form under "Sign Up" and submit. You'll get an alert saying "You signed
up!".

Now try signing up for another account using the same email and you'll see an
error message displayed under the form (since an account already exists with
this username).

We'll come back in a bit and change this function to do something more
interesting than just sending an alert when an user successfully signs up.


### Signing in users

Now that users can create accounts, let's give them the ability to sign in.

First, we'll add a new form to the page for signing in users under our "Sign Up"
form:

```diff
   <body>
     <!-- Auth View -->
     <div id="auth-view">
+      <h1>Login</h1>
+      <form id="login-form"> 
+        <input id="login-username" type="email" required placeholder="Email">
+        <input id="login-password" type="password" required placeholder="Password">
+        <input type="submit" value="Sign in">
+      </form>
+      <div id="login-error"></div>
+
       <h1>Create an account</h1>
       <form id="create-account-form">
```

Then, we'll add code to handle the form submission:

```diff
     <!-- application code -->
     <script type="text/javascript">
+      function handleLogin(e) {
+        e.preventDefault()
+
+        const username = document.getElementById('login-username').value
+        const password = document.getElementById('login-password').value
+
+        userbase.signIn(username, password)
+          .then((session) => alert('You signed in!'))
+          .catch((e) => document.getElementById('login-error').innerHTML = e)
+      }
+
       function handleCreateAccount(e) {
         e.preventDefault() 
```

And finally, send submit events to our handler:

```diff
           .catch((e) => document.getElementById('create-account-error').innerHTML = e)
       }
 
+      document.getElementById('login-form').addEventListener('submit', handleLogin)
       document.getElementById('create-account-form').addEventListener('submit', handleCreateAccount)
     </script>
   </body>
```

You'll notice this looks very similar to the sign up code above.

We define a function,`handleLogin`, to handle form submissions. The function
prevents the default form behavior, extracts the input values from the DOM, and
calls `userbase.signIn(username, password)`. This will attemp to sign in the
user with the Userbase service, handling a success with an alert and a failure
by displaying the error.

Reload the app and you'll now see a "Sign In" form. Enter the username and
password you used to create an account in the step above and submit the form.
You'll get an alert saying "You signed in!".

Try submitting the form again with incorrect credentials and you'll see an error
message displayed under the form.


### Display a different view after a user signs in

After a user is signs in, we'll want to hide the authentication forms, indicate
to the user they are signed in, and display their to-do list.

First, we'll add a new container to the body:

```diff
       <div id="create-account-error"></div>
     </div>
 
+    <!-- To-dos View -->
+    <div id="todo-view">
+      <div id="username"></div>
+
+      <h1>To-Do List</h1>
+    </div>
+
     <!-- application code -->
     <script type="text/javascript">
       function handleLogin(e) {
```

Then, we'll add function to display this view and initially make it hidden:

```diff
           .catch((e) => document.getElementById('create-account-error').innerHTML = e)
       }
 
+      function showTodos(username) {
+        document.getElementById('auth-view').style.display = 'none'
+        document.getElementById('todo-view').style.display = 'block'
+        document.getElementById('username').innerHTML = username
+      }
+
       document.getElementById('login-form').addEventListener('submit', handleLogin)
       document.getElementById('create-account-form').addEventListener('submit', handleCreateAccount)
+
+      document.getElementById('todo-view').style.display = 'none'
     </script>
   </body>
 </html>
```

Now that we have a function to show a view for signed in users, let's change
`handleLogin` and `handleCreateAccount` to call this function when they succeed:

```diff
       function handleLogin(e) {
         e.preventDefault()

         const password = document.getElementById('login-password').value

         userbase.signIn(username, password)
-          .then((session) => alert('You signed in!'))
+          .then((session) => showTodos(session.username))
           .catch((e) => document.getElementById('login-error').innerHTML = e)
       }
``` 

```diff
       function handleCreateAccount(e) {
         e.preventDefault()

         const password = document.getElementById('create-account-password').value

         userbase.signUp(username, password)
-          .then((session) => alert('You signed up!'))
+          .then((session) => showTodos(session.username))
           .catch((e) => document.getElementById('create-account-error').innerHTML = e)
       }
```

Reload the app and sign in using your username and password. You'll see the
authentication view disappear and your username show up along with "To-Do List".


### Connecting to the database

Each time a new session is started, we need to establish a connection with the
database that will hold that user's to-dos. 

First, let's add a couple elements for showing a loading indicator and error
messages:

```diff
     <div id="todo-view">
       <div id="username"></div>
 
       <h1>To-Do List</h1>
+      <div id="todos"></div>
+      <div id="db-loading">Loading to-dos...</div>
+      <div id="db-error"></div>
     </div>
```

Then, we'll change `showTodos` to open a new database with the Userbase service:

```diff

diff --git a/here.html b/there.html
       function showTodos(username) {
         document.getElementById('auth-view').style.display = 'none'
         document.getElementById('todo-view').style.display = 'block'
+        
+        // reset the todos view
         document.getElementById('username').innerHTML = username
+        document.getElementById('db-loading').style.display = 'block'
+        document.getElementById('db-error').innerText = ''
+
+        userbase.openDatabase('todos', handleDatabaseChange)
+          .then(() => {
+            document.getElementById('db-loading').style.display = 'none'
+          })
+          .catch((e) => {
+            document.getElementById('db-loading').style.display = 'none'
+            document.getElementById('db-error').innerText = e
+          })
       }
 
+      function handleDatabaseChange(items) {
+        const todosList = document.getElementById('todos')
+
+        if (items.length === 0) {
+          todosList.innerText = "Empty"
+        } else {
+          // render to-dos, not yet implemented
+        }
+      }      
+
       document.getElementById('login-form').addEventListener('submit', handleLogin)
       document.getElementById('create-account-form').addEventListener('submit', handleCreateAccount)
```

We change `showTodos` to make a call to `userbase.openDatabase('todos',
handleDatabaseChange)`, `'todos'` being the name of the database we want to open
and `handleDatabaseChange` being a callback for receiving changes to data in the
database. The Userbase service will attempt to open the user's database by the
name of `'todos'` (creating it if it doesn't already exist). After the `'todos'`
database is opened, and whenever data changes in the database, our callback
function `handleDatabaseChanges` will be called. A Promise is returned that will
either resolve if the database was successfully opened, in which case we hide
the loading indicator, or otherwise reject, in which case we display the error
message.

We add a function `handleDatabaseChange` for receiving changes to the database.
We check to see if there are any items in the database and if it's empty we display
this in the to-dos container. We'll implement the other case in the next step.

Reload the app and sign in. You'll see the "Loading to-dos..." as a connection
to the database is established followed by "Empty" indicating there are
currently no to-dos.


### Display the to-dos

If the database has items in it, we'll want to render those under to-do list.
Let's implement that case in `handleDatabaseChange`:

```diff
       function handleDatabaseChange(items) {
         const todosList = document.getElementById('todos')
 
         if (items.length === 0) {
           todosList.innerText = "Empty"
         } else {
-          // render to-dos, not yet implemented
+          // clear the list
+          todosList.innerHTML = ''
+
+          // render all the to-do items
+          for (let i = 0; i < items.length; i++) {
+
+            // build the todo label
+            const todoLabel = document.createElement('label')
+            todoLabel.innerHTML = items[i].record.todo
+            todoLabel.style.textDecoration = items[i].record.complete ? 'line-through' : 'none'
+
+            // append the todo item to the list
+            const todoItem = document.createElement('div')
+            todoItem.appendChild(todoLabel)
+            todosList.appendChild(todoItem)
+          }
         }
       }      
```


### Adding to-dos

Let's add a form for creating new to-dos:

```diff
     <!-- To-dos View -->
     <div id="todo-view">
       <div id="username"></div>

       <h1>To-Do List</h1>
       <div id="todos"></div>
       <div id="db-loading">Loading to-dos...</div>
       <div id="db-error"></div>
+
+      <form id="add-todo-form"> 
+        <input id="add-todo" type="text" required placeholder="To-Do">
+        <input type="submit" value="Add">
+      </form>
+      <div id="add-todo-error"></div>
     </div>
```

Then, add code to handle form submissions:

```diff
         }
       }      
 
+      function addTodoHandler(e) {
+        e.preventDefault()
+
+        const todo = document.getElementById('add-todo').value
+
+        userbase.insert('todos', { 'todo': todo }, Date.now())
+          .then(() => document.getElementById('add-todo').value = '')
+          .catch((e) => document.getElementById('add-todo-error').innerHTML = e)
+      }
+
       document.getElementById('login-form').addEventListener('submit', handleLogin)
       document.getElementById('create-account-form').addEventListener('submit', handleCreateAccount)
-
+      document.getElementById('add-todo-form').addEventListener('submit', addTodoHandler)
       document.getElementById('todo-view').style.display = 'none'
     </script>
   </body>
```

In `addTodoHandler` we first call `e.preventDefault()` to stop the default form
behavior, pull the to-do text from the input, and then call `userbase.insert`
with the database name, object we want the persist, and the current time. This
will return a Promise that will resolve if the data is successfully persisted to
the database, in which case we clear the form input, or reject if the insert
failed, in which case we display the error message below the form.


### Updating to-dos

Let's modify how we are rendering a to-do so we can mark a to-do as completed:

```diff
           // render all the to-do items
           for (let i = 0; i < items.length; i++) {
 
+            // build the todo checkbox
+            const todoBox = document.createElement('input')
+            todoBox.type = 'checkbox'
+            todoBox.id = items[i].itemId
+            todoBox.checked = items[i].record.complete ? true : false
+            todoBox.onclick = (e) => {
+              e.preventDefault()
+              userbase.update('todos', { 'todo': items[i].record.todo, 'complete': !items[i].record.complete }, items[i].itemId)
+                .catch((e) => document.getElementById('add-todo-error').innerHTML = e)
+            }
+
             // build the todo label
             const todoLabel = document.createElement('label')
             todoLabel.innerHTML = items[i].record.todo
@@ -129,6 +140,7 @@
 
             // append the todo item to the list
             const todoItem = document.createElement('div')
+            todoItem.appendChild(todoBox)
             todoItem.appendChild(todoLabel)
             todosList.appendChild(todoItem)
           }
```


### Deleting to-dos

Let's create a button for deleting a to-do:

```diff
           // render all the to-do items
           for (let i = 0; i < items.length; i++) {
 
+            // build the todo delete button
+            const todoDelete = document.createElement('button')
+            todoDelete.innerHTML = 'X'
+            todoDelete.style.display = 'inline-block'
+            todoDelete.onclick = () => {
+              userbase.delete('todos', items[i].itemId)
+                .catch((e) => document.getElementById('add-todo-error').innerHTML = e)
+            }
+
             // build the todo checkbox
             const todoBox = document.createElement('input')
             todoBox.type = 'checkbox'
```

And append the delete button to to-do element:

```diff
             // append the todo item to the list
             const todoItem = document.createElement('div')
+            todoItem.appendChild(todoDelete)
             todoItem.appendChild(todoBox)
             todoItem.appendChild(todoLabel)
             todosList.appendChild(todoItem)
```


### Polishing up

Before we wrap up, let's add two final pieces of account functionality: user
logout and automatic login for users who already have a session.


### Signing out users

First, add a logout button along with a container for displaying error messages:

```diff
     <!-- To-dos View -->
     <div id="todo-view">
       <div id="username"></div>
+      <input type="button" value="Logout" id="logout-button">
+      <div id="logout-error"></div>
 
       <h1>To-Do List</h1>
       <div id="todos"></div>
```

Then, add code to handle click events and log out the user:

```diff
           .catch((e) => document.getElementById('create-account-error').innerHTML = e)
       }
 
+      function handleLogout() {
+        userbase.signOut()
+          .then(() => showAuth())
+          .catch((e) => document.getElementById('logout-error').innerText = e)
+      }
+
       function showTodos(username) {
         document.getElementById('auth-view').style.display = 'none'
         document.getElementById('todo-view').style.display = 'block'
```

```diff
           })
       }
 
+      function showAuth() {
+        document.getElementById('todo-view').style.display = 'none'
+        document.getElementById('auth-view').style.display = 'block'
+        document.getElementById('login-username').value = ''
+        document.getElementById('login-password').value = ''
+        document.getElementById('login-error').innerText = ''
+        document.getElementById('create-account-username').value = ''
+        document.getElementById('create-account-password').value = ''
+        document.getElementById('create-account-error').innerText = ''
+      }
+
       function handleDatabaseChange(items) {
         const todosList = document.getElementById('todos')
```

```diff
       document.getElementById('login-form').addEventListener('submit', handleLogin)
       document.getElementById('create-account-form').addEventListener('submit', handleCreateAccount)
       document.getElementById('add-todo-form').addEventListener('submit', addTodoHandler)
+      document.getElementById('logout-button').addEventListener('click',
handleLogout)
       document.getElementById('todo-view').style.display = 'none'
     </script>
   </body>
```

The `logout` function calls `userbase.signOut` which sends a request to end the
user's session to the Userbase service. A Promise is returned that either
resolves if the user was signed out successfully, in which case we hide the
to-do view and show the account view using `showAuth`, or rejects with an error,
in which case we display the error message.


### Automatically resuming a session 

Whenever a new session is created, either by signing up or signing in a user,
the Userbase client will store information about the session in browser storage
to allow for the session to be resumed when the user returns after having
navigating away, whether by closing the page or otherwise.

Let's modify our app to automatically sign in a user when the page loads. We'll
add a view that indicates we are signing in the user:

Add add a view to show when initializing:

```diff
   </head>
 
   <body>
+    <!-- Init View -->
+    <div id="init-view">Signing you in...</div>
+
     <!-- Auth View -->
     <div id="auth-view">
       <h1>Login</h1>
```

In order to automatically resume a session if one is available, we add the
following to our application code:

```diff
       document.getElementById('login-form').addEventListener('submit', handleLogin)
       document.getElementById('create-account-form').addEventListener('submit', handleCreateAccount)
       document.getElementById('add-todo-form').addEventListener('submit', addTodoHandler)
+      document.getElementById('logout-button').addEventListener('click', handleLogout)
+
       document.getElementById('todo-view').style.display = 'none'
+      document.getElementById('auth-view').style.display = 'none'
+
+      userbase.signInWithSession()
+        .then((session) => showTodos(session.username))
+        .catch(() => showAuth())
+        .then(() => document.getElementById('init-view').style.display = 'none')
+
     </script>
   </body>
 </html>
```

We hide the auth view initially, as we'll now only show it if an existing
session can't be resumed.

We make a call to `userbase.signInWithSession` to attempt to sign in the user
using an existing session as soon as our app loads.

This function looks for a previous session in browser storage and if one is
found tries to sign in the user automatically with the Userbase service. It
returns a Promise that will resolve with a new session if the user was able to
be signed in or otherwise reject with ann error message? indicating the reason
for failure. 

A failure could be due to either no previous session, the user had
signed out, or their session expired. In our simple app we'll just send the user
to the sign in page regardless of the reason.


## Next Steps

That's it!
