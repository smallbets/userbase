import React, { Component } from 'react'
import { string, object } from 'prop-types'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrashAlt, faQuestionCircle } from '@fortawesome/free-regular-svg-icons'
import dashboardLogic from './logic'
import adminLogic from '../Admin/logic'
import UnknownError from '../Admin/UnknownError'
import { formatDate, formatSize } from '../../utils'
import { ProfileTable } from './ProfileTable'
import { StripeDataTable } from './StripeDataTable'
import { STRIPE_CLIENT_ID, getStripeState } from '../../config'
import EncryptionModeModal from './EncryptionModeModal'

// admin must have an active Userbase subscripion & active payments add-on subscription to enable prod payments
const prodPaymentsAllowed = ({ paymentStatus, cancelSaasSubscriptionAt, paymentsAddOnSubscriptionStatus, cancelPaymentsAddOnSubscriptionAt }) => {
  return (
    paymentStatus === 'active' && !cancelSaasSubscriptionAt &&
    paymentsAddOnSubscriptionStatus === 'active' && !cancelPaymentsAddOnSubscriptionAt
  )
}

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
      showEncryptionModeModal: false,
      paymentsState: {
        paymentsMode: 'disabled',
        testSubscriptionPlanId: '',
        prodSubscriptionPlanId: '',
        newTestSubscriptionPlanId: '',
        newProdSubscriptionPlanId: '',
        loadingSetTestSubscriptionPlanId: false,
        loadingSetProdSubscriptionPlanId: false,
        loadingDeleteTestSubscriptionPlanId: false,
        loadingDeleteProdSubscriptionPlanId: false,
        loadingPaymentsMode: false,
        loadingPlanMode: false,
        errorPaymentsPortal: false,
      }
    }

    this.handleDeleteApp = this.handleDeleteApp.bind(this)
    this.handleDeleteUser = this.handleDeleteUser.bind(this)
    this.handlePermanentDeleteUser = this.handlePermanentDeleteUser.bind(this)
    this.handleShowDeletedUsers = this.handleShowDeletedUsers.bind(this)
    this.handleHideDeletedUsers = this.handleHideDeletedUsers.bind(this)
    this.handleToggleDisplayUserMetadata = this.handleToggleDisplayUserMetadata.bind(this)
    this.handleExpandAll = this.handleExpandAll.bind(this)
    this.handleHideAll = this.handleHideAll.bind(this)
    this.handlePaymentsPlanInputChange = this.handlePaymentsPlanInputChange.bind(this)
    this.handleSetTestSubscriptionPlanId = this.handleSetTestSubscriptionPlanId.bind(this)
    this.handleSetProdSubscriptionPlanId = this.handleSetProdSubscriptionPlanId.bind(this)
    this.handleDeleteTestSubscriptionPlanId = this.handleDeleteTestSubscriptionPlanId.bind(this)
    this.handleDeleteProdSubscriptionPlanId = this.handleDeleteProdSubscriptionPlanId.bind(this)
    this.handleEnableTestPayments = this.handleEnableTestPayments.bind(this)
    this.handleEnableProdPayments = this.handleEnableProdPayments.bind(this)
    this.handleDisablePayments = this.handleDisablePayments.bind(this)
    this.handleSetEncryptionMode = this.handleSetEncryptionMode.bind(this)
    this.handleShowEncryptionModeModal = this.handleShowEncryptionModeModal.bind(this)
    this.handleHideEncryptionModeModal = this.handleHideEncryptionModeModal.bind(this)
  }

  async componentDidMount() {
    this._isMounted = true

    const { appName, admin } = this.props
    const { paymentsState } = this.state

    try {
      const { users, appId, encryptionMode, paymentsMode, testSubscriptionPlanId, prodSubscriptionPlanId } = await dashboardLogic.listAppUsers(appName)

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

      const updatedPaymentsState = {
        ...paymentsState, testSubscriptionPlanId, prodSubscriptionPlanId,
        paymentsMode: (paymentsMode === 'prod' && !prodPaymentsAllowed(admin))
          ? 'disabled' // app's payments mode considered functionally disabled if set to prod but cannot take prod payments
          : paymentsMode
      }

      if (this._isMounted) this.setState({ appId, encryptionMode, activeUsers, deletedUsers, loading: false, paymentsState: updatedPaymentsState })
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
      if (window.confirm(`Are you sure you want to delete app '${appName}'? `)) {
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

          // client-side updates that are safe to make considering server succeeded
          if (deletedUser.prodStripeData && deletedUser.prodStripeData.subscriptionId) {
            deletedUser.prodStripeData.cancelSubscriptionAt = undefined
            deletedUser.prodStripeData.subscriptionStatus = 'canceled'
          }

          if (deletedUser.testStripeData && deletedUser.testStripeData.subscriptionId) {
            deletedUser.testStripeData.cancelSubscriptionAt = undefined
            deletedUser.testStripeData.subscriptionStatus = 'canceled'
          }

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

  handlePaymentsPlanInputChange(event) {
    const { paymentsState } = this.state

    const target = event.target
    const value = target.value
    const name = target.name

    this.setState({
      paymentsState: {
        ...paymentsState,
        [name]: value,
        errorPaymentsPortal: false,
      }
    })
  }

  async handleSetTestSubscriptionPlanId(event) {
    event.preventDefault()
    const { appName } = this.props
    const { appId, paymentsState } = this.state

    try {
      this.setState({
        paymentsState: {
          ...paymentsState,
          loadingSetTestSubscriptionPlanId: true,
          errorPaymentsPortal: false
        }
      })

      const { newTestSubscriptionPlanId } = paymentsState

      await dashboardLogic.setTestSubscriptionPlanId(appName, appId, newTestSubscriptionPlanId)

      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingSetTestSubscriptionPlanId: false,
            testSubscriptionPlanId: newTestSubscriptionPlanId
          }
        })
      }
    } catch (e) {
      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingSetTestSubscriptionPlanId: false,
            errorPaymentsPortal: e.message
          }
        })
      }
    }
  }

  async handleSetProdSubscriptionPlanId(event) {
    event.preventDefault()
    const { appName } = this.props
    const { appId, paymentsState } = this.state

    try {
      this.setState({
        paymentsState: {
          ...paymentsState,
          loadingSetProdSubscriptionPlanId: true,
          errorPaymentsPortal: false
        }
      })

      const { newProdSubscriptionPlanId } = paymentsState

      await dashboardLogic.setProdSubscriptionPlanId(appName, appId, newProdSubscriptionPlanId)

      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingSetProdSubscriptionPlanId: false,
            prodSubscriptionPlanId: newProdSubscriptionPlanId
          }
        })
      }
    } catch (e) {
      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingSetProdSubscriptionPlanId: false,
            errorPaymentsPortal: e.message
          }
        })
      }
    }
  }

  async handleDeleteTestSubscriptionPlanId(event) {
    event.preventDefault()
    const { appName } = this.props
    const { appId, paymentsState } = this.state

    try {
      this.setState({
        paymentsState: {
          ...paymentsState,
          loadingDeleteTestSubscriptionPlanId: true,
          errorPaymentsPortal: false
        }
      })

      const { testSubscriptionPlanId } = paymentsState

      const confirmed = window.confirm('Warning! This will not delete your subscription plan in Stripe. If you have customers subscribed to this plan, you will need to cancel their subscriptions manually in the Stripe dashboard.')
      if (confirmed) {
        await dashboardLogic.deleteTestSubscriptionPlanId(appName, appId, testSubscriptionPlanId)
      }

      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingDeleteTestSubscriptionPlanId: false,
            testSubscriptionPlanId: confirmed ? '' : testSubscriptionPlanId
          }
        })
      }
    } catch (e) {
      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingDeleteTestSubscriptionPlanId: false,
            errorPaymentsPortal: e.message
          }
        })
      }
    }
  }

  async handleDeleteProdSubscriptionPlanId(event) {
    event.preventDefault()
    const { appName } = this.props
    const { appId, paymentsState } = this.state

    try {
      this.setState({
        paymentsState: {
          ...paymentsState,
          loadingDeleteProdSubscriptionPlanId: true,
          errorPaymentsPortal: false
        }
      })

      const { prodSubscriptionPlanId } = paymentsState

      const confirmed = window.confirm('Warning! This will not delete your subscription plan in Stripe. If you have customers subscribed to this plan, you will need to cancel their subscriptions manually in the Stripe dashboard.')
      if (confirmed) {
        await dashboardLogic.deleteProdSubscriptionPlanId(appName, appId, prodSubscriptionPlanId)
      }

      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingDeleteProdSubscriptionPlanId: false,
            prodSubscriptionPlanId: confirmed ? '' : prodSubscriptionPlanId
          }
        })
      }
    } catch (e) {
      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingDeleteProdSubscriptionPlanId: false,
            errorPaymentsPortal: e.message
          }
        })
      }
    }
  }

  async handleDisablePayments(event) {
    event.preventDefault()
    const { appName } = this.props
    const { appId, paymentsState } = this.state

    try {
      this.setState({
        paymentsState: {
          ...paymentsState,
          loadingPaymentsMode: true,
          errorPaymentsPortal: false
        }
      })

      let confirmed = true
      if (paymentsState.paymentsMode === 'prod') {
        confirmed = window.confirm('Are you sure you want to disable production payments?')
      }

      let paymentsMode = paymentsState.paymentsMode
      if (confirmed) {
        paymentsMode = await dashboardLogic.disablePayments(appName, appId)
      }

      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingPaymentsMode: false,
            paymentsMode
          }
        })
      }
    } catch (e) {
      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingPaymentsMode: false,
            errorPaymentsPortal: e.message
          }
        })
      }
    }
  }

  async handleEnableTestPayments(event, loadingPaymentsMode, loadingPlanMode) {
    event.preventDefault()
    const { appName } = this.props
    const { appId, paymentsState } = this.state

    try {
      this.setState({
        paymentsState: {
          ...paymentsState,
          loadingPaymentsMode,
          loadingPlanMode,
          errorPaymentsPortal: false
        }
      })

      let confirmed = true
      if (paymentsState.paymentsMode === 'prod') {
        confirmed = window.confirm('Are you sure you want to disable production payments?')
      }

      let paymentsMode = paymentsState.paymentsMode
      if (confirmed) {
        paymentsMode = await dashboardLogic.enableTestPayments(appName, appId)
      }

      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingPaymentsMode: false,
            loadingPlanMode: false,
            paymentsMode
          }
        })
      }
    } catch (e) {
      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingPaymentsMode: false,
            loadingPlanMode: false,
            errorPaymentsPortal: e.message
          }
        })
      }
    }
  }

  async handleEnableProdPayments(event) {
    event.preventDefault()
    const { appName } = this.props
    const { appId, paymentsState } = this.state

    try {
      this.setState({
        paymentsState: {
          ...paymentsState,
          loadingPlanMode: true,
          errorPaymentsPortal: false
        }
      })

      const paymentsMode = await dashboardLogic.enableProdPayments(appName, appId)

      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingPlanMode: false,
            paymentsMode
          }
        })
      }
    } catch (e) {
      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingPlanMode: false,
            errorPaymentsPortal: e.message
          }
        })
      }
    }
  }

  async handleSetEncryptionMode(encryptionMode) {
    if (encryptionMode === this.state.encryptionMode) return
    const { appName } = this.props
    const { loadingEncryptionMode, appId } = this.state

    if (loadingEncryptionMode) return

    this.setState({ errorEncryptionMode: false })

    if (window.confirm("Are you sure you want to modify your application's encryption mode?\n\nModifying the encryption mode while you have active users is not recommended, and could render their data inaccessible.")) {
      try {
        this.setState({ loadingEncryptionMode: true })

        await dashboardLogic.modifyEncryptionMode(appId, appName, encryptionMode)
        if (this._isMounted) this.setState({ loadingEncryptionMode: false, encryptionMode })
      } catch (e) {
        if (this._isMounted) this.setState({ loadingEncryptionMode: false, errorEncryptionMode: e.message })
      }
    }
  }

  handleShowEncryptionModeModal() {
    this.setState({ showEncryptionModeModal: true })
  }

  handleHideEncryptionModeModal() {
    this.setState({ showEncryptionModeModal: false })
  }

  render() {
    const { appName, admin } = this.props
    const { connectedToStripe } = admin
    const {
      loading,
      activeUsers,
      deletedUsers,
      error,
      showDeletedUsers,
      paymentsState,
      appId,
      encryptionMode,
      loadingEncryptionMode,
      errorEncryptionMode,
      showEncryptionModeModal,
    } = this.state

    const {
      paymentsMode,
      testSubscriptionPlanId,
      prodSubscriptionPlanId,
      newTestSubscriptionPlanId,
      newProdSubscriptionPlanId,
      loadingPaymentsMode,
      loadingPlanMode,
      loadingSetTestSubscriptionPlanId,
      loadingSetProdSubscriptionPlanId,
      loadingDeleteTestSubscriptionPlanId,
      loadingDeleteProdSubscriptionPlanId,
      errorPaymentsPortal,
    } = paymentsState

    return (
      <div className='text-xs sm:text-sm'>

        <div className='container content'>

          <div className='mb-6'>
            <div className='mb-2'>
              <span className='text-lg sm:text-xl text-left'>{appName}</span>
              {activeUsers && activeUsers.length > 0 &&
                <span className='font-light text-md ml-2'>
                  ({activeUsers.length} user{`${activeUsers.length === 1 ? '' : 's'}`})
                </span>}
            </div>

            {appId &&
              <div>
                <div className='text-md text-gray-800'>
                  App ID:
                  <span className='font-light font-mono ml-2 text-xs'>{appId}</span>
                </div>
                <div className='mb-6 text-md text-gray-800'>
                  Encryption Mode <a className='font-light cursor-pointer text-yellow-700' onClick={this.handleShowEncryptionModeModal}><FontAwesomeIcon icon={faQuestionCircle} /></a>:
                  <span className='font-light ml-2 text-sm capitalize text-black'>{encryptionMode}</span>
                </div>
              </div>
            }

            {showEncryptionModeModal && <EncryptionModeModal handleHideEncryptionModeModal={this.handleHideEncryptionModeModal} />}

            {
              !adminLogic.saasSubscriptionNotActive(admin) ? <div />
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
                  <div className='text-center overflow-auto whitespace-no-wrap'>
                    <table className='table-auto w-full border-none mx-auto text-xs'>

                      <thead>
                        <tr className='border-b'>
                          <th className='px-1 py-1 text-gray-800 text-left'>Username</th>
                          <th className='px-1 py-1 text-gray-800 text-left'>Created</th>
                          <th className='px-1 py-1 text-gray-800 text-left'>Data Stored (updated every 24hr)</th>
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
                              <td className='px-1 font-light text-left'>{formatSize(user['size'])}</td>
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
                                <td colSpan='4' className='px-1 py-4 text-gray-800 text-left'>

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

                                  <h6 className='mb-4'>Test Stripe Data:
                                    {user['testStripeData']
                                      ? StripeDataTable(user['testStripeData'])
                                      : <span className='font-light ml-1'>
                                        No test Stripe data saved.
                                      </span>
                                    }
                                  </h6>

                                  <h6 className='mb-4'>Prod Stripe Data:
                                    {user['prodStripeData']
                                      ? StripeDataTable(user['prodStripeData'], true)
                                      : <span className='font-light ml-1'>
                                        No prod Stripe data saved.
                                      </span>
                                    }
                                  </h6>

                                </td>
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
                      <div className='text-center overflow-auto whitespace-no-wrap'>
                        <table className='mt-6 table-auto w-full border-none mx-auto text-xs'>

                          <thead>
                            <tr className='border-b'>
                              <th className='px-1 py-1 text-gray-800 text-left'>Username</th>
                              <th className='px-1 py-1 text-gray-800 text-left'>Created</th>
                              <th className='px-1 py-1 text-gray-800 text-left'>Data Stored (updated every 24hr)</th>
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
                                  <td className='px-1 font-light text-left'>{formatSize(user['size'])}</td>
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
                                    <td colSpan='4' className='px-1 py-4 text-gray-800 text-left'>

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

                                      <h6 className='mb-4'>Test Stripe Data:
                                        {user['testStripeData']
                                          ? StripeDataTable(user['testStripeData'])
                                          : <span className='font-light ml-1'>
                                            No test Stripe data saved.
                                          </span>
                                        }
                                      </h6>

                                      <h6 className='mb-4'>Prod Stripe Data:
                                        {user['prodStripeData']
                                          ? StripeDataTable(user['prodStripeData'], true)
                                          : <span className='font-light ml-1'>
                                            No prod Stripe data saved.
                                          </span>
                                        }
                                      </h6>

                                    </td>
                                  </tr>
                                }

                              </React.Fragment>
                            ))}

                          </tbody>
                        </table>
                      </div>
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

          <div className='flex-0 text-lg sm:text-xl text-left mb-1'>Payments Portal</div>
          <p className='text-left font-normal mb-4'>Collect payments on your app with Stripe.</p>

          {
            prodPaymentsAllowed(admin) ? <div />
              : <div className='text-left mb-6 text-red-600 font-normal'>
                Your account is limited to test payments. <a href="#edit-account">Remove this limit</a> with {adminLogic.saasSubscriptionNotActive(admin) ? 'a Userbase subscription and' : ''} the payments portal add-on.
              </div>
          }

          {loading
            ? <div className='text-center'><div className='loader w-6 h-6 inline-block' /></div>
            : connectedToStripe
              ? <div>

                <label className='flex items-center mb-4 fit-content'>
                  <div className='relative cursor-pointer'>
                    <input
                      type='checkbox'
                      className='hidden'
                      checked={paymentsMode === 'test' || paymentsMode === 'prod'}
                      onChange={(e) => paymentsMode === 'disabled' ? this.handleEnableTestPayments(e, true, loadingPlanMode) : this.handleDisablePayments(e)}
                      disabled={loadingPaymentsMode}
                    />
                    <div className='w-10 h-4 bg-gray-400 rounded-full shadow-inner' />
                    <div className='toggle-dot absolute w-6 h-6 bg-white rounded-full shadow' />
                  </div>

                  <div className='ml-3 text-gray-500 hover:text-gray-600 font-medium cursor-pointer'>
                    {paymentsMode === 'disabled' ? 'Enable Payments' : 'Payments Enabled'}
                  </div>

                  {loadingPaymentsMode && <div className='loader w-4 h-4 ml-4 inline-block' />}
                </label>

                {(paymentsMode === 'test' || paymentsMode === 'prod') &&
                  <label className='flex items-center mb-4 fit-content'>
                    <div className={`relative ${prodPaymentsAllowed(admin) ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                      <input
                        type='checkbox'
                        className='hidden'
                        checked={paymentsMode === 'prod'}
                        onChange={(e) => paymentsMode === 'prod' ? this.handleEnableTestPayments(e, loadingPaymentsMode, true) : this.handleEnableProdPayments(e)}
                        disabled={!prodPaymentsAllowed(admin) || loadingPlanMode}
                      />
                      <div className='w-10 h-4 bg-gray-400 rounded-full shadow-inner' />
                      <div className='toggle-dot absolute w-6 h-6 bg-white rounded-full shadow' />
                    </div>

                    <div className={`ml-3 font-medium ${prodPaymentsAllowed(admin) ? 'cursor-pointer text-gray-500 hover:text-gray-600' : 'cursor-not-allowed text-gray-400'}`}>
                      {paymentsMode === 'test' ? 'Use Production Plan' : 'Using Prod Plan'}
                    </div>

                    {loadingPlanMode && <div className='loader w-4 h-4 ml-4 inline-block' />}
                  </label>
                }

                <form onSubmit={this.handleSetTestSubscriptionPlanId}>

                  {testSubscriptionPlanId
                    ? <div className='table-row'>
                      <div className='table-cell p-2 w-32 sm:w-40 text-right'>Test Plan ID</div>

                      <div className='table-cell p-2 w-32 sm:w-40'>
                        <div className='font-light w-48 sm:w-84 text-left'>
                          <a
                            href={'https://dashboard.stripe.com/test/plans/' + testSubscriptionPlanId}>
                            {testSubscriptionPlanId}
                          </a>
                        </div>
                      </div>

                      <div className='ml-2 w-24 text-center'>
                        {
                          loadingDeleteTestSubscriptionPlanId
                            ? <div className='loader w-4 h-4 inline-block' />
                            : <div className='font-normal text-sm text-yellow-700'>
                              <FontAwesomeIcon
                                className='cursor-pointer'
                                onClick={this.handleDeleteTestSubscriptionPlanId}
                                icon={faTrashAlt}
                              />
                            </div>
                        }
                      </div>

                    </div>

                    : <div className='table-row'>
                      <div className='table-cell p-2 w-32 sm:w-40 text-right'>
                        <a href='https://dashboard.stripe.com/test/subscriptions/products/create'>
                          Test Plan ID
                        </a>
                      </div>

                      <div className='table-cell p-2 w-32 sm:w-40'>
                        <input
                          className='font-light text-xs sm:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none'
                          type='text'
                          name='newTestSubscriptionPlanId'
                          autoComplete='off'
                          value={newTestSubscriptionPlanId}
                          spellCheck={false}
                          onChange={this.handlePaymentsPlanInputChange}
                          placeholder='price_ or plan_'
                        />
                      </div>

                      <input
                        className='btn w-24 ml-2'
                        type='submit'
                        value={loadingSetTestSubscriptionPlanId ? 'Saving...' : 'Save'}
                        disabled={!newTestSubscriptionPlanId || loadingSetTestSubscriptionPlanId}
                      />

                    </div>
                  }

                </form>

                <form onSubmit={this.handleSetProdSubscriptionPlanId}>

                  {prodSubscriptionPlanId
                    ? <div className='table-row'>
                      <div className='table-cell p-2 w-32 sm:w-40 text-right'>Prod Plan ID</div>

                      <div className='table-cell p-2 w-32 sm:w-40'>
                        <div className='font-light w-48 sm:w-84 text-left'>
                          <a
                            href={'https://dashboard.stripe.com/plans/' + prodSubscriptionPlanId}>
                            {prodSubscriptionPlanId}
                          </a>
                        </div>
                      </div>

                      <div className='ml-2 w-24 text-center'>
                        {
                          loadingDeleteProdSubscriptionPlanId
                            ? <div className='loader w-4 h-4 inline-block' />
                            : <div className='font-normal text-sm cursor-pointer text-yellow-700'>
                              <FontAwesomeIcon
                                className='cursor-pointer'
                                onClick={this.handleDeleteProdSubscriptionPlanId}
                                icon={faTrashAlt}
                              />
                            </div>
                        }
                      </div>

                    </div>

                    : <div className='table-row'>

                      <div className='table-cell p-2 w-32 sm:w-40 text-right'>
                        <a href='https://dashboard.stripe.com/subscriptions/products/create'>
                          Prod Plan ID
                        </a>
                      </div>

                      <div className='table-cell p-2 w-32 sm:w-40'>
                        <input
                          className={`font-light text-xs sm:text-sm w-48 sm:w-84 h-8 p-2 border border-gray-500 outline-none ${prodPaymentsAllowed(admin) ? '' : 'cursor-not-allowed'}`}
                          type='text'
                          name='newProdSubscriptionPlanId'
                          autoComplete='off'
                          value={newProdSubscriptionPlanId}
                          spellCheck={false}
                          onChange={this.handlePaymentsPlanInputChange}
                          placeholder='price_ or plan_'
                          disabled={!prodPaymentsAllowed(admin)}
                        />
                      </div>

                      <input
                        className='btn w-24 ml-2'
                        type='submit'
                        value={loadingSetProdSubscriptionPlanId ? 'Saving...' : 'Save'}
                        disabled={!newProdSubscriptionPlanId || loadingSetProdSubscriptionPlanId}
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
            {errorPaymentsPortal && (
              errorPaymentsPortal === 'Unknown Error'
                ? <UnknownError />
                : <div className='error'>{errorPaymentsPortal}</div>
            )}
          </div>

          <hr className='border border-t-0 border-gray-400 mt-8 mb-6' />

          <div className='flex-0 text-lg sm:text-xl text-left mb-4 text-red-600'>Danger Zone</div>

          <div className='mb-4'>
            <div className='flex-0 text-base sm:text-lg text-left mb-1'>Encryption Mode</div>
            <p className='text-left font-normal'>Modifying the encryption mode alters the default settings in your Userbase SDK. Modifying the encryption mode while you have active users is not recommended, and could render their data inaccessible. <a className='underline cursor-pointer' onClick={this.handleShowEncryptionModeModal}>Learn more</a> about the encryption modes.</p>

            <div className='text-center'>
              <div>
                <input className={'align-middle mb-1 mr-2 ' + (loadingEncryptionMode ? 'cursor-wait' : 'cursor-pointer')} type='radio'
                  checked={encryptionMode === 'end-to-end'}
                  disabled={loadingEncryptionMode}
                  onChange={() => this.handleSetEncryptionMode('end-to-end')}
                />
                <label className={'font-light ' + (loadingEncryptionMode ? 'cursor-wait' : 'cursor-pointer')}
                  onClick={() => this.handleSetEncryptionMode('end-to-end')}
                >End-to-end</label>
              </div>
              <div>
                <input className={'align-middle mb-1 mr-2 ' + (loadingEncryptionMode ? 'cursor-wait' : 'cursor-pointer')} type='radio'
                  checked={encryptionMode === 'server-side'}
                  disabled={loadingEncryptionMode}
                  onChange={() => this.handleSetEncryptionMode('server-side')}
                />
                <label className={'font-light ' + (loadingEncryptionMode ? 'cursor-wait' : 'cursor-pointer')}
                  onClick={() => this.handleSetEncryptionMode('server-side')}
                >Server-side</label>
              </div>

              {errorEncryptionMode && (
                errorEncryptionMode === 'Unknown Error'
                  ? <UnknownError />
                  : <div className='error'>{errorEncryptionMode}</div>
              )}
            </div>
          </div>

          {!adminLogic.saasSubscriptionNotActive(admin) &&
            <div>
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
          }

        </div>
      </div>
    )
  }
}

AppUsersTable.propTypes = {
  appName: string,
  admin: object,
}
