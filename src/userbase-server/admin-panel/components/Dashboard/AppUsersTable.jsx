import React, { Component } from 'react'
import { string, bool } from 'prop-types'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import dashboardLogic from './logic'
import UnknownError from '../Admin/UnknownError'
import { formatDate } from '../../utils'
import { ProfileTable } from './ProfileTable'
import { STRIPE_CLIENT_ID, getStripeState } from '../../config'

const MAX_PLAN_ID_LEN = 19

export default class AppUsersTable extends Component {
  constructor(props) {
    super(props)
    this.state = {
      error: '',
      appId: '',
      activeUsers: [],
      deletedUsers: [],
      loading: true,
      showDeletedUsers: false,
      testSubscriptionPlanId: '',
      prodSubscriptionPlanId: '',
      newTestSubscriptionPlanId: '',
      newProdSubscriptionPlanId: '',
      loadingSetTestSubscriptionPlanId: false,
      loadingDeleteTestSubscriptionPlanId: false,
      errorSubscriptionPlanId: false,
    }

    this.handleDeleteApp = this.handleDeleteApp.bind(this)
    this.handleDeleteUser = this.handleDeleteUser.bind(this)
    this.handlePermanentDeleteUser = this.handlePermanentDeleteUser.bind(this)
    this.handleShowDeletedUsers = this.handleShowDeletedUsers.bind(this)
    this.handleHideDeletedUsers = this.handleHideDeletedUsers.bind(this)
    this.handleToggleDisplayUserMetadata = this.handleToggleDisplayUserMetadata.bind(this)
    this.handleExpandAll = this.handleExpandAll.bind(this)
    this.handleHideAll = this.handleHideAll.bind(this)
    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleSetTestSubscriptionPlanId = this.handleSetTestSubscriptionPlanId.bind(this)
    this.handleDeleteTestSubscriptionPlanId = this.handleDeleteTestSubscriptionPlanId.bind(this)
  }

