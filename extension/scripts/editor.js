collabliveId = " "
console.log('CollabLive Editor Inject Running...')

function sleep(millis) {
    return new Promise(res => setTimeout(res, millis));
}

function onChange(e) {
    console.log(e)
    chrome.runtime.sendMessage("jbcjbjfonemiohcadmlfpffgjmmhhjke", e, function (response) {
    });
}








// Inject
(async function () {
    console.log(window)
    // Wait for blockly main workspace to exist
    while (typeof Blockly == 'undefined' || !window.Blockly?.getMainWorkspace()) {
        await sleep(100)
    }
    Blockly.getMainWorkspace().addChangeListener(onChange)
    // document.blocklyCapturer(Blockly)
    // console.log("ready")
})();

