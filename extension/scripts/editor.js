collabliveId = " "
console.log('CollabLive Editor Inject Running...')

// Thanks garbomuffin and scratchaddons
let vm = Object.values(document.querySelector('div[class^="stage-wrapper_stage-wrapper_"]')).find((x) => x.child)
.child.child.child.stateNode.props.vm;

let lastEvent
let __SENDBLOCKS = true;

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

function silently(action) {
    return (...args)=>{
        __SENDBLOCKS = false;
        let retval = action.bind(vm)(...args)
        if(!!retval?.then) {
           retval.then(()=>{__SENDBLOCKS = true}) 
        } else {
            __SENDBLOCKS = true;
        }
        return retval
    }
}
// vm.setEditingTarget = silently(vm.setEditingTarget)
// vm.refreshWorkspace = silently(vm.refreshWorkspace)

// mutator takes data object {name, args, extrargs} and returns args list
function proxy(action,name,extrargs,mutator,before,then,dontSend,dontDo) {
    return anyproxy(vm,action,name,extrargs,mutator,before,then,dontSend,dontDo)
}
function anyproxy(bindTo,action,name,extrargs,mutator,before,then,dontSend,dontDo) {
    let proxiedFunction =function(...args) {
        if(args[0]=='linguini') {
// if linguini, ...args are ['linguini', data, data.args]
            args.splice(0,1)
            let data = args.splice(0,1)[0]
            // console.log('data:')
            // console.log(data)
            if(mutator){args = mutator(data)}
            // else {args = data.args}

            let prevTarget = vm.editingTarget
            if(!!before) {before(data)}
            console.log('args:')
            console.log(...args)
            if(name=='blocks'){lastEvent = args[0]}
            if(dontDo?.(data)) {return}
            let retval = action.bind(bindTo)(...args)
            if(then) {
                if(!!retval?.then) {
                    // if returns a promise
                        retval.then(()=>{then(prevTarget,vm.editingTarget)})
                    } else {
                    // if is normal resolved function
                        then(prevTarget,vm.editingTarget)
                    }
            }
            return retval
        } else {
            console.log('intrecepted:')
            if(name=='blocks') {console.log('spritename: ' + vm.editingTarget.sprite.name)}
            console.log(...args)
            if(name=='blocks'){lastEvent = args[0]}
            let extrargsObj = null;
            if(!!extrargs) {extrargsObj=extrargs(args)}
            if(__SENDBLOCKS && !dontSend?.(...args)) { liveMessage({meta:"sprite.proxy",data:{name,args,extrargs:extrargsObj}}) }

            let retval = action.bind(bindTo)(...args)
            return retval
        }
    }
    proxyActions[name] = proxiedFunction;
    return proxiedFunction;
}
function stProxy(action,name,extrargs,mutator,before,then,dontSend,dontDo) {
    return proxy(action,name,
        (args)=>({__et:vm.editingTarget.sprite.name,...extrargs?.(args)}),
        mutator,
        // before,
        (data)=>{before?.(data);vm.runtime.setEditingTarget(vm.runtime.getSpriteTargetByName(data.extrargs.__et))},
        (a,b)=>{vm.runtime.setEditingTarget(a);then?.(a,b)},
        // then,
        dontSend);
        // (data)=>{before?.(data);vm.runtime.setEditingTarget(vm.runtime.getSpriteTargetByName(data.extrargs.__et))},
        // (a,b)=>{vm.runtime.setEditingTarget(a);then?.(a,b)},quit);
}

// todo catch shadow create
function isBadToSend(event, target) {
    switch(event.type) {
        // filter out shadow events that shouldnt be proxied
        case 'create': if(event.xml.nodeName == "SHADOW") {return true}
        case 'delete': if(event.oldXml?.nodeName == "SHADOW") {return true}
        case 'move' : if(target.blocks.getBlock(event.blockId)?.shadow) {return true}
    }
    return false
}

// Todo catch bad deletes (var, comment)
// get current drag id
// ScratchBlocks.getMainWorkspace().getBlockDragSurface().getCurrentBlock()?.getAttribute('data-id')

