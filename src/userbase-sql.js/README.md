# Userbase + sql.js

End-to-end encrypted SQL! (still experimental)

## What is Userbase?

>[Userbase](https://userbase.com) is the easiest way to add user accounts and user data persistence to your static site. All Userbase features are accessible through a very simple JavaScript SDK, directly from the browser. No backend necessary.

## What is sql.js?

>[sql.js](https://github.com/sql-js/sql.js) is a javascript SQL database. It allows you to create a relational database and query it entirely in the browser... It uses a virtual database file stored in memory, and thus doesn't persist the changes made to the database.

## What is userbase-sql.js?

userbase-sql.js brings SQL to Userbase, and end-to-end encrypted persistence to sql.js (+ concurrent real-time updates across browsers). It wraps the Userbase JavaScript SDK database API with the sql.js API, exposing SQLite features to Userbase developers:

- Structure relational data
- Construct SQL queries
- Build indexes
- Maintain referential integrity
- Transactions across tables
- Uniqueness constraints across columns
- *etc.*

A single user can create as many of their own individual end-to-end encrypted sql.js databases as they want, and only they can access their own databases. The Userbase server handles ordering of writes to each individual database, and each database is completely partitioned from other databases on the server-side.

## Usage

### Installation

#### Create an admin account

First, you need to [create a free Userbase admin account](https://v1.userbase.com/#create-admin). No credit card required.

#### Install userbase-sql.js

Then, you need to include userbase-sql.js in your web app.

You can either use the npm package:

```
npm install userbase-sql.js
```

Or, you can include it with a `<script>` tag:

```
<script type="text/javascript" src="https://sql.userbase.com/0/userbase-sql.js"></script>
```

#### Set the App ID

In your admin account, you will find a Trial app. Get its App ID, and then in your browser code, initialize userbase-sql.js with it.

```
await userbaseSqlJs.init({ appId: 'YOUR_APP_ID' })
```

And you're now ready to use userbase-sql.js.

### Creating a user

You'll need to create a user to store data.

```
await userbaseSqlJs.signUp({ username: 'my_first_user', password: '1A$dHz9@leupyCns' })
```

### Now, the SQL

First register a changeHandler:

```
let sqlJsDb

// this creates the database on the server and connects the client to it for real-time updates
await userbaseSqlJs.openSqlJsDatabase({
  databaseName: 'my_secret_db',
  changeHandler: ({ db }) => {
    sqlJsDb = db
  }
})
```

Execute some sql:

```
const sql1 = "CREATE TABLE hello (a int PRIMARY KEY, b char);"
const sql2 = "INSERT INTO hello VALUES (0, 'hello');"
const sql3 = "INSERT INTO hello VALUES (1, 'world');"

// each SQL statement is encrypted and sent to the server for storage
await userbaseSqlJs.execSql({ databaseName: 'my_secret_db', sql: sql1 })

// the server then broadcasts the encrypted statement to all the user's connected clients
await userbaseSqlJs.execSql({ databaseName: 'my_secret_db', sql: sql2 })

// each client decrypts the statement, applies it to an in-memory sql.js database in the order set by the server,
// then calls the changeHandler with the updated sql.js database
await userbaseSqlJs.execSql({ databaseName: 'my_secret_db', sql: sql3 })
```

And read the result:

```
// read the global sql.js database updated by the changeHandler
const res = sqlJsDb.exec("SELECT * FROM hello")
/*
[
  {columns:['a','b'], values:[[0,'hello'],[1,'world']]}
]
*/
```

Every time the database grows a fixed amount, the client compresses and encrypts the entire sql.js database, and stores it on the server. When the user signs back in and loads their data, the client decrypts and decompresses that database, then applies any individual SQL statements that come after it. This all happens smoothly under the hood.

### Bind values

```
const sql = "INSERT INTO hello VALUES (?, ?);"
const bindValues = [2, '"foo"']
await userbaseSqlJs.execSql({ databaseName: 'my_secret_db', sql, bindValues })
```

```
const sql = "INSERT INTO hello VALUES ($a, $b);"
const bindValues = { $a: 3, $b: '"bar"' }
await userbaseSqlJs.execSql({ databaseName: 'my_secret_db', sql, bindValues })
```

See more on bind values [here](https://sql.js.org/documentation/Statement.html#%5B%22bind%22%5D).

### Transactions

```
const sqlStatements = [
  { sql: "INSERT INTO hello VALUES (?, ?);", bindValues: [4, 'duplicate'] },
  { sql: "INSERT INTO hello VALUES (?, ?);", bindValues: [4, 'duplicate'] }
]

try {
  // executes sqlStatements in sequential order, all-or-nothing inside a single transaction
  await userbaseSqlJs.execSql({ databaseName: 'my_secret_db', sqlStatements })
} catch (e) {
  // Error: UNIQUE constraint failed: hello.a
}

// sql.js database excludes both of the above SQL statements
const res = sqlJsDb.exec("SELECT * FROM hello");
```

## Additional helpful resources

- [Userbase docs](https://userbase.com/docs/)
- [sql.js website](https://sql.js.org/#/)
- [sql.js demo SQL interpreter](https://sql.js.org/examples/GUI/index.html)
- [sql.js API](https://sql.js.org/documentation/Database.html)
- [Simple todo app built with userbase-sql.js](./demo/index.html)
- [Advanced invoicing app built with userbase-sql.js](https://github.com/j-berman/prinvoice)

## License

This project is released under the [MIT License](LICENSE).
