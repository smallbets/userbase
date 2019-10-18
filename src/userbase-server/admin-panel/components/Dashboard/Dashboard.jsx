import React, { Component } from 'react'
import dashboardLogic from './logic'

export default class Dashboard extends Component {
  constructor(props) {
    super(props)
    this.state = {
      error: '',
      apps: [],
      loading: true
    }
  }

  async componentDidMount() {
    try {
      const apps = await dashboardLogic.listApps()
      this.setState({ apps, loading: false })
    } catch (e) {
      this.setState({ error: e, loading: false })
    }
  }

  render() {
    const { loading, apps, error } = this.state

    return (
      <div className='text-xs xs:text-base'>
        {
          loading
            ? <div className='text-center'><div className='loader w-6 h-6 inline-block' /></div>
            : <div className='container content text-center'>

              <table className='table-auto border-collapse border-2 border-gray-500 mx-auto'>

                <thead>
                  <tr>
                    <th className='border border-gray-400 px-4 py-2 text-gray-800'>App Name</th>
                    <th className='border border-gray-400 px-4 py-2 text-gray-800'>App ID</th>
                  </tr>
                </thead>

                <tbody>

                  {apps && apps.length !== 0 && apps.map((app) => (

                    <tr key={app['app-id']}>
                      <td className='border border-gray-400 px-4 py-2 font-light'>{app['app-name']}</td>
                      <td className='border border-gray-400 px-4 py-2 font-light'>{app['app-id']}</td>
                    </tr>

                  ))}

                </tbody>

              </table>

              {error && <div className='error'>{error.message}</div>}

            </div>
        }
      </div>
    )
  }
}
