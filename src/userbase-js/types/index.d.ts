// Expose as userbase when loaded in an IIFE environment
export as namespace userbase

export type UpdateUserHandler = (updatedUser: { user: UserResult }) => void

export interface Session {
  user?: UserResult
  lastUsedUsername?: string
}

export interface UserProfile {
  [key: string]: string
}

export type RememberMeOption = 'session' | 'local' | 'none'

export type PaymentsMode = 'disabled' | 'test' | 'prod'

export type SubscriptionStatus = 'active' | 'trialing' | 'incomplete' | 'incomplete_expired' | 'past_due' | 'canceled' | 'unpaid'

export type EncryptionMode = 'end-to-end' | 'server-side'

export interface UserResult {
  username: string
  userId: string
  authToken: string
  creationDate: Date
  paymentsMode: PaymentsMode
  trialExpirationDate?: Date
  subscriptionStatus?: SubscriptionStatus
  cancelSubscriptionAt?: Date
  email?: string
  profile?: UserProfile
  protectedProfile?: UserProfile
  usedTempPassword?: boolean
  passwordChanged?: boolean
  changePassword?: boolean
}

export type DatabaseChangeHandler = (items: Item[]) => void

export interface DatabasesResult {
  databases: Database[]
}

export interface Database {
  databaseName: string
  databaseId: string
  isOwner: boolean
  receivedFromUsername?: string
  readOnly: boolean
  resharingAllowed: boolean
  encryptionMode: EncryptionMode
  users: DatabaseUsers[]
}

export interface DatabaseUsers {
  username: string
  isOwner: boolean
  receivedFromUsername?: string
  readOnly: boolean
  resharingAllowed: boolean
  verified?: boolean
}

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
  createdBy: Attribution
  updatedBy?: Attribution
  fileId?: string
  fileName?: string
  fileSize?: number
  fileUploadedBy?: Attribution
}

export interface Attribution {
  timestamp: Date
  username?: string
  userDeleted?: boolean
}

export interface FileResult {
  file: File
}

export type FileUploadProgressHandler = (uploadProgress: { bytesTransferred: number }) => void

export interface CancelSubscriptionResult {
  cancelSubscriptionAt: Date
}

export type databaseNameXorId = ({ databaseId: string, databaseName?: never } | { databaseName: string, databaseId?: never });

export interface Userbase {
  init(params: { appId: string, updateUserHandler?: UpdateUserHandler, sessionLength?: number, allowServerSideEncryption?: boolean }): Promise<Session>

  signUp(params: { username: string, password: string, email?: string, profile?: UserProfile, rememberMe?: RememberMeOption, sessionLength?: number }): Promise<UserResult>

  signIn(params: { username: string, password: string, rememberMe?: RememberMeOption, sessionLength?: number }): Promise<UserResult>

  signOut(): Promise<void>

  updateUser(params: { username?: string, currentPassword?: string, newPassword?: string, email?: string | null, profile?: UserProfile | null }): Promise<void>

  deleteUser(): Promise<void>

  forgotPassword(params: { username: string }): Promise<void>

  openDatabase(params: databaseNameXorId & { changeHandler: DatabaseChangeHandler }): Promise<void>

  getDatabases(params?: databaseNameXorId): Promise<DatabasesResult>

  insertItem(params: databaseNameXorId & { item: any, itemId?: string }): Promise<void>

  updateItem(params: databaseNameXorId & { item: any, itemId: string }): Promise<void>

  deleteItem(params: databaseNameXorId & { itemId: string }): Promise<void>

  putTransaction(params: databaseNameXorId & { operations: DatabaseOperation[] }): Promise<void>

  uploadFile(params: databaseNameXorId & { itemId: string, file: File, progressHandler?: FileUploadProgressHandler }): Promise<void>

  getFile(params: databaseNameXorId & { fileId: string, range?: { start: number, end: number } }): Promise<FileResult>

  getVerificationMessage(): Promise<{ verificationMessage: string }>

  verifyUser(params: { verificationMessage: string }): Promise<void>

  shareDatabase(params: databaseNameXorId & { username: string, requireVerified?: boolean, readOnly?: boolean, resharingAllowed?: boolean }): Promise<void>

  modifyDatabasePermissions(params: databaseNameXorId & { username: string, readOnly?: boolean, resharingAllowed?: boolean, revoke?: boolean }): Promise<void>

  purchaseSubscription(params: { successUrl: string, cancelUrl: string }): Promise<void>

  cancelSubscription(): Promise<CancelSubscriptionResult>

  resumeSubscription(): Promise<void>

  updatePaymentMethod(params: { successUrl: string, cancelUrl: string }): Promise<void>
}

declare let userbase: Userbase

export default userbase
