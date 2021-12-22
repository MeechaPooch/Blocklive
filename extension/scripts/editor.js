collabliveId = " "
console.log('CollabLive Editor Inject Running...')



// vm.runtime.getSpriteTargetByName("Sprite6").blocks.blocklyListen(ev) 

// let prevadd = vm.addSprite
// function newAdd(...info) {
//     console.log(info[0])
//     let retval = prevadd.bind(vm)(...info)
//     console.log(retval)
//     retval.then(()=>{console.log(vm.editingTarget)})
//     return retval
// }
// vm.addSprite = newAdd

if(typeof vm == 'undefined') {
    alert('Scratch LiveShare Inject VM Capture Failed! To use LiveShare, reload tab cache (ctrl + shift + r)')
}
proxyActions = {}
//action: vm action function
//name: name to put in recort
//mutator: args generator from recieved data object (has args field)
//then: callback for those replaying action
function proxy(action,name,extrargs,mutator,then) {
    let proxiedFunction =function(...args) {
        if(args[0]=='linguini') {
            args.splice(0,1)
            let data = args.splice(0,1)[0]
            console.log('data:')
            console.log(data)
            if(mutator){args = mutator(data)}
            // else {args = data.args}

            let prevTarget = vm.editingTarget
            let retval = action.bind(vm)(...args)
            if(then){retval.then(()=>{then(prevTarget,vm.editingTarget)})}
            return retval
        } else {
            let extrargsObj = null;
            if(!!extrargs) {extrargsObj=extrargs(args)}
            liveMessage({meta:"sprite.proxy",data:{name,args,extrargs:extrargsObj}})

            let retval = action.bind(vm)(...args)
            return retval
        }
    }
    proxyActions[name] = proxiedFunction;
    return proxiedFunction;
}


// vm.editingTarget = a;
// vm.emitTargetsUpdate(false /* Don't emit project change */);
// vm.emitWorkspaceUpdate();
vm.addSprite = proxy(vm.addSprite,"addsprite",null,null,((a,b)=>{vm.setEditingTarget(a.id)}))
vm.deleteSprite = proxy(vm.deleteSprite,"deletesprite",
    (args)=>({name:vm.runtime.getTargetById(args[0]).sprite.name}),
    (data)=>[vm.runtime.getSpriteTargetByName(data.extrargs.name).id])
vm.renameSprite = proxy(vm.renameSprite,"renamesprite",
    (args)=>({oldName:vm.runtime.getTargetById(args[0]).sprite.name}),
    (data)=>[vm.runtime.getSpriteTargetByName(data.extrargs.oldName).id,data.args[1]])
vm.reorderTarget = proxy(vm.reorderTarget,"reordertarget")
vm.shareBlocksToTarget = proxy(vm.shareBlocksToTarget,"shareblocks",
(args)=>({toName:vm.runtime.getTargetById(args[1]).sprite.name}),
(data)=>[data.args[0],vm.runtime.getSpriteTargetByName(data.extrargs.toName).id],()=>{vm.emitWorkspaceUpdate()})
// vm.shareBlocksToTarget
// vm.shareCostumeToTarget

// no sure what this does but it might be useful at some point this.editingTarget.fixUpVariableReferences();



function sleep(millis) {
    return new Promise(res => setTimeout(res, millis));
}

var exId = 'gldgilbeipcefapiopheheghmjbgjepb'

// Connect To Background Script
var port = chrome.runtime.connect(exId);
var isConnected = true;
// port.postMessage();
port.onMessage.addListener(function(msg) {
    if(msg.meta=="blockly.event") {
        runEventFromMessageData(msg.data)
    } else if (msg.meta=="sprite.proxy") {
        proxyActions[msg.data.name](...(['linguini'].concat(msg.data).concat(msg.data.args)))
    }
});
port.onDisconnect.addListener(()=>{
    isConnected = false;
})
function liveMessage(...args) {
if(!isConnected) {port = chrome.runtime.connect(exId); isConnected = (!!port)}
port.postMessage(...args)
}


function onChange(e) {
    console.log(e)
    if(!e.recordUndo) {return}
    lastevent = e

    if(e.blockId in newMade) {
        liveMessage({meta:"blockly.event",data:{
            targetId:vm.editingTarget.id,
            targetName:vm.editingTarget.sprite.name,
            type:newMade[e.blockId].type,
            json:newMade[e.blockId].toJson()
        }})
        delete newMade[e.blockId]
    } else if(e.commentId in newMade) {
        liveMessage({meta:"blockly.event",data:{
            targetId:vm.editingTarget.id,
            targetName:vm.editingTarget.sprite.name,
            type:newMade[e.commentId].type,
            json:newMade[e.commentId].toJson()}})
        delete newMade[e.commentId]
    }
    if(!isRecievedEvent(e)) {
        if(e.type == "create") {
            newMade[e.blockId] = e
        } else if(e.type=="comment_create") {
            newMade[e.commentId] = e
        } else {
            liveMessage({meta:"blockly.event",data:{
                targetId:vm.editingTarget.id,
                targetName:vm.editingTarget.sprite.name,
                type:e.type,
                json:e.toJson()}}, 
            function (response) {
            console.log("response: " + response)
            });
        }
    }
}

let playedEvents = []
let newMade = {}

function runEventFromMessageData(d) {
    let event = ScratchBlocks.Events.fromJson(d.json,d.json.type)
    // Todo: consider changing to a id system?
    // Todo: catch stage not being sprite
    if(d.targetName == vm.editingTarget.sprite.name) {
        event.workspaceId = ScratchBlocks.getMainWorkspace().id
        // event.recordUndo = false;
        playedEvents.push(event)
        event.run(true)
    } else {
        let trueTarget = vm.runtime.getSpriteTargetByName(d.targetName)
        playedEvents.push(event)
        trueTarget.blocks.blocklyListen(event)
    }
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
liveMessage({meta:"sb.trapped"}, function (response) {
    console.log("response: " + response)
});
})()





