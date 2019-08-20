export const getSecondsSinceT0 = (t0) => {
  return `${((performance.now() - t0) / 1000).toFixed(2)}`
}

export const readArrayBufferAsString = (arrayBuffer) => {
  return new Promise(resolve => {
    let reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsText(new Blob([arrayBuffer]))
  })
}
