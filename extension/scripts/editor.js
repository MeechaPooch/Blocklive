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


function blockListener(e) {
    liveMessage({meta:"blockListen",event:e,json:e.toJson,target:vm.editingTarget.sprite.name,})
}

/// Todo: testing on whether or not to actually execute actions
// Todo: catch stage not being sprite
// Remove thing from undo list
function onBlockRecieve(d) {
    let oldEditingTarget = vm.editingTarget
    vm.editingTarget = vm.runtime.getSpriteTargetByName(d.target)
    vm.runtime._editingTarget = vm.editingTarget

    if(oldEditingTarget.sprite.name == d.target) {
        //inject directly into blockly
        let event = ScratchBlocks.Events.fromJson(d.json,d.json.type)
        event.workspaceId = ScratchBlocks.getMainWorkspace().id

        event.run(true)
    } else {
        vm.editingTarget.blocks.blocklyListen(d.event)
    }

    vm.editingTarget = oldEditingTarget
    vm.runtime._editingTarget = oldEditingTarget
}

// vm.editingTarget = a;
// vm.emitTargetsUpdate(false /* Don't emit project change */);
// vm.emitWorkspaceUpdate();
vm.blockListener = stProxy(vm.blockListener,"blocks",
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
        if(data.extrargs.xml){retVal = [{...data.args[0],type:data.extrargs.type,xml:data.extrargs.xml}]}
        else {retVal = [{...data.args[0],type:data.extrargs.type}]}
        if(data.extrargs.fieldTag) {retVal[0].blockId = vm.editingTarget.blocks.getBlock(data.extrargs.parentId).inputs[data.extrargs.fieldTag].block}
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