function isBadToRun(event, target) {
    switch (event.type) {
        // dont run if block already exists
        case 'create': return !!target.blocks.getBlock(event.blockId);
        case 'delete': return !target.blocks.getBlock(event.blockId);
        // dont run if comment already exists
        case 'comment_create': return event.commentId in target.comments;
        case 'move': {
            // dont run if block doesnt exist
            if(!target.blocks.getBlock(event.blockId)) return true;
            // dont run if block is already close enough to position (rounded to 1's place)
            // ...and make sure that the event specifies x and y before checking!
            if(!!event.newCoordinate?.x && !!event.newCoordinate?.y) {
                let localBlock = target.blocks.getBlock(event.blockId)
                if(Math.round(localBlock.x)== Math.round(event.newCoordinate.x) &&
                Math.round(localBlock.y) == Math.round(event.newCoordinate.y))
                { return true; }
            }
            // dont run if newParentId is the same (assuming exists)
            if(!!event.newParentId) {
                let localBlock = target.blocks.getBlock(event.blockId)
                if(localBlock.parent == event.newParentId){return true;}
            }
        }
    }
    return false;
}
// Interface with ScratchBlocks object
function isBadToRunBlockly(event,workspace) {
    switch (event.type) {
        // dont run if block already exists
        case 'create': return !!workspace.getBlockById(event.blockId)
    }
    
}

function getStringEventRep(e) {
    let rep = e.type + e.blockId + e.commentId + e.varId
    switch(e.type) {
        case 'move':
            rep += Math.round(e.newCoordinate?.x)
            + Math.round(e.newCoordinate?.y)
            + e.newParentId
            break;
        case 'change':
            rep += e.name + e.newValue + e.element
            break;
        case 'var_create':
            rep += e.varName + e.isCloud + e.isLocal
            break;
        case 'var_rename':
            rep += e.newName
            break;
        case 'comment_change':
            rep += JSON.stringify(e.newContents_,(k,v)=>(v?.toFixed ? Number(v.toFixed(0)) : v))
            break;
        case 'comment_move':
            rep += Math.round(e.newCoordinate_?.x)
            + Math.round(e.newCoordinate_?.y)
            break;
    }
    return rep.replaceAll("undefined","null")
}

oldBlockListener = vm.blockListener
blockliveEvents = {}
createEventMap = {}
toBeMoved = {}
function blockListener(e) {
    console.log('just intrecepted',e)
    if(e.type == 'create'){createe = e}
    if(e.type == 'move'){movee = e}
    if(e.type == 'comment_change'){comee = e}
    // filter ui events and blocklive
    let stringRep = getStringEventRep(e)
    if(stringRep in blockliveEvents) {delete blockliveEvents[stringRep]}
    else if(
        !e.isBlocklive && 
        ["endDrag",'ui','dragOutside'].indexOf(e.type) == -1 &&
        !isBadToSend(e,vm.editingTarget) &&
        e.element != 'stackclick'
    ) {
        let extrargs = {}
        
        // send field locator info
        if(e.element == 'field') {
            if(vm.editingTarget.blocks.getBlock(e.blockId).shadow) {
            let fieldInputId = e.blockId
            let fieldInput = vm.editingTarget.blocks.getBlock(fieldInputId)
            let parentId = fieldInput.parent
            if(!!parentId) {
                let parentBlock = vm.editingTarget.blocks.getBlock(parentId)
                let inputTag = Object.values(parentBlock.inputs).find(input=>input.block==fieldInputId).name

                extrargs.parentId = parentId
                extrargs.fieldTag = inputTag
            }
            }
        }

        // send block create xml
        if(!!e.xml) {
            extrargs.xml = {outerHTML:e.xml.outerHTML}
        }

        console.log("sending",e,extrargs)

        let message = {meta:"vm.blockListen",type:e.type,extrargs,event:e,json:e.toJson(),target:vm.editingTarget.sprite.name,}
        
        // intercept and save create events to send later
        if(e.type == "create") {
            createEventMap[e.blockId] = message
        // } else if (e.type == 'comment_create') { //TODO: maybe add back
        //     createEventMap[e.commentId] = message
        // intercept auto generated move event
        } else if ((e.type == 'move') && e.blockId in toBeMoved){
            let moveEvents = toBeMoved[e.blockId]
            console.log("move events",moveEvents)
            delete toBeMoved[e.blockId]
            moveEvents.forEach(moveMessage=>onBlockRecieve(moveMessage))
        }
        else {
            // send held off create events
            if(e.blockId in createEventMap) {
                // erase from face of existance
                if(e.type == 'delete') {
                    message = null
                } else { 
                    liveMessage(createEventMap[e.blockId]) 
                }
                delete createEventMap[e.blockId]
            }
            if(e.commentId in createEventMap) {
                if(e.type == 'comment_delete') {
                    message = null
                } else { 
                    liveMessage(createEventMap[e.commentId]) 
                }
                delete createEventMap[e.commentId]
            }
            if(!!message){liveMessage(message)}
        }
    }
    // Forward (do) event
    oldBlockListener(e)
}
vm.blockListener = blockListener

