export default {
  'Success': 200,

  'Bad Request': 400,
  'Unauthorized': 401,
  'Payment Required': 402,
  'Not Found': 404,
  'Conflict': 409,
  'Too Many Requests': 429,

  'Internal Server Error': 500,
  'Service Unavailable': 503,
  'Gateway Timeout': 504,

  // WebSocket close event codes
  'Service Restart': 1012,

  // Custom ws close event codes
  'No Pong Received': 3000,
  'Client Already Connected': 3001
}
