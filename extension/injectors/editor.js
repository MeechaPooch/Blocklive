console.log('injecting')

// alert(chrome.runtime.id)
let scriptElem = document.createElement('script')
scriptElem.src = chrome.runtime.getURL("/scripts/editor.js")
document.body.append(scriptElem)