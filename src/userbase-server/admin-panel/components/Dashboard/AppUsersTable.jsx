import React, { Component } from 'react'
import { string } from 'prop-types'
import dashboardLogic from './logic'
import UnknownError from '../Admin/UnknownError'

export default class AppUsersTable extends Component {
  constructor(props) {
    super(props)
    this.state = {
      error: '',
      activeUsers: [],
      deletedUsers: [],
      loading: true,
      showDeletedUsers: false
    }

    this.handleDeleteApp = this.handleDeleteApp.bind(this)
    this.handleDeleteUser = this.handleDeleteUser.bind(this)
    this.handlePermanentDeleteUser = this.handlePermanentDeleteUser.bind(this)
    this.handleShowDeletedUsers = this.handleShowDeletedUsers.bind(this)
    this.handleHideDeletedUsers = this.handleHideDeletedUsers.bind(this)
  }

  async componentDidMount() {
    this._isMounted = true

    const { appName } = this.props

    try {
      const appUsers = (await dashboardLogic.listAppUsers(appName))
        // sort by date in descending order
        .sort((a, b) => new Date(b['creation-date']) - new Date(a['creation-date']))

      const activeUsers = []
      const deletedUsers = []

      for (let i = 0; i < appUsers.length; i++) {
        const appUser = appUsers[i]

        try {
          appUser['formattedCreationDate'] = new Date(appUser['creation-date'])
            .toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: 'numeric',
              second: 'numeric',
              timeZoneName: 'short'
            })

          if (appUser['formattedCreationDate'] === new Date(appUser['creation-date']).toLocaleDateString()) {
            appUser['formattedCreationDate'] = appUser['creation-date']
          }
        } catch (e) {
          appUser['formattedCreationDate'] = appUser['creation-date']
        }

        if (appUser['deleted']) deletedUsers.push(appUser)
        else activeUsers.push(appUser)
      }