  async componentDidMount() {
    this._isMounted = true

    const { appName } = this.props

    try {
      const { users, appId, testSubscriptionPlanId, prodSubscriptionPlanId } = await dashboardLogic.listAppUsers(appName)

      // sort by date in descending order
      const appUsers = users.sort((a, b) => new Date(b['creationDate']) - new Date(a['creationDate']))

      const activeUsers = []
      const deletedUsers = []

      for (let i = 0; i < appUsers.length; i++) {
        const appUser = appUsers[i]

        appUser['formattedCreationDate'] = formatDate(appUser['creationDate'])

        if (appUser['deleted']) deletedUsers.push(appUser)
        else activeUsers.push(appUser)
      }

      if (this._isMounted) this.setState({ appId, activeUsers, deletedUsers, testSubscriptionPlanId, prodSubscriptionPlanId, loading: false })
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

    const userId = user['userId']
    const username = user['username']

    const getUserIndex = () => this.state.activeUsers.findIndex((user) => user['userId'] === userId)

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

          let insertionIndex = deletedUsers.findIndex((user) => new Date(deletedUser['creationDate']) > new Date(user['creationDate']))
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

    const userId = user['userId']
    const username = user['username']

    const getUserIndex = () => this.state.deletedUsers.findIndex((user) => user['userId'] === userId)

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

  handleToggleDisplayUserMetadata(e, userId) {
    e.preventDefault()

    const { activeUsers, deletedUsers } = this.state

    const activeUserIndex = activeUsers.findIndex(user => user['userId'] === userId)
    const deletedUserIndex = deletedUsers.findIndex(user => user['userId'] === userId)

    if (activeUserIndex !== -1) {
      activeUsers[activeUserIndex].displayUserMetadata = !activeUsers[activeUserIndex].displayUserMetadata
      this.setState({ activeUsers })
    } else {
      deletedUsers[deletedUserIndex].displayUserMetadata = !deletedUsers[deletedUserIndex].displayUserMetadata
      this.setState({ deletedUsers })
    }
  }

  handleExpandAll(e) {
    e.preventDefault()

    this.setState({
      activeUsers: this.state.activeUsers.map((user) => ({ ...user, displayUserMetadata: true })),
      deletedUsers: this.state.deletedUsers.map((user) => ({ ...user, displayUserMetadata: true })),
      showDeletedUsers: true
    })
  }

  handleHideAll(e) {
    e.preventDefault()

    this.setState({
      activeUsers: this.state.activeUsers.map((user) => ({ ...user, displayUserMetadata: false })),
      deletedUsers: this.state.deletedUsers.map((user) => ({ ...user, displayUserMetadata: false })),
      showDeletedUsers: false
    })
  }

  handleInputChange(event) {
    const target = event.target
    const value = target.value
    const name = target.name

    this.setState({
      [name]: value,
      errorSubscriptionPlanId: false
    })
  }

  async handleSetTestSubscriptionPlanId(event) {
    event.preventDefault()
    try {
      this.setState({ loadingSetTestSubscriptionPlanId: true, errorSubscriptionPlanId: false })

      const { appId, newTestSubscriptionPlanId } = this.state

      await dashboardLogic.setTestSubscriptionPlanId(appId, newTestSubscriptionPlanId)

      if (this._isMounted) this.setState({ loadingSetTestSubscriptionPlanId: false, testSubscriptionPlanId: newTestSubscriptionPlanId })
    } catch (e) {
      if (this._isMounted) this.setState({ loadingSetTestSubscriptionPlanId: false, errorSubscriptionPlanId: e.message })
    }
  }

  async handleDeleteTestSubscriptionPlanId(event) {
    event.preventDefault()
    try {
      this.setState({ loadingDeleteTestSubscriptionPlanId: true, errorSubscriptionPlanId: false })

      const { appId, testSubscriptionPlanId } = this.state

      const confirmed = window.confirm('Warning! This will not delete your subscription plan in Stripe. If you have customers subscribed to this plan, you will need to cancel their subscriptions manually in the Stripe dashboard.')
      if (confirmed) {
        await dashboardLogic.deleteTestSubscriptionPlanId(appId, testSubscriptionPlanId)
      }

      if (this._isMounted) this.setState({ loadingDeleteTestSubscriptionPlanId: false, testSubscriptionPlanId: confirmed ? '' : testSubscriptionPlanId })
    } catch (e) {
      if (this._isMounted) this.setState({ loadingDeleteTestSubscriptionPlanId: false, errorSubscriptionPlanId: e.message })
    }
  }

  render() {
    const { appName, paymentStatus, connectedToStripe } = this.props
    const {
      loading,
      activeUsers,
      deletedUsers,
      error,
      showDeletedUsers,
      testSubscriptionPlanId,
      prodSubscriptionPlanId,
      newTestSubscriptionPlanId,
      newProdSubscriptionPlanId,
      loadingSetTestSubscriptionPlanId,
      loadingDeleteTestSubscriptionPlanId,
      errorSubscriptionPlanId,
    } = this.state

    return (
      <div className='text-xs sm:text-sm'>

        <div className='container content'>

          <div className='mb-6'>
            <div className='mb-4'>
              <span>
                <span className='text-lg sm:text-xl text-left'>{appName}</span>
                {activeUsers && activeUsers.length > 0 &&
                  <span className='font-light text-md ml-2'>
                    ({activeUsers.length} user{`${activeUsers.length === 1 ? '' : 's'}`})
                  </span>}
              </span>
            </div>
            {
              paymentStatus === 'active' ? <div />
                : <div className='text-left mb-4 text-red-600 font-normal'>
                  Your account is limited to 1 app and 3 users. <a href="#edit-account">Remove this limit</a> with a Userbase subscription.
                </div>
            }

            {(activeUsers.length || deletedUsers.length)
              ?
              <div className='text-right'>
                <span className='mb-0 cursor-pointer mouse:hover:text-orange-700' onClick={this.handleExpandAll}>
                  +Expand All
                </span>
                <span className='ml-1 mr-1'>/</span>
                <span className='mb-0 cursor-pointer mouse:hover:text-orange-700' onClick={this.handleHideAll}>
                  -Hide All
                </span>
              </div>
              : null
            }

          </div>

          {loading
            ? <div className='text-center'><div className='loader w-6 h-6 inline-block' /></div>
            : (activeUsers && activeUsers.length) || (deletedUsers && deletedUsers.length)

              ?
              <div>
                {activeUsers && activeUsers.length > 0 &&
                  <div className='text-center'>
                    <table className='table-auto w-full border-none mx-auto text-xs'>

                      <thead>
                        <tr className='border-b'>
                          <th className='px-1 py-1 text-gray-800 text-left'>Username</th>
                          <th className='px-1 py-1 text-gray-800 text-left'>Created</th>
                          <th className='px-1 py-1'></th>
                        </tr>
                      </thead>

                      <tbody>
                        {activeUsers.map((user) => (
                          <React.Fragment key={user['userId']} >
                            <tr className={`mouse:hover:bg-yellow-200 h-8 ${user['displayUserMetadata'] ? 'bg-yellow-200' : 'border-b'}`}>
                              <td className='px-1 font-light text-left'>
                                <a
                                  className={`font-light cursor-pointer ${user['displayUserMetadata'] ? 'text-orange-700' : ''}`}
                                  onClick={(e) => this.handleToggleDisplayUserMetadata(e, user['userId'])}
                                >
                                  {user['username']}
                                </a>
                              </td>
                              <td className='px-1 font-light text-left'>{user['formattedCreationDate']}</td>
                              <td className='px-1 font-light w-8 text-center'>

                                {user['deleting']
                                  ? <div className='loader w-4 h-4 inline-block' />
                                  : <div
                                    className='font-normal text-sm cursor-pointer text-yellow-700'
                                    onClick={() => this.handleDeleteUser(user)}
                                  >
                                    <FontAwesomeIcon icon={faTrashAlt} />
                                  </div>
                                }

                              </td>
                            </tr>

                            {user['displayUserMetadata'] &&
                              <tr className='border-b h-auto bg-yellow-200 mt-4'>
                                <th className='px-1 py-1 text-gray-800 text-left'>

                                  <h6 className='mb-4'>User ID:
                                    <span className='font-light ml-1'>
                                      {user['userId']}
                                    </span>
                                  </h6>

                                  <h6 className='mb-4'>Email:
                                    <span className='font-light ml-1'>
                                      {user['email'] || 'No email saved.'}
                                    </span>
                                  </h6>

                                  <h6 className='mb-4'>Profile:
                                    {user['profile']
                                      ? ProfileTable(user['profile'])
                                      : <span className='font-light ml-1'>
                                        No profile saved.
                                      </span>
                                    }
                                  </h6>


                                  <h6 className='mb-4'>Protected Profile:
                                    {user['protectedProfile']
                                      ? ProfileTable(user['protectedProfile'])
                                      : <span className='font-light ml-1'>
                                        No protected profile saved.
                                      </span>
                                    }
                                  </h6>

                                </th>
                                <th></th>
                                <th></th>
                              </tr>
                            }

                          </React.Fragment>
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

                      <table className='mt-6 table-auto w-full border-none mx-auto text-xs'>

                        <thead>
                          <tr className='border-b'>
                            <th className='px-1 py-1 text-gray-800 text-left'>Username</th>
                            <th className='px-1 py-1 text-gray-800 text-left'>Created</th>
                            <th className='px-1 py-1'></th>
                          </tr>
                        </thead>

                        <tbody>

                          {deletedUsers.map((user) => (
                            <React.Fragment key={user['userId']} >
                              <tr className={`mouse:hover:bg-yellow-200 h-8 ${user['displayUserMetadata'] ? 'bg-yellow-200' : 'border-b'}`}>
                                <td className='px-1 font-light text-left text-red-700'>
                                  <a
                                    className={`font-light cursor-pointer ${user['displayUserMetadata'] ? 'text-orange-700' : ''}`}
                                    onClick={(e) => this.handleToggleDisplayUserMetadata(e, user['userId'])}
                                  >
                                    {user['username']}
                                  </a>
                                </td>
                                <td className='px-1 font-light text-left'>{user['formattedCreationDate']}</td>
                                <td className='px-1 font-light w-8 text-center'>

                                  {user['permanentDeleting']
                                    ? <div className='loader w-4 h-4 inline-block' />
                                    : <div
                                      className='font-normal text-sm cursor-pointer text-yellow-700'
                                      onClick={() => this.handlePermanentDeleteUser(user)}
                                    >
                                      <FontAwesomeIcon icon={faTrashAlt} />
                                    </div>
                                  }

                                </td>
                              </tr>

                              {user['displayUserMetadata'] &&
                                <tr className='border-b h-auto bg-yellow-200 mt-4'>
                                  <th className='px-1 py-1 text-gray-800 text-left'>

                                    <h6 className='mb-4'>User ID:
                                    <span className='font-light ml-1'>
                                        {user['userId']}
                                      </span>
                                    </h6>

                                    <h6 className='mb-4'>Email:
                                    <span className='font-light ml-1'>
                                        {user['email'] || 'No email saved.'}
                                      </span>
                                    </h6>

                                    <h6 className='mb-4'>Profile:
                                    {user['profile']
                                        ? ProfileTable(user['profile'])
                                        : <span className='font-light ml-1'>
                                          No profile saved.
                                      </span>
                                      }
                                    </h6>


                                    <h6 className='mb-4'>Protected Profile:
                                    {user['protectedProfile']
                                        ? ProfileTable(user['protectedProfile'])
                                        : <span className='font-light ml-1'>
                                          No protected profile saved.
                                      </span>
                                      }
                                    </h6>

                                  </th>
                                  <th></th>
                                  <th></th>
                                </tr>
                              }

                            </React.Fragment>
                          ))}

                        </tbody>
                      </table>
                    }
                  </div>
                }

              </div>

              : !error &&
              <div>
                <p className='font-normal'>No users yet.</p>
                <p className='font-normal mt-6'>Check out the <a href='https://userbase.com/docs/' target='_blank' rel='noopener noreferrer'>Quickstart guide</a> to get started.</p>
              </div>
          }

          {error && (
            error === 'Unknown Error'
              ? <UnknownError />
              : <div className='error'>{error}</div>
          )}

          <hr className='border border-t-0 border-gray-400 mt-8 mb-6' />

          <div className='flex-0 text-lg sm:text-xl text-left mb-1'>Payment Portal</div>
          <p className='text-left font-normal mb-4'>Collect payments on your app with Stripe.</p>

          {
            connectedToStripe
              ? <div>
                <form onSubmit={this.handleSetTestSubscriptionPlanId}>

                  {testSubscriptionPlanId
                    ? <div className='table-row'>
                      <div className='table-cell p-2 w-32 sm:w-40 text-right'>Test Plan ID</div>

                      <div className='table-cell p-2 w-32 sm:w-40'>
                        <div className='font-light w-48 sm:w-84 p-2 text-left'>
                          <a
                            href={'https://dashboard.stripe.com/test/plans/' + testSubscriptionPlanId}>
                            {testSubscriptionPlanId}
                          </a>
                        </div>
                      </div>

                      {
                        loadingDeleteTestSubscriptionPlanId
                          ? <div className='loader w-4 h-4 inline-block' />
                          : <div
                            className='font-normal text-sm cursor-pointer text-yellow-700'
                            onClick={this.handleDeleteTestSubscriptionPlanId}
                          >
                            <FontAwesomeIcon icon={faTrashAlt} />
                          </div>
                      }

                    </div>

                    : <div className='table-row'>

                      <a
                        href='https://dashboard.stripe.com/test/subscriptions/products/create'
                        className='table-cell p-2 w-32 sm:w-40 text-right'
                      >
                        Test Plan ID
                      </a>

                      <div className='table-cell p-2 w-32 sm:w-40'>
                        <input
                          className='font-light text-xs sm:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none'
                          type='text'
                          name='newTestSubscriptionPlanId'
                          autoComplete='off'
                          value={newTestSubscriptionPlanId}
                          maxLength={MAX_PLAN_ID_LEN}
                          spellCheck={false}
                          onChange={this.handleInputChange}
                          placeholder='plan_'
                        />
                      </div>

                      <input
                        className='btn w-24 ml-2'
                        type='submit'
                        value={loadingSetTestSubscriptionPlanId ? 'Saving...' : 'Save'}
                        disabled={!newTestSubscriptionPlanId || newTestSubscriptionPlanId.length !== MAX_PLAN_ID_LEN || loadingSetTestSubscriptionPlanId}
                      />

                    </div>

                  }

                </form>
              </div>
              :

              <div className='text-center'>
                <a
                  href={`https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${STRIPE_CLIENT_ID}&scope=read_write&state=${getStripeState()}`}
                  className='stripe-connect light-blue'>
                  <span>Connect with Stripe</span>
                </a>
              </div>
          }

          <div className='text-center'>
            {errorSubscriptionPlanId && (
              errorSubscriptionPlanId === 'Unknown Error'
                ? <UnknownError />
                : <div className='error'>{errorSubscriptionPlanId}</div>
            )}
          </div>

          {paymentStatus === 'active'
            ? <div>
              <hr className='border border-t-0 border-gray-400 mt-8 mb-6' />

              <div className='flex-0 text-lg sm:text-xl text-left mb-4 text-red-600'>Danger Zone</div>

              <div className='flex-0 text-base sm:text-lg text-left mb-1'>Delete App</div>
              <p className='text-left font-normal'>By deleting this app, your users will lose access to their accounts. This action becomes irreversible once the app is permanently deleted.</p>

              <div className='text-center'>
                <input
                  className='btn w-56'
                  type='button'
                  value='Delete App'
                  onClick={this.handleDeleteApp}
                />
              </div>
            </div>
            : <div />
          }

        </div>

      </div >
    )
  }
}

AppUsersTable.propTypes = {
  appName: string,
  paymentStatus: string,
  connectedToStripe: bool
}
