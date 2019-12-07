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

  render() {
    const { appName } = this.props
    const { loading, appUsers, error } = this.state

    return (
      <div className='text-xs xs:text-base'>

        <div className='container content'>

          <div className='flex mb-6'>
            <div className='flex-0 italic'>{appName}</div>
            <div className='flex-1 text-right'>
              <input
                className='btn w-32'
                type='button'
                value='Delete App'
                onClick={this.handleDeleteApp}
              />
            </div>
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
                    </tr>
                  </thead>

                  <tbody>

                    {appUsers && appUsers.length !== 0 && appUsers.map((user) => (
                      <tr key={user['user-id']}>
                        <td className='border border-gray-400 px-4 py-2 font-light'>{user['username']}</td>
                        <td className='border border-gray-400 px-4 py-2 font-light'>{user['creation-date']}</td>
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
  appName: string
}