/// Todo: testing on whether or not to actually execute actions
// Todo: catch stage not being sprite
// Remove thing from undo list

function onBlockRecieve(d) {
    console.log("recieved", d)

    // for comment parsing cause they did the toJson wrong apparently
    if(d.type == 'comment_change') {
        d.json.newValue = d.json.newContents
    }

    let oldEditingTarget = vm.editingTarget
    // set editing target
    vm.editingTarget = vm.runtime.getSpriteTargetByName(d.target)
    vm.runtime._editingTarget = vm.editingTarget
    let vEvent = d.event
    let bEvent = ScratchBlocks.Events.fromJson(d.json,ScratchBlocks.getMainWorkspace())
    //set blockly event tag
    bEvent.isBlocklive = true

    //........... Modify event ...........//
// TODO: add comment create xy


    // set vm type
    vEvent.type = d.type

    //find true field
    if(!!d.extrargs.fieldTag) {
        let realId = vm.editingTarget.blocks.getBlock(d.extrargs.parentId).inputs[d.extrargs.fieldTag].block
        vEvent.blockId = realId;
        bEvent.blockId = realId;
    }
    //xml
    if(!!d.extrargs.xml) {
        vEvent.xml = d.extrargs.xml
    }


    if(oldEditingTarget.sprite.name == d.target) {
        // save speedy move and delete events for later
        if((bEvent.type == 'move' || bEvent.type == 'delete') && bEvent.blockId in toBeMoved) {toBeMoved[bEvent.blockId].push(d)}
        else{
        //inject directly into blockly
        if(!isBadToRunBlockly(bEvent,ScratchBlocks.getMainWorkspace()) && !isBadToRun(bEvent,vm.editingTarget)) {
            // record newly made block so that we can intercept it's blockly auto-generated move event later
            if(bEvent.type == 'create'){toBeMoved[bEvent.blockId] = []} 
            // record played blocklive event
            blockliveEvents[getStringEventRep(bEvent)] = true
            // run event
            bEvent.run(true)
        }
    }
    } else {
        if(!isBadToRun(vEvent,vm.editingTarget)) {
            vm.editingTarget.blocks.blocklyListen(vEvent)
        }
    }

    //reset editing target
    vm.editingTarget = oldEditingTarget
    vm.runtime._editingTarget = oldEditingTarget
}

