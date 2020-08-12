import uuidv4 from 'uuid/v4'
import logger from './logger'
import { getMsUntil1AmPst } from './utils'
import purge from './purge'
import meter from './meter'

const MS_IN_AN_HOUR = 60 * 60 * 1000

const runNightly = async (nightlyId) => {
  await purge(nightlyId)
  await meter(nightlyId)

  scheduleNightly()
}

const scheduleNightly = () => {
  const msUntil1AmPst = getMsUntil1AmPst()

  // quick and dirty way to reduce the chance >1 instances run the nightly at the same time. Ok if 2 happen
  // to run at the same time, worst case is 1 encounters a conflict error and fails, but other should succeed
  const randomTwoHourWindow = Math.random() * 2 * MS_IN_AN_HOUR
  const nextNightlyStart = msUntil1AmPst + randomTwoHourWindow

  const nightlyId = uuidv4()

  // schedule next nightly to start some time between 1am - 3am PST
  setTimeout(() => runNightly(nightlyId), nextNightlyStart)

  logger.child({ nightlyId, nextNightly: new Date(Date.now() + nextNightlyStart).toISOString() }).info('Scheduled nightly')
}

export default scheduleNightly
