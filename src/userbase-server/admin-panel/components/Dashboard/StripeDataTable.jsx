import React from 'react'
import { formatDate } from '../../utils'

export const StripeDataTable = (stripeData, isProd) => {
  const { customerId, subscriptionStatus, cancelSubscriptionAt, subscriptionId, subscriptionPlanId, trialExpirationDate } = stripeData

  return (
    <table className='mt-4 table-auto w-3/4 border border-black mx-auto text-xs'>
      <tbody>
        {trialExpirationDate &&
          <tr>
            <td className='border border-black px-1 font-light text-left'>Trial Expires On</td>
            <td className='border border-black px-1 font-light text-left'>{formatDate(trialExpirationDate, false)}</td>
          </tr>
        }

        <tr>
          <td className='border border-black px-1 font-light text-left'>Customer</td>
          <td className='border border-black px-1 font-light text-left'>
            {customerId
              ? <a
                href={'https://dashboard.stripe.com' + (isProd ? '' : '/test') + '/customers/' + customerId}>
                {customerId}
              </a>
              : 'No customer saved.'
            }
          </td>
        </tr>

        <tr>
          <td className='border border-black px-1 font-light text-left'>Subscription Status</td>
          <td className='border border-black px-1 font-light text-left'>{subscriptionStatus || 'No subscription saved.'}</td>
        </tr>

        {cancelSubscriptionAt &&
          <tr>
            <td className='border border-black px-1 font-light text-left'>Canceling Subscription On</td>
            <td className='border border-black px-1 font-light text-left'>{formatDate(cancelSubscriptionAt, false)}</td>
          </tr>
        }

        <tr>
          <td className='border border-black px-1 font-light text-left'>Subscription</td>
          <td className='border border-black px-1 font-light text-left'>
            {subscriptionId
              ? <a
                href={'https://dashboard.stripe.com' + (isProd ? '' : '/test') + '/subscriptions/' + subscriptionId}>
                {subscriptionId}
              </a>
              : 'No subscription saved.'
            }
          </td>
        </tr>

        <tr>
          <td className='border border-black px-1 font-light text-left'>Subscription Plan</td>
          <td className='border border-black px-1 font-light text-left'>
            {subscriptionPlanId
              ? <a
                href={'https://dashboard.stripe.com' + (isProd ? '' : '/test') + '/plans/' + subscriptionPlanId}>
                {subscriptionPlanId}
              </a>
              : 'No subscription saved.'
            }
          </td>
        </tr>

      </tbody>
    </table>
  )
}
