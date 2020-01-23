import React, { Component } from 'react'
import { string } from 'prop-types'
import dashboardLogic from './logic'
import adminLogic from '../Admin/logic'
import UnknownError from '../Admin/UnknownError'

export default class Dashboard extends Component {
  constructor(props) {
    super(props)
    this.state = {
      error: '',
      activeApps: [],
      deletedApps: [],
      showDeletedApps: false,
      appName: '',
      loading: true,
      loadingApp: false
    }

    this.handleCreateApp = this.handleCreateApp.bind(this)
    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleShowDeletedApps = this.handleShowDeletedApps.bind(this)
    this.handleHideDeletedApps = this.handleHideDeletedApps.bind(this)
    this.handlePermanentDeleteApp = this.handlePermanentDeleteApp.bind(this)
  }

  async componentDidMount() {
    try {
      this._isMounted = true
      document.addEventListener('keydown', this.handleHitEnter, true)

      const apps = (await dashboardLogic.listApps())
        // sort by app name in ascending order
        .sort((a, b) => {
          const lowerA = a['app-name'].toLowerCase()
          const lowerB = b['app-name'].toLowerCase()
          if (lowerA === lowerB) return 0
          else return lowerA > lowerB ? 1 : -1
        })

      const activeApps = []
      const deletedApps = []

      for (let i = 0; i < apps.length; i++) {
        const app = apps[i]

        if (app['deleted']) deletedApps.push(app)
        else activeApps.push(app)
      }

      if (this._isMounted) this.setState({ activeApps, deletedApps, loading: false })
    } catch (e) {
      if (this._isMounted) this.setState({ error: e.message, loading: false })
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
    const { appName, activeApps, loadingApp } = this.state

    if (loadingApp) return

    try {
      this.setState({ loadingApp: true })

      const app = await adminLogic.createApp(appName)

      let insertionIndex = activeApps.findIndex((activeApp) => (activeApp['app-name'].toLowerCase() > app['app-name'].toLowerCase()))
      if (insertionIndex === -1) {
        activeApps.push(app)
      } else {
        // insert into deleted users at insertion index
        activeApps.splice(insertionIndex, 0, app)
      }

      if (this._isMounted) this.setState({ activeApps, appName: '', error: '', loadingApp: false })
    } catch (err) {
      if (this._isMounted) this.setState({ error: err.message, loadingApp: false })
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

  handleShowDeletedApps(e) {
    e.preventDefault()
    this.setState({ showDeletedApps: true })
  }

  handleHideDeletedApps(e) {
    e.preventDefault()
    this.setState({ showDeletedApps: false })
  }

  async handlePermanentDeleteApp(app) {
    const { deletedApps } = this.state

    const appId = app['app-id']
    const appName = app['app-name']

    const getAppIndex = () => this.state.deletedApps.findIndex((app) => app['app-id'] === appId)

    try {
      if (window.confirm(`Are you sure you want to permanently delete app '${appName}'? There is no guarantee the app can be recovered after this.`)) {

        deletedApps[getAppIndex()].permanentDeleting = true
        this.setState({ deletedApps })

        await dashboardLogic.permanentDeleteApp(appId, appName)

        if (this._isMounted) {
          const { deletedApps } = this.state
          const appIndex = getAppIndex()
          deletedApps.splice(appIndex, 1)
          this.setState({ deletedApps })
        }
      }
    } catch (e) {
      if (this._isMounted) {
        const { deletedApps } = this.state
        deletedApps[getAppIndex()].permanentDeleting = undefined
        this.setState({ error: e.message, deletedApps })
      }
    }
  }

  render() {
    const { paymentStatus } = this.props
    const { loading, activeApps, deletedApps, showDeletedApps, error, appName, loadingApp } = this.state

    return (
      <div className='text-xs xs:text-base'>
        {
          loading
            ? <div className='text-center'><div className='loader w-6 h-6 inline-block' /></div>
            :

            <div className='container content text-center'>

              {activeApps && activeApps.length > 0 &&
                <table className='table-auto w-full border-collapse border-2 border-gray-500 mx-auto'>

                  <thead>
                    <tr>
                      <th className='border border-gray-400 px-4 py-2 text-gray-800'>App</th>
                      <th className='border border-gray-400 px-4 py-2 text-gray-800'>App ID</th>
                    </tr>
                  </thead>

                  <tbody>

                    {activeApps.map((app) => (
                      <tr key={app['app-id']}>
                        <td className='border border-gray-400 px-4 py-2 font-light'>
                          <a href={`#app=${app['app-name']}`}>{app['app-name']}</a>
                        </td>
                        <td className='border border-gray-400 px-4 py-2 font-light'>{app['app-id']}</td>
                      </tr>
                    ))}

                  </tbody>

                </table>
              }

              {paymentStatus === 'active' &&

                <form className={`flex text-left ${(activeApps && activeApps.length) ? 'mt-8' : ''}`}>
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
              }

              {deletedApps && deletedApps.length > 0 &&

                <div>
                  <div className='mt-6 text-left'>
                    <a className='select-none italic font-light cursor-pointer' onClick={showDeletedApps ? this.handleHideDeletedApps : this.handleShowDeletedApps}>
                      {showDeletedApps ? 'Hide' : 'Show'} apps pending deletion
                   </a>
                  </div>

                  {showDeletedApps &&
                    <table className='mt-6 table-auto w-full border-collapse border-2 border-gray-500 mx-auto'>

                      <thead>
                        <tr>
                          <th className='border border-gray-400 px-4 py-2 text-gray-800'>App</th>
                          <th className='border border-gray-400 px-4 py-2 text-gray-800'>App ID</th>
                          <th className='border border-gray-400 px-4 py-2'></th>
                        </tr>
                      </thead>

                      <tbody>

                        {deletedApps.map((app) => (
                          <tr key={app['app-id']}>
                            <td className='border border-gray-400 px-4 py-2 font-light text-red-700'>{app['app-name']}</td>
                            <td className='border border-gray-400 px-4 py-2 font-light'>{app['app-id']}</td>
                            <td className='border border-gray-400 px-4 py-2 font-light'>

                              {app['permanentDeleting']
                                ? <div className='loader w-4 h-4 inline-block' />
                                : <div
                                  className='fas fa-trash-alt font-normal text-lg cursor-pointer text-yellow-700'
                                  onClick={() => this.handlePermanentDeleteApp(app)}
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

              {error &&
                <div className='text-left'>
                  {error === 'Unknown Error'
                    ? <UnknownError />
                    : <div className='error'>{error}</div>
                  }
                </div>
              }

            </div>
        }
      </div>
    )
  }
}

Dashboard.propTypes = {
  paymentStatus: string
}
