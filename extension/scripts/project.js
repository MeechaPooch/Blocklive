console.log('CollabLive Project Inject Running...')
console.log(getCurrentTab())

function onChange(e) {
    console.log(e);
}

function inject(workspace) {
    workspace.addChangeListener(onChange);
}


// Run injector when main workspace is available
document.querySelector("#view > div > div.inner > div.flex-row.preview-row.force-row > div.project-buttons > button").onclick = async (e)=>{while(!Blockly.getMainWorkspace()){await new Promise(res=>setTimeout(res,100))}inject(Blockly.getMainWorkspace())}