import React from 'react'

export const ProfileTable = (profile) => {
  return (
    <table className='mt-4 table-auto w-3/4 border border-black mx-auto text-xs'>
      <thead>
        <tr>
          <th className='border border-black px-1 py-1 text-gray-800 text-left'>Key</th>
          <th className='px-1 py-1 text-gray-800 text-left'>Value</th>
        </tr>
      </thead>
      <tbody>
        {Object.keys(profile).map(key => {
          return (
            <tr key={key}>
              <td className='border border-black px-1 font-light text-left'>{key}</td>
              <td className='border border-black px-1 font-light text-left'>{profile[key]}</td>
            </tr>
          )
        })
        }
      </tbody>
    </table>
  )
}
