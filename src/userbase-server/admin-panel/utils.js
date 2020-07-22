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

export const formatSize = (size) => {
  const kb = (size || 0) / 1000
  if (kb < 100) return kb.toFixed(3) + ' KB'

  const mb = kb / 1000
  if (mb < 100) return mb.toFixed(1) + ' MB'

  const gb = mb / 1000
  return gb.toFixed(1) + ' GB'
}
