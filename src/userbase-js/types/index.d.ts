// Expose as userbase when loaded in an IIFE environment
export as namespace userbase

export interface Session {
  user?: UserResult
  lastUsedUsername?: string
}

export interface UserProfile {
  [key: string]: string
}

export interface UserResult {
  username: string
  email?: string
  profile?: UserProfile
}

export type DatabaseChangeHandler = (items: Item[]) => void

export type DatabaseOperation = InsertOperation | UpdateOperation | DeleteOperation

export interface InsertOperation {
  command: 'Insert'
  itemId?: string
  item: any
}

export interface UpdateOperation {
  command: 'Update'
  itemId: string
  item: any
}

export interface DeleteOperation {
  command: 'Delete'
  itemId: string
}

export interface Item {
  itemId: string
  item: any
}

export interface Userbase {
  init(params: { appId: string }): Promise<Session>

  signUp(params: { username: string, password: string, email?: string, profile?: UserProfile, rememberMe?: boolean }): Promise<UserResult>

  signIn(params: { username: string, password: string, rememberMe?: boolean }): Promise<UserResult>

  signOut(): Promise<void>

  updateUser(params: { username?: string, password?: string, email?: string | null, profile?: UserProfile | null }): Promise<void>

  deleteUser(): Promise<void>

  openDatabase(params: { databaseName: string, changeHandler: DatabaseChangeHandler }): Promise<void>

  insertItem(params: { databaseName: string, item: any, itemId?: string }): Promise<void>

  updateItem(params: { databaseName: string, item: any, itemId: string }): Promise<void>

  deleteItem(params: { databaseName: string, itemId: string }): Promise<void>

  buildTransaction(params: { databaseName: string, operations: DatabaseOperation[] }): Promise<void>
}

declare let userbase: Userbase

export default userbase
