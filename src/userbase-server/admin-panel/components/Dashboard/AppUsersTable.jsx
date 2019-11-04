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
  }

  async componentDidMount() {
    const { appName } = this.props

    try {
      const appUsers = await dashboardLogic.listAppUsers(appName)
      this.setState({ appUsers, loading: false })
    } catch (e) {
      this.setState({ error: e, loading: false })
    }
  }

  render() {
    const { appName } = this.props
    const { loading, appUsers, error } = this.state

    return (
      <div className='text-xs xs:text-base'>

        <div className='container content'>

          <div className='italic mb-6'>{appName}</div>

          {loading
            ? <div className='text-center'><div className='loader w-6 h-6 inline-block' /></div>
            : <div className='text-center'>
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

              {error && <div className='error'>{error.message}</div>}
            </div>
          }

        </div>

      </div>
    )
  }
}

AppUsersTable.propTypes = {
  appName: string
}
