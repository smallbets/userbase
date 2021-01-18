## What is Userbase?

Userbase is the easiest way to add user accounts and user data persistence to your static site. All Userbase features are accessible through a very simple [JavaScript SDK](https://userbase.com/docs/sdk/), directly from the browser.

## What is userbase-js-node?

For all who want to use the Userbase JavaScript SDK from node, this is the package for you. Some reasons you may find this package valuable:

- You want a super simple end-to-end encrypted backend for a node app.
- You want to share global data with users and implement custom access control.
- You're ok with a server having access to some user data, and want to take action using that data in real-time (e.g. CRON jobs, triggers, reports, etc.).

## How do I start?

The easiest way to start using Userbase is to create a [free Admin account](https://userbase.com) and follow the [Quickstart](https://userbase.com/docs/quickstart/) guide that shows you how to create a web app using Userbase.

If you don't like docs and want to jump right in after creating an admin account and getting your app ID, here's a quick script to get you started:

```
const userbase = require('userbase-js-node')

const main = async () => {
  await userbase.init({ appId: <Your App ID> })

  await userbase.signUp({ username: 'admin', password: '5Pnc3M^J^Q2$EegV' })

  await userbase.openDatabase({ databaseName: 'my-first-db', changeHandler: items => console.log(items) })

  await userbase.insertItem({ databaseName: 'my-first-db', item: 'Hello world!' })
}
main()
```

If you have any questions, or if there's anything we can do to help you with your app, please [get in touch](https://userbase.com/contact/). Thank you!

## License

This project is released under the [MIT License](https://github.com/smallbets/userbase/blob/master/LICENSE).
