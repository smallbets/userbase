export as namespace Userbase;

/* auth */

export interface Session {
  sessionId: string
  creationDate: string
}

export interface UserProfile {
  [key: string]: string
}

export interface UserResult {
  username: string
  key: string
  email?: string
  profile?: UserProfile
}

export function init(options: { appId: string, endpoint?: string, keyNotFoundHandler?: () => void }): Promise<Session>
export function signUp(username: string, password: string, email: string | null, profile: UserProfile | null, showKeyHandler: () => void | null, rememberMe: boolean): Promise<UserResult>
export function signIn(username: string, password: string, rememberMe: boolean): Promise<UserResult>
export function signOut(): Promise<void>
export function forgotPassword(username: string): Promise<void>
export function updateUser(user: { username?: string, password?: string, email?: string, profile?: UserProfile }): Promise<void>
export function importKey(keyString: string): Promise<void>
export function getLastUsedUsername(): string | undefined

/* db */

export type DatabaseOperation = InsertOperation | UpdateOperation | DeleteOperation

export interface InsertOperation {
  command: 'Insert'
  id: string
  item: any
}

export interface UpdateOperation {
  command: 'Update'
  id: string
  item: any
}

export interface DeleteOperation {
  command: 'Delete'
  id: string
}

export function openDatabase(dbName: string, changeHandler: () => any[]): Promise<void>
export function insert(dbName: string, item: any, id: string): Promise<void>
export function update(dbName: string, item: any, id: string): Promise<void>
export function transaction(dbName: string, operations: DatabaseOperation[]): Promise<void>
