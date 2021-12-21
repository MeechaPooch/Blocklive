collabliveId = " "
console.log('CollabLive Editor Inject Running...')

function sleep(millis) {
    return new Promise(res => setTimeout(res, millis));
}

var exId = 'gldgilbeipcefapiopheheghmjbgjepb'

// Connect To Background Script
var port = chrome.runtime.connect(exId);
var isConnected = true;
// port.postMessage();
port.onMessage.addListener(function(msg) {
    if(msg.meta="blockly.event") {
        runEventFromMessageData(msg.data)
    }
});
port.onDisconnect.addListener((port)=>{
    isConnected = false;
})

function onChange(e) {
    console.log(e)
    if(!e.recordUndo) {return}
    lastevent = e
    if(!isConnected) {port = chrome.runtime.connect(exId);}

    if(e.blockId in newMade) {
        port.postMessage({meta:"blockly.event",data:{type:newMade[e.blockId].type,json:newMade[e.blockId].toJson()}})
        delete newMade[e.blockId]
    } 
    if(!isRecievedEvent(e)) {
        if(e.type == "create") {
            newMade[e.blockId] = e
        } else {
            port.postMessage({meta:"blockly.event",data:{type:e.type,json:e.toJson()}}, function (response) {
                console.log("response: " + response)
            });
        }
    }
}

let playedEvents = []
let newMade = {}

function runEventFromMessageData(d) {
    let event = ScratchBlocks.Events.fromJson(d.json,d.json.type)
    event.workspaceId = ScratchBlocks.getMainWorkspace().id
    // event.recordUndo = false;
    playedEvents.push(event)
    event.run(true)
}

function isSameEvent(ran,caught) {
    for (entry of Object.entries(caught)) {
        if(entry[0] != "group" && entry[0] != "recordUndo" && entry[0] != "workspaceId" && entry[0] != "xml" && !entry[0].includes("old")) {
            if(JSON.stringify(ran[entry[0]]) != JSON.stringify(entry[1])) {console.log(`${entry[0]}: ${entry[1]} vs ${ran[entry[0]]}`);return false;}
        }
    }
    return true;
}
function isRecievedEvent(caught) {
    for(let i=0;i<playedEvents.length;i++) {
        if(isSameEvent(playedEvents[i],caught)) {
            playedEvents.splice(i,1);
            return true
        }
    }
    return false
}


// Trap ScratchBlocks -- adapted from https://github.com/ScratchAddons/ScratchAddons/blob/4248dc327a9f3360c77b94a89e396903218a2fc2/addon-api/content-script/Trap.js
function sleep(millis) {
    return new Promise(res=>setTimeout(res,millis));
}

function getObj(lambda) {
    return new Promise(async res=>{
        let output;
        while(!(output = lambda())) {
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

// Register Workspace Change Listerner
ScratchBlocks.getMainWorkspace().addChangeListener(onChange)


// Send Trapped Message
port.postMessage({meta:"sb.trapped"}, function (response) {
    console.log("response: " + response)
});
})()





