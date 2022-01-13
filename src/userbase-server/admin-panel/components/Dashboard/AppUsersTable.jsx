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
import { STRIPE_CLIENT_ID, FREE_PLAN_USERS_LIMIT, getStripeState } from '../../config'
import EncryptionModeModal from './EncryptionModeModal'

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
      domains: [],
      domainName: '',
      paymentsState: {
        paymentsMode: '',
        trialPeriodDays: '',
        newTrialPeriodDays: '',
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
    this.handleTrialPeriodInputChange = this.handleTrialPeriodInputChange.bind(this)
    this.handleSetTrialPeriod = this.handleSetTrialPeriod.bind(this)
    this.handleDeleteTrial = this.handleDeleteTrial.bind(this)
    this.handleEnableTestPayments = this.handleEnableTestPayments.bind(this)
    this.handleEnableProdPayments = this.handleEnableProdPayments.bind(this)
    this.handleTogglePaymentRequired = this.handleTogglePaymentRequired.bind(this)
    this.handleSetEncryptionMode = this.handleSetEncryptionMode.bind(this)
    this.handleShowEncryptionModeModal = this.handleShowEncryptionModeModal.bind(this)
    this.handleHideEncryptionModeModal = this.handleHideEncryptionModeModal.bind(this)
    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleAddDomainToWhitelist = this.handleAddDomainToWhitelist.bind(this)
    this.handleDeleteDomain = this.handleDeleteDomain.bind(this)
  }

  async componentDidMount() {
    this._isMounted = true

    const { appName } = this.props
    const { paymentsState } = this.state

    try {
      const [listAppUsersResponse, domainWhitelist] = await Promise.all([
        dashboardLogic.listAppUsers(appName),
        dashboardLogic.getDomainWhitelist(appName),
      ])
      const { users, appId, encryptionMode, paymentsMode, paymentRequired, trialPeriodDays } = listAppUsersResponse
      const { domains } = domainWhitelist
      if (appId !== domainWhitelist.appId) throw new Error('Please refresh the page!')

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
        ...paymentsState,
        paymentsMode,
        paymentRequired,
        trialPeriodDays,
      }

      if (this._isMounted) this.setState({ appId, encryptionMode, activeUsers, deletedUsers, domains, loading: false, paymentsState: updatedPaymentsState })
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

  handleTrialPeriodInputChange(event) {
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

  async handleSetTrialPeriod(event) {
    event.preventDefault()
    const { appName } = this.props
    const { appId, paymentsState } = this.state

    try {
      const { newTrialPeriodDays } = paymentsState
      if (!newTrialPeriodDays) return

      this.setState({
        paymentsState: {
          ...paymentsState,
          loadingSetTrialPeriod: true,
          errorPaymentsPortal: false
        }
      })

      await dashboardLogic.setTrialPeriod(appName, appId, newTrialPeriodDays)

      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingSetTrialPeriod: false,
            trialPeriodDays: newTrialPeriodDays
          }
        })
      }
    } catch (e) {
      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingSetTrialPeriod: false,
            errorPaymentsPortal: e.message
          }
        })
      }
    }
  }

  async handleDeleteTrial(event) {
    event.preventDefault()
    const { appName } = this.props
    const { appId, paymentsState } = this.state

    if (!window.confirm("Are you sure you want to remove your app's free trial?")) return

    try {
      this.setState({
        paymentsState: {
          ...paymentsState,
          loadingDeleteTrial: true,
          errorPaymentsPortal: false
        }
      })

      await dashboardLogic.deleteTrial(appName, appId)

      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingDeleteTrial: false,
            trialPeriodDays: undefined,
          }
        })
      }
    } catch (e) {
      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingDeleteTrial: false,
            errorPaymentsPortal: e.message
          }
        })
      }
    }
  }

  async handleTogglePaymentRequired(event) {
    event.preventDefault()
    const { appName } = this.props
    const { appId, paymentsState } = this.state

    try {
      this.setState({
        paymentsState: {
          ...paymentsState,
          loadingPaymentRequired: true,
          errorPaymentsPortal: false
        }
      })

      const { paymentRequired } = paymentsState
      await dashboardLogic.setPaymentRequired(appName, appId, !paymentRequired)

      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingPaymentRequired: false,
            paymentRequired: !paymentRequired
          }
        })
      }
    } catch (e) {
      if (this._isMounted) {
        this.setState({
          paymentsState: {
            ...paymentsState,
            loadingPaymentRequired: false,
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

  handleInputChange(event) {
    const target = event.target
    const value = target.value
    const name = target.name

    this.setState({
      [name]: value,
      errorAddingDomainToWhitelist: false,
      errorDeletingDomainFromWhitelist: false,
    })
  }

  async handleAddDomainToWhitelist(e) {
    e.preventDefault()

    const { appId, domainName, loadingAddDomainToWhitelist } = this.state
    if (loadingAddDomainToWhitelist) return
    if (!domainName) return

    this.setState({ errorAddingDomainToWhitelist: false, errorDeletingDomainFromWhitelist: false })

    try {
      this.setState({ loadingAddDomainToWhitelist: true })

      const domain = await dashboardLogic.addDomainToWhitelist(appId, domainName)
      if (this._isMounted) {
        const { domains } = this.state
        domains.push({ domain })
        this.setState({ loadingAddDomainToWhitelist: false, domainName: '', domains })
      }
    } catch (e) {
      if (this._isMounted) this.setState({ loadingAddDomainToWhitelist: false, errorAddingDomainToWhitelist: e.message })
    }
  }

  async handleDeleteDomain(domain, i) {
    const { appId } = this.state
    const initDomains = this.state.domains

    this.setState({ errorAddingDomainToWhitelist: false, errorDeletingDomainFromWhitelist: false })

    if (initDomains[i] && initDomains[i].domain === domain) {
      let errorDeletingDomainFromWhitelist = false
      try {
        initDomains[i].deleting = true
        this.setState({ domains: initDomains })

        await dashboardLogic.deleteDomainFromWhitelist(appId, domain)
      } catch (e) {
        errorDeletingDomainFromWhitelist = e.message
      }

      if (this._isMounted) {
        const finalDomains = this.state.domains

        for (let j = 0; j < finalDomains.length; j++) {
          if (finalDomains[j].domain === domain) {
            if (!errorDeletingDomainFromWhitelist) {
              finalDomains.splice(j, 1) // remove from array since deleted successfully
            } else {
              delete finalDomains[j].deleting
            }
            break
          }
        }

        this.setState({ domains: finalDomains, errorDeletingDomainFromWhitelist })
      }
    }
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
      domains,
      domainName,
      loadingAddDomainToWhitelist,
      errorAddingDomainToWhitelist,
      errorDeletingDomainFromWhitelist,
    } = this.state

    const {
      paymentsMode,
      paymentRequired,
      trialPeriodDays,
      newTrialPeriodDays,
      loadingPaymentsMode,
      loadingPlanMode,
      loadingSetTrialPeriod,
      loadingDeleteTrial,
      loadingPaymentRequired,
      errorPaymentsPortal,
    } = paymentsState

    const disableProdPaymentSelection = admin && !adminLogic.saasSubscriptionActive(admin) && paymentsMode !== 'prod'

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
              adminLogic.saasSubscriptionActive(admin) ? <div />
                : <div className='text-left mb-4 text-orange-600 font-normal'>
                  The Starter plan is limited to 1 app and {FREE_PLAN_USERS_LIMIT} users. <a href="#edit-account">Remove this limit</a> with a Userbase subscription.
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
                                        Stripe account not connected. See Payments Portal below.
                                      </span>
                                    }
                                  </h6>

                                  <h6 className='mb-4'>Prod Stripe Data:
                                    {user['prodStripeData']
                                      ? StripeDataTable(user['prodStripeData'], true)
                                      : <span className='font-light ml-1'>
                                        Stripe account not connected. See Payments Portal below.
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
                                            Stripe account not connected. See Payments Portal below.
                                          </span>
                                        }
                                      </h6>

                                      <h6 className='mb-4'>Prod Stripe Data:
                                        {user['prodStripeData']
                                          ? StripeDataTable(user['prodStripeData'], true)
                                          : <span className='font-light ml-1'>
                                            Stripe account not connected. See Payments Portal below.
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
          <p className='text-left font-normal mb-4'>Collect recurring payments on your app with Stripe. Check the <a href='https://userbase.com/docs/sdk/#sdk-payments' target='_blank' rel='noopener noreferrer'>docs on Payments</a> for detailed instructions.</p>

          {
            adminLogic.saasSubscriptionActive(admin) ? <div />
              : <div className='text-left mb-6 text-orange-600 font-normal'>
                The Starter plan is limited to test payments. <a href="#edit-account">Remove this limit</a> with a Userbase subscription.
              </div>
          }

          {loading
            ? <div className='text-center'><div className='loader w-6 h-6 inline-block' /></div>
            : connectedToStripe
              ? <div>

                <label className='flex items-center mb-4 fit-content'>
                  <div className={`relative ${disableProdPaymentSelection ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type='checkbox'
                      className='hidden'
                      checked={paymentsMode === 'prod'}
                      onChange={(e) => paymentsMode === 'prod' ? this.handleEnableTestPayments(e, loadingPaymentsMode, true) : this.handleEnableProdPayments(e)}
                      disabled={disableProdPaymentSelection || loadingPlanMode}
                    />
                    <div className={`w-10 h-4 rounded-full shadow-inner ${disableProdPaymentSelection ? 'bg-gray-200' : 'bg-gray-400'}`} />
                    <div className='toggle-dot absolute w-6 h-6 bg-white rounded-full shadow' />
                  </div>

                  <div className={`ml-3 font-medium ${disableProdPaymentSelection ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer text-gray-600 hover:text-gray-800'}`}>
                    {paymentsMode === 'prod' ? 'Production mode' : 'Test mode'}
                  </div>

                  {loadingPlanMode && <div className='loader w-4 h-4 ml-4 inline-block' />}
                </label>

                <label className='flex items-center mb-4 fit-content'>
                  <div className='relative cursor-pointer'>
                    <input
                      type='checkbox'
                      className='hidden'
                      checked={paymentRequired}
                      onChange={this.handleTogglePaymentRequired}
                      disabled={loadingPaymentRequired}
                    />
                    <div className='w-10 h-4 bg-gray-400 rounded-full shadow-inner' />
                    <div className='toggle-dot absolute w-6 h-6 bg-white rounded-full shadow' />
                  </div>

                  <div className='ml-3 text-gray-600 hover:text-gray-800 font-medium cursor-pointer'>
                    {paymentRequired ? 'Payment required to open a database' : 'No payment required to open a database'}
                  </div>

                  {loadingPaymentRequired && <div className='loader w-4 h-4 ml-4 inline-block' />}
                </label>

                <form className='mt-6 mb-4' onSubmit={this.handleSetTrialPeriod}>
                  <div className='table-row'>
                    <div className='table-cell w-32 sm:w-40'>
                      Free Trial <span className='font-light'>(optional)</span>
                    </div>

                    {trialPeriodDays
                      ? <span>
                        <div className='table-cell font-normal'>
                          {trialPeriodDays === 1 ? '1 day' : `${trialPeriodDays} days`}
                        </div>

                        <span className='ml-4 w-24'>
                          {
                            loadingDeleteTrial
                              ? <span className='loader w-4 h-4 inline-block' />
                              : <span className='font-normal text-sm text-yellow-700'>
                                <FontAwesomeIcon
                                  className='cursor-pointer'
                                  onClick={this.handleDeleteTrial}
                                  icon={faTrashAlt}
                                />
                              </span>
                          }
                        </span>
                      </span>

                      : <span>
                        <div className='table-cell w-32 sm:w-40'>
                          <input
                            className='font-light text-xs sm:text-sm w-48 sm:w-56 h-8 p-2 border border-gray-500 outline-none'
                            type='number'
                            min={1}
                            max={730}
                            name='newTrialPeriodDays'
                            autoComplete='off'
                            spellCheck={false}
                            onChange={this.handleTrialPeriodInputChange}
                            placeholder='days'
                          />
                        </div>

                        <input
                          className='btn w-24 ml-2'
                          type='submit'
                          value={loadingSetTrialPeriod ? 'Saving...' : 'Save'}
                          disabled={!newTrialPeriodDays || loadingSetTrialPeriod}
                        />
                      </span>
                    }
                  </div>
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

          <div className='flex-0 text-lg sm:text-xl text-left mb-1'>Domain Whitelist</div>
          <p className='text-left font-normal'>Ensure your app ID only works from fixed domains.</p>

          {loading
            ? <div className='text-center'><div className='loader w-6 h-6 inline-block' /></div>
            : <table className='mt-6 mb-8 table-auto w-96 max-w-full border-none mx-auto text-xs'>

              <thead>
                <tr className='border-b'>
                  <th className='px-1 py-1 text-gray-800 text-left'>Domain</th>
                  <th className='px-1 py-1 text-gray-800 text-left'></th>
                </tr>
              </thead>

              <tbody>
                {domains.map((domain, i) => {
                  return (
                    <tr key={i} className='border-b h-8'>
                      <td className='px-1 font-light text-left'>{domain.domain}</td>
                      <td className='px-1 font-light w-8 text-center'>

                        {domain['deleting']
                          ? <div className='loader w-4 h-4 inline-block' />
                          : <div
                            className='font-normal text-sm cursor-pointer text-yellow-700'
                            onClick={() => this.handleDeleteDomain(domain.domain, i)}
                          >
                            <FontAwesomeIcon icon={faTrashAlt} />
                          </div>
                        }

                      </td>
                    </tr>
                  )
                })}

                <tr className='border-b h-8'>
                  <td className='px-1 font-light text-left'>
                    <form className='my-2' onSubmit={this.handleAddDomainToWhitelist}>
                      <span className='flex'>
                        <input
                          className='flex-4 font-light text-xs sm:text-sm w-48 sm:w-56 h-8 p-2 border border-gray-500 outline-none'
                          type='text'
                          name='domainName'
                          autoComplete='off'
                          onChange={this.handleInputChange}
                          placeholder='https://example.com'
                          value={domainName}
                        />

                        <input
                          className='btn w-24 ml-2'
                          type='submit'
                          value={loadingAddDomainToWhitelist ? 'Adding...' : 'Add'}
                          disabled={!domainName || loadingAddDomainToWhitelist}
                        />
                      </span>
                    </form>
                  </td>
                  <td></td>
                </tr>

              </tbody>
            </table>
          }

          <div className='text-center'>
            {errorAddingDomainToWhitelist && (
              errorAddingDomainToWhitelist === 'Unknown Error'
                ? <UnknownError action='adding the domain to the whitelist' />
                : <div className='error'>{errorAddingDomainToWhitelist}</div>
            )}

            {errorDeletingDomainFromWhitelist && (
              errorDeletingDomainFromWhitelist === 'Unknown Error'
                ? <UnknownError action='deleting the domain from the whitelist' />
                : <div className='error'>{errorDeletingDomainFromWhitelist}</div>
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

          {adminLogic.saasSubscriptionActive(admin) &&
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
