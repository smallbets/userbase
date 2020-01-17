// Expose as userbase when loaded in an IIFE environment
export as namespace userbase;

interface Session {
  user?: UserResult
  lastUsedUsername?: string
}

interface UserProfile {
  [key: string]: string
}

interface UserResult {
  username: string
  email?: string
  profile?: UserProfile
}

type DatabaseOperation = InsertOperation | UpdateOperation | DeleteOperation

interface InsertOperation {
  command: 'Insert'
  id?: string
  item: any
}

interface UpdateOperation {
  command: 'Update'
  id: string
  item: any
}

interface DeleteOperation {
  command: 'Delete'
  id: string
}

interface Item {
  itemId: string
  item: any
}

interface Userbase {
  init(options: { appId: string, endpoint?: string }): Promise<Session>

  signUp(username: string, password: string, email?: string, profile?: UserProfile, rememberMe?: boolean): Promise<UserResult>

  signIn(username: string, password: string, rememberMe?: boolean): Promise<UserResult>

  signOut(): Promise<void>

  updateUser(user: { username?: string, password?: string, email?: string | null, profile?: UserProfile | null }): Promise<void>

  deleteUser(): Promise<void>

  openDatabase(dbName: string, changeHandler: (items: Item[]) => void): Promise<void>

  insertItem(dbName: string, item: any, id?: string): Promise<void>

  updateItem(dbName: string, item: any, id: string): Promise<void>

  deleteItem(dbName: string, id: string): Promise<void>

  buildTransaction(dbName: string, operations: DatabaseOperation[]): Promise<void>
}

declare let userbase: Userbase

export default userbase
