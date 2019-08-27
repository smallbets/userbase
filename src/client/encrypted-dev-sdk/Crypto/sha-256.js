const ALGORITHM_NAME = 'SHA-256'

/**
 *
 * @param {ArrayBuffer} data
 */
const hash = async (data) => {
  const result = await window.crypto.subtle.digest(
    {
      name: ALGORITHM_NAME,
    },
    data
  )
  return result
}

export default {
  hash
}
