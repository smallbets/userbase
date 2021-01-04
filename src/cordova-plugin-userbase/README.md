# Create secure and private mobile apps using only static JavaScript, HTML, and CSS — and Cordova

## What is Userbase?

Userbase is the easiest way to add user accounts and user data persistence to your ~~static site~~ <b>Cordova mobile app</b>. All Userbase features are accessible through a very simple [JavaScript SDK](https://userbase.com/docs/sdk/). No backend necessary.

## What is Cordova?

Cordova is a tool to create mobile apps with JavaScript, HTML, and CSS. You can use it to turn your web app into a mobile app.

## Installation

If you're experienced with Cordova already, feel free to follow the quickstart instructions below. If you're new to Cordova, we recommend checking out this [more detailed guide](https://github.com/smallbets/userbase-samples/tree/master/ugliest-todo-cordova) that shows you how to create an ugly Cordova to-do app from scratch using Userbase.

#### Create an admin account

First, you need to [create a free Userbase admin account](https://v1.userbase.com/#create-admin). No credit card required.

#### Install the plugin

The plugin can be installed via the Cordova command line interface:

```
cordova plugin add cordova-plugin-userbase
```

The Userbase SDK will then be available globally at `window.userbase`.

#### Set the App ID

In your admin account, you will find a Trial app. Get its App ID, and initialize the Userbase SDK with it.

```
userbase.init({ appId: 'YOUR_APP_ID' })
```

And you're all set. You can now proceed to the [SDK section](https://userbase.com/docs/sdk/) of the docs.

## Why do I need a Cordova plugin to use Userbase with Cordova?

If you try to use Userbase in a Cordova app without the plugin, you'll notice that signing up and signing in are extraordinarily slow. This is because Userbase uses [scrypt](https://tools.ietf.org/html/rfc7914) to hash passwords, and pure JS Scrypt implementations happen to be extraordinarily slow in Cordova apps. This plugin forked the [cordova-plugin-scrypt](https://github.com/Crypho/cordova-plugin-scrypt), which uses native C to run Scrypt, thus enabling a more normal sign up/sign in time in Cordova apps.

## License

This project is released under the [MIT License](https://github.com/encrypted-dev/userbase/blob/master/LICENSE).
