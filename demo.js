function cssStyle2DomStyle(sName) {
  // 填写JavaScript
  sName = sName.split('')
  let result = ''
  for (let i = 0; i < sName.length; i++) {
    if (sName[i] === '-' && i === 0) continue
    else {
      if (sName[i - 1] === '-' && i - 1 !== 0) {
        result = result + sName[i].toUpperCase()
      } else {
        result = result + sName[i]
      }
    }
  }
  return result
}
console.log(cssStyle2DomStyle('fonr-size'))
