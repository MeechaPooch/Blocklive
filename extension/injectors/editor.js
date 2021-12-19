console.log('injecting')
document["hello"] = "hi"



document.blocklyCapturer = (Blockly) => {
    Blockly.getMainWorkspace().addChangeListener(onChange);
}
// alert(chrome.runtime.id)

// let idSetter = document.createElement('script')
// // idSetter.innerHTML = `collabliveId = ${chrome.runtime.id}`
// idSetter.innerHTML = `alert('yo')`
// document.body.append(idSetter)


let scriptElem = document.createElement('script')
scriptElem.src = chrome.runtime.getURL("/scripts/editor.js")
document.body.append(scriptElem)