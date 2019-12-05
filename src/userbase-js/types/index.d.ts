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
  key: string
  email?: string
  profile?: UserProfile
}

type KeyNotFoundHandler = (username: string, deviceId: string) => void

type ShowKeyHandler = (seedString: string, rememberMe: boolean, backUpKey: boolean) => void | Promise<void>

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
  init(options: { appId: string, endpoint?: string, keyNotFoundHandler?: KeyNotFoundHandler }): Promise<Session>

  signUp(username: string, password: string, email?: string, profile?: UserProfile, showKeyHandler?: ShowKeyHandler, rememberMe?: boolean, backUpKey?: boolean): Promise<UserResult>

  signIn(username: string, password: string, rememberMe?: boolean): Promise<UserResult>

  signOut(): Promise<void>

  forgotPassword(username: string): Promise<void>

  updateUser(user: { username?: string, password?: string, email?: string | null, profile?: UserProfile | null }): Promise<void>

  deleteUser(): Promise<void>

  importKey(keyString: string): Promise<void>

  getLastUsedUsername(): string | undefined

  openDatabase(dbName: string, changeHandler: (items: Item[]) => void): Promise<void>

  insertItem(dbName: string, item: any, id?: string): Promise<void>

  updateItem(dbName: string, item: any, id: string): Promise<void>

  deleteItem(dbName: string, id: string): Promise<void>

  transaction(dbName: string, operations: DatabaseOperation[]): Promise<void>
}

declare let userbase: Userbase

export default userbase
