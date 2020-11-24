import React from 'react'
import { func } from 'prop-types'

// source: https://tailwindui.com/components/application-ui/overlays/modals
const EncryptionModeModal = ({ handleHideEncryptionModeModal }) => {
  return (
    <div className="fixed z-50 inset-0 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-32 text-center sm:block sm:p-0">

        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full" role="dialog" aria-modal="true" aria-labelledby="modal-headline">

          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h2 className="text-xl leading-6 font-bold text-gray-900">
                  Encryption Modes
                </h2>

                <h3 className="text-lg leading-6 font-medium text-gray-900 mt-4">
                  End-to-end <span className='text-sm font-light'>(Default)</span>
                </h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    Userbase encrypts all database operations in the browser with user-controlled keys. No one but your users and the people they share data with can access their encrypted data, not even us. Sounds great, right? It is, but it comes with a serious tradeoff: if a user forgets their password and loses access to their device, their data cannot be recovered. With this mode, we recommend that you inform your users that since their data is end-to-end encrypted, they should take care to store their password in a safe place, such as a password manager. End-to-end encryption helps you prevent personal data misuse, and lets you offer a high level of data privacy.
                  </p>
                </div>

                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Server-side
                </h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    Userbase encrypts data on the wire and at rest before storing it. If a user forgets their password in this mode, they can simply reset it and continue using their account with all their data, just like normal. The tradeoff with this mode is that the server has access to your users&apos; data. This mode still protects you from personal data misuse, and offers a higher level of data privacy than most comparable services.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-2 pb-6 sm:px-6 sm:flex sm:flex-row-reverse">
            <input
              className='btn inline-flex text-center justify-center w-full sm:w-24 select-none'
              type='submit'
              value='Close'
              onClick={handleHideEncryptionModeModal}
            />
            <input
              className='btn inline-flex text-center justify-center w-full mt-3 sm:mt-0 sm:w-24 sm:mr-4 select-none'
              type='submit'
              value='Learn more'
              onClick={() => window.open('https://userbase.com/docs/faq/', '_blank')}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

EncryptionModeModal.propTypes = {
  handleHideEncryptionModeModal: func,
}

export default EncryptionModeModal
