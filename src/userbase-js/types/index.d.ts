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
  itemId?: string
  item: any
}

interface UpdateOperation {
  command: 'Update'
  itemId: string
  item: any
}

interface DeleteOperation {
  command: 'Delete'
  itemId: string
}

interface Item {
  itemId: string
  item: any
}

interface Userbase {
  init(params: { appId: string }): Promise<Session>

  signUp(params: { username: string, password: string, email?: string, profile?: UserProfile, rememberMe?: boolean }): Promise<UserResult>

  signIn(params: { username: string, password: string, rememberMe?: boolean }): Promise<UserResult>

  signOut(): Promise<void>

  updateUser(params: { username?: string, password?: string, email?: string | null, profile?: UserProfile | null }): Promise<void>

  deleteUser(): Promise<void>

  openDatabase(params: { databaseName: string, changeHandler: (items: Item[]) => void }): Promise<void>

  insertItem(params: { databaseName: string, item: any, itemId?: string }): Promise<void>

  updateItem(params: { databaseName: string, item: any, itemId: string }): Promise<void>

  deleteItem(params: { databaseName: string, itemId: string }): Promise<void>

  buildTransaction(params: { databaseName: string, operations: DatabaseOperation[] }): Promise<void>
}

declare let userbase: Userbase

export default userbase
