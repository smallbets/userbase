import { css, keyframes } from 'emotion'

export const modal = css({
  display: "block",
  position: "fixed",
  zIndex: "50",
  paddingTop: "3rem",
  left: "0",
  top: "0",
  width: "100%",
  height: "100%",
  overflow: "auto",
  backgroundColor: ["rgb(0,0,0)", "rgba(0,0,0,0.4)"]
})

export const container = css({
  maxWidth: "28rem",
  position: "relative",
  fontSize: "0.75rem",
  width: "100%",
  marginRight: "auto",
  marginLeft: "auto",
  fontWeight: "700",
  backgroundColor: "#fff",
  padding: "2rem",
  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  '@media (min-width: 350px)': {
    fontSize: '1rem'
  }
})

export const textLine = css({
  marginBottom: "1rem",
  marginTop: "1rem",
  fontWeight: "400"
})

export const displayKey = css({
  wordBreak: "break-all",
  color: "#e53e3e",
  padding: "0",
  fontWeight: "300",
  fontSize: "0.75rem",
  fontFamily:
    'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  WebkitUserSelect: "all",
  MozUserSelect: "all",
  msUserSelect: "all",
  userSelect: "all",
  '@media (min-width: 350px)': {
    fontSize: '0.875rem'
  }
})

export const table = css({ display: "table" })
export const tableRow = css({ display: "table-row" })
export const tableCell = css({ display: 'table-cell', padding: 0 })

export const loaderWrapper = css({
  textAlign: "center",
  marginTop: "2rem",
  marginBottom: "1.5rem"
})

export const spinKeyframes = keyframes({
  '0%': { transform: 'rotate(0deg)' },
  '100%': { transform: 'rotate(360deg)' }
})

export const loader = css({
  border: "4px solid #f3f3f3",
  borderRadius: "50%",
  borderTop: "4px solid grey",
  width: "1.5rem",
  height: "1.5rem",
  display: "inline-block",
  WebkitAnimation: `${spinKeyframes} 1s linear infinite`,
  animation: `${spinKeyframes} 1s linear infinite`
})

export const button = css({
  fontSize: "1rem",
  borderRadius: "0.5rem",
  width: "6rem",
  paddingTop: "0.25rem",
  paddingBottom: "0.25rem",
  backgroundColor: "#ffd005",
  fontWeight: "700",
  cursor: "pointer",
  color: "#744210",
  height: "2rem"
})

export const buttonCancel = css({
  fontSize: ".875rem",
  borderRadius: "0.5rem",
  width: "6rem",
  paddingTop: "0.25rem",
  paddingBottom: "0.25rem",
  marginLeft: "1rem",
  backgroundColor: "transparent",
  fontWeight: "400",
  cursor: "pointer",
  borderWidth: "1px",
  borderColor: "#718096",
  height: "2rem"
})

export const error = css({
  color: "#e53e3e",
  fontSize: "0.75rem",
  fontStyle: "italic",
  marginTop: "1.5rem",
  fontWeight: "500",
  textAlign: "center"
})

export const message = css({
  color: "#718096",
  fontSize: "0.75rem",
  fontStyle: "italic",
  marginTop: "1.5rem",
  fontWeight: "500"
})

export const divider = css({
  margin: "0",
  boxSizing: "content-box",
  height: "0",
  overflow: "visible",
  marginBottom: "1rem",
  marginTop: "1rem",
  borderTopWidth: "0",
  borderWidth: "1px",
  borderColor: "#cbd5e0"
})

export const requestKeyModalCloseButton = css({
  position: "absolute",
  fontSize: "1.125rem",
  color: "#b7791f",
  right: "0",
  top: "0",
  marginRight: "1rem",
  marginTop: "1rem",
  cursor: "pointer",
  fontWeight: "400"
})

export const requestKeyForm = css({ marginTop: "0.5rem", marginBottom: "1rem" })

export const manualInputKeyForm = css({
  minWidth: "100%",
  marginTop: "2.5rem",
  display: "table"
})

export const manualInputKeyOuterWrapper = css({
  display: "table-row",
  minWidth: "100%"
})

export const manualInputKeyInnerWrapper = css({
  display: "table-cell",
  minWidth: "100%",
  padding: "0"
})

export const secretKeyInput = css({
  fontSize: "0.75rem",
  padding: "0.5rem",
  outline: "0",
  minWidth: "100%",
  fontWeight: "300",
  fontFamily:
    'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  border: "1px solid #a0aec0",
  boxSizing: "border-box"
})

export const submitWrapper = css({ textAlign: "center", marginTop: "1.5rem" })

export const submitInnerWrapper = css({ height: "3rem" })

export const secretKeyButtonOuterWrapper = css({
  textAlign: "center",
  marginTop: "1.5rem",
  height: "4rem"
})

export const secretKeyButtonInputWrapper = css({ height: "1.5rem" })

export const showKeyModalCopiedKeyMessage = css({ display: "none" })

export const faTimesCircle = css({ fontWeight: "400" })

export const faExclamationTriangle = css({ fontWeight: "400", color: "#e53e3e" })
