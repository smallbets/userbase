import React, { Component } from 'react'
import { string } from 'prop-types'
import dashboardLogic from './logic'

export default class AppUsersTable extends Component {
  constructor(props) {
    super(props)
    this.state = {
      error: '',
      appUsers: [],
      loading: true
    }

    this.handleDeleteApp = this.handleDeleteApp.bind(this)
    this.handleDeleteUser = this.handleDeleteUser.bind(this)
  }

  async componentDidMount() {
    this._isMounted = true

    const { appName } = this.props

    try {
      const appUsers = await dashboardLogic.listAppUsers(appName)
      if (this._isMounted) this.setState({ appUsers, loading: false })
    } catch (e) {
      if (this._isMounted) this.setState({ error: e, loading: false })
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
      if (this._isMounted) this.setState({ loading: false, error: e })
    }
  }

  async handleDeleteUser(user) {
    const { appName } = this.props
    const { appUsers } = this.state

    const userId = user['user-id']
    const username = user['username']

    const getUserIndex = () => this.state.appUsers.findIndex((appUser) => appUser['user-id'] === userId)

    try {
      if (window.confirm(`Are you sure you want to delete user '${username}'?`)) {

        appUsers[getUserIndex()].deleting = true
        this.setState({ appUsers })

        await dashboardLogic.deleteUser(userId, appName, username)

        if (this._isMounted) {
          const { appUsers } = this.state
          const userIndex = getUserIndex()
          appUsers[userIndex].deleting = undefined
          appUsers[userIndex].deleted = true
          this.setState({ appUsers })
        }
      }
    } catch (e) {
      if (this._isMounted) {
        const { appUsers } = this.state
        appUsers[getUserIndex()].deleting = undefined
        this.setState({ error: e, appUsers })
      }
    }
  }

  render() {
    const { appName, paymentStatus } = this.props
    const { loading, appUsers, error } = this.state

    return (
      <div className='text-xs xs:text-base'>

        <div className='container content'>

          <div className='flex mb-6'>
            <span className='flex-0'>{appName}</span>
            {
              paymentStatus && <div className='flex-1 text-right'>
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
            }
          </div>

          {loading
            ? <div className='text-center'><div className='loader w-6 h-6 inline-block' /></div>
            : appUsers && appUsers.length

              ? <div className='text-center'>
                <table className='table-auto w-full border-collapse border-2 border-gray-500 mx-auto'>

                  <thead>
                    <tr>
                      <th className='border border-gray-400 px-4 py-2 text-gray-800'>Username</th>
                      <th className='border border-gray-400 px-4 py-2 text-gray-800'>Created</th>
                      <th className='border border-gray-400 px-4 py-2'></th>
                    </tr>
                  </thead>

                  <tbody>

                    {appUsers.map((user) => (
                      <tr key={user['user-id']}>
                        <td className='border border-gray-400 px-4 py-2 font-light'>

                          {user['deleted']
                            ? <span>
                              {user['username'] + ' '}
                              <span className='italic text-red-600'>(Deleted)</span>
                            </span>
                            : user['username']
                          }

                        </td>
                        <td className='border border-gray-400 px-4 py-2 font-light'>{user['creation-date']}</td>
                        <td className='border border-gray-400 px-4 py-2 font-light'>

                          {!user['deleted'] && !user['deleting'] &&
                            <div
                              className='fas fa-trash-alt font-normal text-lg cursor-pointer text-yellow-700'
                              onClick={() => this.handleDeleteUser(user)}
                            />
                          }

                          {user['deleting'] &&
                            <div className='loader w-4 h-4 inline-block' />
                          }

                        </td>
                      </tr>
                    ))}

                  </tbody>

                </table>

              </div>

              : !error && <p className='italic font-light'>No users yet.</p>
          }

          {error && <div className='error'>{error.message}</div>}

        </div>

      </div>
    )
  }
}

AppUsersTable.propTypes = {
  appName: string,
  paymentStatus: string
}
