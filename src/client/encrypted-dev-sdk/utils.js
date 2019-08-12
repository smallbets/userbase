// source: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/CapacityUnitCalculations.html
export const sizeOfDdbItems = (items) => {
  let bytes = 0

  items.forEach(item => {
    for (let attribute in item) {
      if (!item.hasOwnProperty(attribute)) continue

      bytes += attribute.length

      const value = item[attribute]

      switch (typeof value) {
        case 'string':
          bytes += value.length // The size of a string is(length of attribute name) + (number of UTF - 8 - encoded bytes).
          break
        case 'number':
          bytes += Math.ceil((value.toString().length / 2)) + 1 // Numbers are variable length, with up to 38 significant digits.Leading and trailing zeroes are trimmed.The size of a number is approximately(length of attribute name) + (1 byte per two significant digits) + (1 byte).
          break
        case 'boolean':
          bytes += 1 // The size of a null attribute or a Boolean attribute is(length of attribute name) + (1 byte).
          break
        default:
          if (value.type === 'Buffer') {
            bytes += value.data.length // The size of a binary attribute is (length of attribute name) + (number of raw bytes).
          }
      }
    }
  })

  return bytes
}

export const getSecondsSinceT0 = (t0) => {
  return `${((performance.now() - t0) / 1000).toFixed(2)}`
}

export const readArrayBufferAsString = (arrayBuffer) => {
  return new Promise(resolve => {
    let reader = new FileReader()
    reader.onload = () => {
      resolve(reader.result)
    }
    reader.readAsText(new Blob([arrayBuffer]))
  })
}
