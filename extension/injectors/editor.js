console.log('injecting editor.js')

// alert(chrome.runtime.id)
let scriptElem = document.createElement('script')
let srcThign = chrome.runtime.getURL("/scripts/editor.js")
scriptElem.src = srcThign
// document.body.append(scriptElem)
document.documentElement.appendChild(scriptElem)