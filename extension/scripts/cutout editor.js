blockliveId = null
console.log('CollabLive Editor Inject Running...')


function sleep(millis) {
    return new Promise(res => setTimeout(res, millis));
}
///.......... BG SCRIPT CONNECTION SETUP ..........//

var exId = 'gldgilbeipcefapiopheheghmjbgjepb'

// Connect To Background Script
var port = chrome.runtime.connect(exId);
var isConnected = true;

function liveMessage(...args) {
}





///.......... TRAPS ..........//

// Trap ScratchBlocks -- adapted from https://github.com/ScratchAddons/ScratchAddons/blob/4248dc327a9f3360c77b94a89e396903218a2fc2/addon-api/content-script/Trap.js
function sleep(millis) {
    return new Promise(res=>setTimeout(res,millis));
}

function getObj(lambda) {
    return new Promise(async res=>{
        let output;
        while(!(output = lambda())) {
            console.log('waiting for lambda resolve: ' + lambda)
            await sleep(100)
        }
        res(output);
    })
}

(async()=>{
let reactElem = (await getObj(()=>document.querySelector('[class^="gui_blocks-wrapper"]')))
let reactInst;
for(let e of Object.entries(reactElem)) {
    if(e[0].startsWith('__reactInternalInstance')) {
        reactInst = e[1];
        break;
    }
}

let childable = reactInst;
/* eslint-disable no-empty */
while (((childable = childable.child), !childable || !childable.stateNode || !childable.stateNode.ScratchBlocks)) {}

ScratchBlocks = childable.stateNode.ScratchBlocks;

// Send Trapped Message
liveMessage({meta:"sb.trapped"}, function (response) {
    console.log("response: " + response)
});
})()

// Thanks garbomuffin and scratchaddons
let vm = Object.values(document.querySelector('div[class^="stage-wrapper_stage-wrapper_"]')).find((x) => x.child)
.child.child.child.stateNode.props.vm;


const oldBlockListener = vm.blockListener.bind(vm)
function blockListenerr(e) {
    console.log('just intrecepted',e)
    // filter ui events and blocklive
   
    // Forward (do) event
    // return oldBlockListener(e)
}
vm.__proto__.blockListener = blockListenerr