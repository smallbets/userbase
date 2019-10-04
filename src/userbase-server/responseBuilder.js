import statusCodes from './statusCodes'

const errorResponse = (status, data) => ({
  status,
  data
})

const successResponse = (data) => ({
  status: statusCodes['Success'],
  data
})

export default {
  errorResponse,
  successResponse
}
