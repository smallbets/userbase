export const formatDate = (date, long = true) => {
  try {
    const format = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }

    if (long) {
      format.hour = 'numeric'
      format.minute = 'numeric'
      format.second = 'numeric'
      format.timeZoneName = 'short'
    }

    const formattedDate = new Date(date).toLocaleDateString([], format)

    return formattedDate === new Date(date).toLocaleDateString()
      ? date
      : formattedDate

  } catch {
    return date
  }
}
