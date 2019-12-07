import React, { Component } from 'react'
import dashboardLogic from './logic'
import adminLogic from '../Admin/logic'

export default class Dashboard extends Component {
  constructor(props) {
    super(props)
    this.state = {
      error: '',
      apps: [],
      appName: '',
      loading: true,
      loadingApp: false
    }

    this.handleCreateApp = this.handleCreateApp.bind(this)
    this.handleInputChange = this.handleInputChange.bind(this)
  }

  async componentDidMount() {
    try {
      this._isMounted = true
      document.addEventListener('keydown', this.handleHitEnter, true)

      const apps = await dashboardLogic.listApps()
      if (this._isMounted) this.setState({ apps, loading: false })
    } catch (e) {
      if (this._isMounted) this.setState({ error: e, loading: false })
    }
  }

  componentWillUnmount() {
    this._isMounted = false
    document.removeEventListener('keydown', this.handleHitEnter, true)
  }

  handleHitEnter(e) {
    const ENTER_KEY_CODE = 13
    if ((e.target.name === 'appName') &&
      (e.key === 'Enter' || e.keyCode === ENTER_KEY_CODE)) {
      e.stopPropagation()
    }
  }

  async handleCreateApp(e) {
    e.preventDefault()
    const { appName, apps, loadingApp } = this.state

    if (loadingApp) return

    try {
      this.setState({ loadingApp: true })

      const app = await adminLogic.createApp(appName)

      if (this._isMounted) this.setState({ apps: apps.concat(app), appName: '', error: '', loadingApp: false })
    } catch (err) {
      if (this._isMounted) this.setState({ error: err, loadingApp: false })
    }
  }

  handleInputChange(event) {
    if (this.state.error) this.setState({ error: undefined })

    const target = event.target
    const value = target.value
    const name = target.name

    this.setState({
      [name]: value
    })
  }

  render() {
    const { loading, apps, error, appName, loadingApp } = this.state

    return (
      <div className='text-xs xs:text-base'>
        {
          loading
            ? <div className='text-center'><div className='loader w-6 h-6 inline-block' /></div>
            :

            <div className='container content text-center'>

              {apps && apps.length !== 0 &&
                <table className='table-auto w-full border-collapse border-2 border-gray-500 mx-auto'>

                  <thead>
                    <tr>
                      <th className='border border-gray-400 px-4 py-2 text-gray-800'>App</th>
                      <th className='border border-gray-400 px-4 py-2 text-gray-800'>App ID</th>
                    </tr>
                  </thead>

                  <tbody>

                    {apps.map((app) => (
                      <tr key={app['app-id']}>
                        <td className='border border-gray-400 px-4 py-2 font-light'>

                          {app['deleted']
                            ? <span>
                              {app['app-name'] + ' '}
                              <span className='italic text-red-600'>(Deleted)</span>
                            </span>
                            : <a href={`#app=${app['app-name']}`}>{app['app-name']}</a>
                          }

                        </td>
                        <td className='border border-gray-400 px-4 py-2 font-light'>{app['app-id']}</td>
                      </tr>
                    ))}

                  </tbody>

                </table>
              }

              <form className={`flex text-left ${(apps && apps.length) ? 'mt-8' : ''}`}>
                <div className='flex-1'>
                  <input
                    className='input-text text-xs xs:text-sm w-36 xs:w-48'
                    type='text'
                    name='appName'
                    autoComplete='off'
                    value={appName}
                    placeholder='New app'
                    onChange={this.handleInputChange}
                  />
                </div>

                <div className='flex-1 text-center'>
                  <input
                    className='btn'
                    type='submit'
                    value='Add'
                    disabled={!appName || loadingApp}
                    onClick={this.handleCreateApp}
                  />
                </div>

                <div className='flex-1 my-auto'>
                  {loadingApp && <div className='loader w-6 h-6' />}
                </div>
              </form>

              {error && <div className='error text-left'>{error.message}</div>}

            </div>
        }
      </div>
    )
  }
}
