import { library, icon } from '@fortawesome/fontawesome-svg-core'
import { faExclamationTriangle, faTimesCircle } from '@fortawesome/free-solid-svg-icons'

library.add(faExclamationTriangle, faTimesCircle)

const exclamationTriangle = icon({ prefix: 'fas', iconName: 'exclamation-triangle' })
const timesCircle = icon({ prefix: 'fas', iconName: 'times-circle' })

export default {
  exclamationTriangle,
  timesCircle
}
