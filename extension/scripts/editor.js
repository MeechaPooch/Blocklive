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
            let retval = action.bind(vm)(...args)
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

            let retval = action.bind(vm)(...args)
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
        case 'var_create':
            rep += e.varName + e.isCloud + e.isLocal
        case 'var_rename':
            rep += e.newName
        case 'comment_change':
            rep += e.newContents_?.text
        case 'comment_move':
            rep += rep += Math.round(e.newCoordinate_?.x)
            + Math.round(e.newCoordinate_?.y)
    }
    return rep
}

oldBlockListener = vm.blockListener
blockliveEvents = {}
createEventMap = {}
toBeMoved = {}
function blockListener(e) {
    if(e.type == 'create'){createe = e}
    if(e.type == 'move'){movee = e}
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
            if(e.shadow) {
            let fieldInputId = e.blockId
            let fieldInput = vm.editingTarget.blocks.getBlock(fieldInputId)
            let parentId = fieldInput.parent
            if(!!parentId) {
                let parentBlock = vm.editingTarget.blocks.getBlock(parentId)
                let inputTag = Object.values(parentBlock.inputs).find(input=>input.block==fieldInputId).name

                extrargs.parentId = parentId
                extrargs.fieldTag = inputTag
            }
        } else {
            // todo-- wait maybe this should be nothing!?
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
        } else if (e.type == 'comment_create') {
            createEventMap[e.commentId] = message
        // intercept auto generated move event
        } else if (e.type == 'move' && e.blockId in toBeMoved){
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
    let oldEditingTarget = vm.editingTarget
    // set editing target
    vm.editingTarget = vm.runtime.getSpriteTargetByName(d.target)
    vm.runtime._editingTarget = vm.editingTarget
    let vEvent = d.event
    let bEvent = ScratchBlocks.Events.fromJson(d.json,ScratchBlocks.getMainWorkspace())
    //set blockly event tag
    bEvent.isBlocklive = true

    //........... Modify event ...........//

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
        // save speedy move events for later
        if(bEvent.type == 'move' && bEvent.blockId in toBeMoved) {toBeMoved[bEvent.blockId].push(d)}
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
            // record played blocklive event
            blockliveEvents[getStringEventRep(vEvent)] = true
            vm.editingTarget.blocks.blocklyListen(vEvent)
        }
    }

    //reset editing target
    vm.editingTarget = oldEditingTarget
    vm.runtime._editingTarget = oldEditingTarget
}

let oldEWU = (vm.emitWorkspaceUpdate).bind(vm)
vm.emitWorkspaceUpdate = function() {
    // add creates and deletes for comments
    Object.keys(vm.editingTarget.comments).forEach(commentId=>{
        blockliveEvents[getStringEventRep({type:'comment_create',commentId})] = true
        blockliveEvents[getStringEventRep({type:'comment_delete',commentId})] = true
    })
    // add deletes for top blocks
    ScratchBlocks.getMainWorkspace().topBlocks_.forEach(block=>{
        blockliveEvents[getStringEventRep({type:'delete',blockId:block.id})] = true
    })
    // add creates for all blocks
    Object.keys(vm.editingTarget.blocks._blocks).forEach(blockId=>{
        blockliveEvents[getStringEventRep({type:'create',blockId})] = true
    })
    // add var creates and deletes
    Object.keys(vm.editingTarget.variables).forEach(varId=>{
        blockliveEvents[getStringEventRep({type:'var_delete',varId})] = true
        blockliveEvents[getStringEventRep({type:'var_create',varId})] = true
    })
    oldEWU()
}

// vm.editingTarget = a;
// vm.emitTargetsUpdate(false /* Don't emit project change */);
// vm.emitWorkspaceUpdate();
// vm.blockListener = 
stProxy(vm.blockListener,"blocks",
    (args)=>{
        let retVal = {}
        if(args[0].xml) {
            let xml = args[0].xml
            console.log(xml.outerHTML)
            retVal = ({type:args[0].type,xml:{outerHTML:args[0].xml?.outerHTML}})
        } else {
            retVal = ({type:args[0].type})
        }
        if(args[0].element == 'field') {
            let fieldInputId = args[0].blockId
            let fieldInput = vm.editingTarget.blocks.getBlock(fieldInputId)
            let parentId = fieldInput.parent
            if(!!parentId) {
                let parentBlock = vm.editingTarget.blocks.getBlock(parentId)
                let inputTag = Object.values(parentBlock.inputs).find(input=>input.block==fieldInputId).name

                retVal.parentId = parentId
                retVal.fieldTag = inputTag
            }
        }
        return retVal
    },
    (data)=>{
        let retVal = []
        /*tag*/if(data.extrargs.xml){retVal = [{...data.args[0],type:data.extrargs.type,xml:data.extrargs.xml}]}
        else {retVal = [{...data.args[0],type:data.extrargs.type}]}
        /*it*/if(data.extrargs.fieldTag) {retVal[0].blockId = vm.editingTarget.blocks.getBlock(data.extrargs.parentId).inputs[data.extrargs.fieldTag].block}
        return retVal;
    },
    null,
()=>{/*vm.refreshWorkspace()*/},

    (e)=>(
        // Dont send these events
        ["endDrag",'ui','dragOutside'].indexOf(e.type) !== -1||
        
        // Test for dont send cases
        (e.type=='create' && (
            !!vm.runtime._editingTarget.blocks.getBlock(e.blockId)
        )) ||
        ((e.type=='change' || e.type=='move' || e.type=='delete') && (
            // Dont send if block doesnt exist
            !vm.runtime._editingTarget.blocks.getBlock(e.blockId)
        )) ||
        // TODO
        (e.type=='var_create' && (
            !!vm.runtime._editingTarget.lookupVariableById(e.varId)
        )) ||
        
        // (!e.recordUndo) && (
        // e.type == 'create'||
        // e.type == 'change'||
        // e.type == 'move'||
        // e.type == 'delete'||
        // e.type == 'var_create' ||
        // e.type == 'var_delete')
        false
        )
    // ()=>{vm.refreshWorkspace()}
)
// vm.blockListener = proxy(vm.blockListener,"blocks",
//     (args)=>({type:args[0].type}),
//     (data)=>[{...data.args[0],type:data.extrargs.type}]
// )
// vm.blockListener = stProxy(vm.blockListener,"blocklist",null,null,null,()=>{vm.emitWorkspaceUpdate()})

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

function portListeners() {
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
portListeners()
function liveMessage(...args) {
    if(!isConnected) {port = chrome.runtime.connect(exId); isConnected = (!!port); portListeners()}
    port.postMessage(...args)
}



function onChange(e) {
    return;
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
        vm.editingTarget
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

// Register Workspace Change Listerner
ScratchBlocks.getMainWorkspace().addChangeListener(onChange)
console.log("change listener registered")

// Send Trapped Message
liveMessage({meta:"sb.trapped"}, function (response) {
    console.log("response: " + response)
});
})()





