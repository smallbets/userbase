// source: https://github.com/manishsaraan/email-validator
const EMAIL_REGEX = /^[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/
export const validateEmail = (email) => {
  if (!email) return false

  if (email.length > 254) return false

  const valid = EMAIL_REGEX.test(email)
  if (!valid) return false

  // Further checking of some things regex can't handle
  const parts = email.split('@')
  if (parts[0].length > 64) return false

  const domainParts = parts[1].split('.')
  if (domainParts.some(part => part.length > 63)) return false

  return true
}