let oldEWU = (vm.emitWorkspaceUpdate).bind(vm)
vm.emitWorkspaceUpdate = function() {
    console.log("WORKSPACE UPDATING")
    // add deletes for comments
    ScratchBlocks.getMainWorkspace().getTopComments().forEach(comment=>{
        blockliveEvents[getStringEventRep({type:'comment_delete',commentId:comment.id})] = true
    })
    // add creates for comments in new workspace
    Object.keys(vm.editingTarget.comments).forEach(commentId=>{
        blockliveEvents[getStringEventRep({type:'comment_create',commentId})] = true
    })
    // add deletes for top blocks in current workspace
    ScratchBlocks.getMainWorkspace().topBlocks_.forEach(block=>{
        blockliveEvents[getStringEventRep({type:'delete',blockId:block.id})] = true
    })
    // add creates for all blocks in new workspace
    Object.keys(vm.editingTarget.blocks._blocks).forEach(blockId=>{
        blockliveEvents[getStringEventRep({type:'create',blockId})] = true
    })
    // add var creates and deletes
    Object.entries(vm.editingTarget.variables).forEach(varr=>{
        blockliveEvents[getStringEventRep({type:'var_delete',varId:varr[0],isCloud:varr[1].isCloud,varName:varr[1].name,isLocal:false})] = true
        blockliveEvents[getStringEventRep({type:'var_create',varId:varr[0],isCloud:varr[1].isCloud,varName:varr[1].name,isLocal:true})] = true
    })
    // add global (local:false) var creates
    Object.entries(vm.runtime.getTargetForStage().variables).forEach(varr=>{
        // blockliveEvents[getStringEventRep({type:'var_delete',varId:varr[0],isCloud:varr[1].isCloud,varName:varr[1].name,isLocal:false})] = true
        blockliveEvents[getStringEventRep({type:'var_create',varId:varr[0],isCloud:varr[1].isCloud,varName:varr[1].name,isLocal:false})] = true
    })
    oldEWU()
}

// vm.editingTarget = a;
// vm.emitTargetsUpdate(false /* Don't emit project change */);
// vm.emitWorkspaceUpdate();
// vm.blockListener = proxy(vm.blockListener,"blocks",
//     (args)=>({type:args[0].type}),
//     (data)=>[{...data.args[0],type:data.extrargs.type}]
// )
// vm.blockListener = stProxy(vm.blockListener,"blocklist",null,null,null,()=>{vm.emitWorkspaceUpdate()})

vm.runtime.requestShowMonitor = anyproxy(vm.runtime,vm.runtime.requestShowMonitor,"showmonitor")
vm.runtime.requestHideMonitor = anyproxy(vm.runtime,vm.runtime.requestHideMonitor,"showmonitor")

vm.addCostume = proxy(vm.addCostume,"addcostume")
// vm.updateBitmap = proxy(vm.updateBitmap,"updatebit",null,null,null,()=>{vm.emitTargetsUpdate();vm.emitWorkspaceUpdate()})
// vm.updateSvg = proxy(vm.updateSvg,"updatesvg",null,null,null,()=>{vm.emitTargetsUpdate();vm.emitWorkspaceUpdate()})
vm.addSprite = proxy(vm.addSprite,"addsprite",null,null,null,((a,b)=>{vm.setEditingTarget(a.id)}))
vm.deleteSprite = proxy(vm.deleteSprite,"deletesprite",
    (args)=>({name:vm.runtime.getTargetById(args[0]).sprite.name}),
    (data)=>[vm.runtime.getSpriteTargetByName(data.extrargs.name).id])
vm.renameSprite = proxy(vm.renameSprite,"renamesprite",
    (args)=>({oldName:vm.runtime.getTargetById(args[0]).sprite.name}),
    (data)=>[vm.runtime.getSpriteTargetByName(data.extrargs.oldName).id,data.args[1]])
vm.reorderTarget = proxy(vm.reorderTarget,"reordertarget")
vm.shareBlocksToTarget = proxy(vm.shareBlocksToTarget,"shareblocks",
(args)=>({toName:vm.runtime.getTargetById(args[1]).sprite.name}),
(data)=>[data.args[0],vm.runtime.getSpriteTargetByName(data.extrargs.toName).id],null,()=>{vm.emitWorkspaceUpdate()})

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

function registerChromePortListeners() {
    port.onMessage.addListener(function(msg) {
        if(msg.meta=="blockly.event") {
            runEventFromMessageData(msg.data)
        } else if (msg.meta=="sprite.proxy") {
            proxyActions[msg.data.name](...(['linguini'].concat(msg.data).concat(msg.data.args)))
        } else if (msg.meta =="vm.blockListen") {
            onBlockRecieve(msg)
        }
    });
    port.onDisconnect.addListener(()=>{
        isConnected = false;
    })
}
registerChromePortListeners()

function recconectIfNeeded() {
    if(!isConnected) {
        port = chrome.runtime.connect(exId); 
        isConnected = (!!port); 
        registerChromePortListeners()
    }

}
function liveMessage(...args) {
    recconectIfNeeded()
    port.postMessage(...args)
}





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