      if (this._isMounted) this.setState({ activeUsers, deletedUsers, loading: false })
    } catch (e) {
      if (this._isMounted) this.setState({ error: e.message, loading: false })
    }
  }

  componentWillUnmount() {
    this._isMounted = false
  }

  async handleDeleteApp() {
    const { appName } = this.props

    if (this._isMounted) this.setState({ loading: false })

    try {
      if (window.confirm(`Are you sure you want to delete app '${appName}'?`)) {
        await dashboardLogic.deleteApp(appName)
        window.location.hash = '' // eslint-disable-line require-atomic-updates
      }
    } catch (e) {
      if (this._isMounted) this.setState({ loading: false, error: e.message })
    }
  }

  async handleDeleteUser(user) {
    const { appName } = this.props
    const { activeUsers } = this.state

    const userId = user['user-id']
    const username = user['username']

    const getUserIndex = () => this.state.activeUsers.findIndex((user) => user['user-id'] === userId)

    try {
      if (window.confirm(`Are you sure you want to delete user '${username}'?`)) {

        activeUsers[getUserIndex()].deleting = true
        this.setState({ activeUsers })

        await dashboardLogic.deleteUser(userId, appName, username)

        if (this._isMounted) {
          const { activeUsers, deletedUsers } = this.state
          const userIndex = getUserIndex()

          // remove user from active users
          const deletedUser = activeUsers.splice(userIndex, 1)[0]
          deletedUser.deleting = undefined
          deletedUser.deleted = true

          let insertionIndex = deletedUsers.findIndex((user) => new Date(deletedUser['creation-date']) > new Date(user['creation-date']))
          if (insertionIndex === -1) {
            deletedUsers.push(deletedUser)
          } else {
            // insert into deleted users at insertion index
            deletedUsers.splice(insertionIndex, 0, deletedUser)
          }

          this.setState({ activeUsers, deletedUsers })
        }
      }
    } catch (e) {
      if (this._isMounted) {
        const { activeUsers } = this.state
        activeUsers[getUserIndex()].deleting = undefined
        this.setState({ error: e.message, activeUsers })
      }
    }
  }

  async handlePermanentDeleteUser(user) {
    const { appName } = this.props
    const { deletedUsers } = this.state

    const userId = user['user-id']
    const username = user['username']

    const getUserIndex = () => this.state.deletedUsers.findIndex((user) => user['user-id'] === userId)

    try {
      if (window.confirm(`Are you sure you want to permanently delete user '${username}'? There is no guarantee the account can be recovered after this.`)) {

        deletedUsers[getUserIndex()].permanentDeleting = true
        this.setState({ deletedUsers })

        await dashboardLogic.permanentDeleteUser(userId, appName, username)

        if (this._isMounted) {
          const { deletedUsers } = this.state
          const userIndex = getUserIndex()
          deletedUsers.splice(userIndex, 1)
          this.setState({ deletedUsers })
        }
      }
    } catch (e) {
      if (this._isMounted) {
        const { deletedUsers } = this.state
        deletedUsers[getUserIndex()].permanentDeleting = undefined
        this.setState({ error: e.message, deletedUsers })
      }
    }
  }

  handleShowDeletedUsers(e) {
    e.preventDefault()
    this.setState({ showDeletedUsers: true })
  }

  handleHideDeletedUsers(e) {
    e.preventDefault()
    this.setState({ showDeletedUsers: false })
  }

  render() {
    const { appName, paymentStatus } = this.props
    const { loading, activeUsers, deletedUsers, error, showDeletedUsers } = this.state

    return (
      <div className='text-xs xs:text-base'>

        <div className='container content'>

          <div className='flex mb-6'>
            <span className='flex-0'>{appName}</span>
            <div className='flex-1 text-right'>
              {
                paymentStatus === 'active'
                  ?
                  <input
                    className='btn w-32'
                    type='button'
                    value='Delete App'
                    onClick={this.handleDeleteApp}
                  />
                  :
                  <span className='italic font-light ml-3 text-red-600'>
                    {appName} app can only have 3 users
                  </span>
              }
            </div>
          </div>

          {loading
            ? <div className='text-center'><div className='loader w-6 h-6 inline-block' /></div>
            : (activeUsers && activeUsers.length) || (deletedUsers && deletedUsers.length)

              ?
              <div>
                {activeUsers && activeUsers.length > 0 &&
                  <div className='text-center'>
                    <table className='table-auto w-full border-collapse border-2 border-gray-500 mx-auto'>

                      <thead>
                        <tr>
                          <th className='border border-gray-400 px-4 py-2 text-gray-800'>Username</th>
                          <th className='border border-gray-400 px-4 py-2 text-gray-800'>Created</th>
                          <th className='border border-gray-400 px-4 py-2'></th>
                        </tr>
                      </thead>

                      <tbody>

                        {activeUsers.map((user) => (
                          <tr key={user['user-id']}>
                            <td className='border border-gray-400 px-4 py-2 font-light'>{user['username']}</td>
                            <td className='border border-gray-400 px-4 py-2 font-light'>{user['formattedCreationDate']}</td>
                            <td className='border border-gray-400 px-4 py-2 font-light'>

                              {user['deleting']
                                ? <div className='loader w-4 h-4 inline-block' />
                                : <div
                                  className='fas fa-trash-alt font-normal text-lg cursor-pointer text-yellow-700'
                                  onClick={() => this.handleDeleteUser(user)}
                                />
                              }

                            </td>
                          </tr>
                        ))}

                      </tbody>
                    </table>
                  </div>
                }

                {deletedUsers && deletedUsers.length > 0 &&
                  <div className='mt-6'>
                    <a className='select-none italic font-light cursor-pointer' onClick={showDeletedUsers ? this.handleHideDeletedUsers : this.handleShowDeletedUsers}>
                      {showDeletedUsers ? 'Hide' : 'Show'} users pending deletion
                    </a>

                    {showDeletedUsers &&

                      <table className='mt-6 text-center table-auto w-full border-collapse border-2 border-gray-500 mx-auto'>

                        <thead>
                          <tr>
                            <th className='border border-gray-400 px-4 py-2 text-gray-800'>Username</th>
                            <th className='border border-gray-400 px-4 py-2 text-gray-800'>Created</th>
                            <th className='border border-gray-400 px-4 py-2'></th>
                          </tr>
                        </thead>

                        <tbody>

                          {deletedUsers.map((user) => (
                            <tr key={user['user-id']}>
                              <td className='border border-gray-400 px-4 py-2 font-light text-red-700'>{user['username']}</td>
                              <td className='border border-gray-400 px-4 py-2 font-light'>{user['formattedCreationDate']}</td>
                              <td className='border border-gray-400 px-4 py-2 font-light'>

                                {user['permanentDeleting']
                                  ? <div className='loader w-4 h-4 inline-block' />
                                  : <div
                                    className='fas fa-trash-alt font-normal text-lg cursor-pointer text-yellow-700'
                                    onClick={() => this.handlePermanentDeleteUser(user)}
                                  />
                                }

                              </td>
                            </tr>
                          ))}

                        </tbody>
                      </table>
                    }
                  </div>
                }

              </div>

              : !error && <p className='italic font-light'>No users yet.</p>
          }

          {error && (
            error === 'Unknown Error'
              ? <UnknownError />
              : <div className='error'>{error}</div>
          )}

        </div>

      </div>
    )
  }
}

AppUsersTable.propTypes = {
  appName: string,
  paymentStatus: string
}
