console.log('CollabLive Editor Inject Running...')
var exId = 'ecpnaepgmcofbfjhpbcmjgijkekmkbdm'

//////////// TRAP UTILS ///////////

function sleep(millis) {
    return new Promise(res=>setTimeout(res,millis));
}
let queryList = []
function mutationCallback() {
    let toDelete = []
    queryList.forEach(query=>{
        let elem = document.querySelector(query.query)
        if(elem && !elem.blSeen) {
            if(query.once){toDelete.push(query)}
            else {elem.blSeen = true}
            query.callback(elem)
        }
    })
    toDelete.forEach(query=>{queryList.splice(queryList.indexOf(query),1)})
}
let observer = new MutationObserver(mutationCallback)
observer.observe(document.documentElement,{ subtree: true, childList: true })
function getObj(query) {
    let obj = document.querySelector(query)
    if(obj) {return new Promise(res=>{res(obj)})}
    return new Promise(res=>{
        queryList.push({query,callback:res,once:true})
    })
}
function listenForObj(query,callback) {
    let obj = document.querySelector(query)
    if(obj) {obj.blSeen = true; callback(obj)}
    queryList.push({query,callback,once:false})
}

function waitFor(lambda) {
    return new Promise(async res=>{
        let output;
        while(!(output = lambda())) {
            console.log('waiting for lambda resolve: ' + lambda)
            await sleep(100)
        }
        res(output);
    })
}



///.......... BG SCRIPT CONNECTION SETUP ..........//

// Connect To Background Script
// var port = chrome.runtime.connect(exId);
var port
var isConnected = false;

function liveMessage(message,res) {
    reconnectIfNeeded()
    let msg = message
    if(msg.meta=="blockly.event" || msg.meta=="sprite.proxy"||msg.meta=="vm.blockListen"||msg.meta=="vm.shareBlocks" ||msg.meta=="vm.replaceBlocks") {blVersion++}
    port.postMessage(message,res)
}

let blockliveListener

let registerChromePortListeners = ()=> {
    port.onMessage.addListener((...args)=>{blockliveListener(...args)});
    port.onDisconnect.addListener(()=>{
        isConnected = false;
    })
}
// registerChromePortListeners()

function reconnectIfNeeded() {
    if(!isConnected) {
        port = chrome.runtime.connect(exId); 
        isConnected = (!!port); 
        if(isConnected){
            registerChromePortListeners();
            liveMessage({meta:"myId",id:blId})
            liveMessage({meta:"joinSession"})
            if(readyToRecieveChanges){getAndPlayNewChanges()}
        }
    }
}

///.......... BLOCKLIVE CHECKING ........... //

var blockliveServer


let blId = ''
blVersion = 0
scratchId = location.pathname.split('/')[2] //TODO: use better method?
// scratchId = '644532638'
let pauseEventHandling = false
let projectReplaceInitiated = false
let onceProjectLoaded = []
let vm
let readyToRecieveChanges = false

async function startBlocklive() {
    pauseEventHandling = true
    liveMessage({meta:"myId",id:blId})
    activateBlocklive()
    if(store.getState().scratchGui.projectState.loadingState.startsWith('SHOWING')) {
        console.log('project already loaded!')
        if(projectReplaceInitiated) { return }
        await joinExistingBlocklive(blId)
        pauseEventHandling = false
    } else {
        vm.runtime.on("PROJECT_LOADED", async () => { // todo catch this running after project loads
            if(projectReplaceInitiated) { return }
            await joinExistingBlocklive(blId)
            pauseEventHandling = false
        })
    }
}

async function onTabLoad() {
    // trap vm and store
    let reactInst = Object.values(await getObj('div[class^="stage-wrapper_stage-wrapper_"]')).find((x) => x.child)
    vm = reactInst.child.child.child.stateNode.props.vm;
    store = reactInst.child.child.child.stateNode.context.store
    blId = await getBlocklyId(scratchId);
    if(!blId) {
        chrome.runtime.sendMessage(exId,{meta:'callback'},(request) => { if(request.meta == 'initBlocklive') { 
            blId = request.blId; 
            startBlocklive();}});
    }
    if(!!blId) {
        startBlocklive()
    } else {
    }

}
onTabLoad()

async function joinExistingBlocklive(id) {
    projectReplaceInitiated = true
    console.log('joining blocklive id',id,)
    let inpoint = await getInpoint(id)
    if(inpoint.err) {alert('issue joining blocklive id: ' + id + '\n error: ' + inpoint.err);return;}
    pauseEventHandling = true
    try {
        await vm.downloadProjectIdPromise(inpoint.scratchId)
        blVersion = inpoint.scratchVersion
    } catch (e) {
        prompt(`Blocklive cannot load project data! The scratch api might be blocked by your network. Clicking OK or EXIT will attempt to load the project from the changelog, which may take a moment. \n\nHere are your ids if you want to report this to @ilhp10:`,`BLOCKLIVE_ID: ${blId}; SCRATCH_REAL_ID: ${scratchId}; INPOINT_ID: ${inpoint.scratchId}`)
    }
    //yo wussup poochdawg

    console.log('syncing new changes, editingTarget: ',vm.editingTarget)
    await getAndPlayNewChanges() // sync changes since scratch version
    liveMessage({meta:"joinSession"}) // join sessionManager session
    readyToRecieveChanges = true
    pauseEventHandling = false;
}

function getBlocklyId(scratchId) {
    return new Promise((promRes)=>{
    chrome.runtime.sendMessage(exId,{meta:'getBlId',scratchId},promRes)
    })
}
function getInpoint(blockliveId) {
    return new Promise((res)=>{chrome.runtime.sendMessage(exId,{meta:'getInpoint',blId:blockliveId},res)})     
}
function getChanges(blId,version) {
    return new Promise((res)=>{chrome.runtime.sendMessage(exId,{meta:'getChanges',blId,version},res)})
}

let getAndPlayNewChanges

async function activateBlocklive() {

    // set scope exposed functions    
    getAndPlayNewChanges = async ()=>{
        console.log('syncing since version: ' +  blVersion)
        changes = await getChanges(blId,blVersion)
        pauseEventHandling = true
        for (let i = 0; i < changes.length; i++) {
            await blockliveListener(changes[i])
        }
        if(changes.currentVersion){blVersion = changes.currentVersion}
        pauseEventHandling = false
        vm.emitWorkspaceUpdate()
        vm.emitTargetsUpdate()
    }

///.......... CONNECT TO CHROME PORT ..........//

function connectFirstTime() {
    reconnectIfNeeded()
    // request for blockliveId
    // liveMessage({meta:"hiimhungry"})
}
connectFirstTime()

setInterval(reconnectIfNeeded,1000)

/// other things

    blockliveListener = async (msg) => {
        console.log('recieved message',msg)
        if(!!msg.version){blVersion = msg.version-1} // TODO: possibly disable this
        try{
        if (msg.meta=="sprite.proxy") {
            blVersion++
            await proxyActions[msg.data.name](...(['linguini'].concat(msg.data).concat(msg.data.args)))
        } else if (msg.meta =="vm.blockListen") {
            blVersion++
            onBlockRecieve(msg)
        } else if (msg.meta == "messageList") {
            for (let i = 0; i < msg.messages.length; i++) {
                await blockliveListener(msg.messages[i])
            }
        } else if (msg.meta == "vm.shareBlocks") {
            blVersion++
            doShareBlocksMessage(msg)        
        } else if (msg.meta == 'vm.replaceBlocks') {
            if(!nameToTarget(msg.target)?.blocks) {
                console.log('saving for later')
                addNewTargetEvent(msg.target,msg);
            }
            else {
                console.log('doing')
                blVersion++
                replaceBlockly(msg)
            }
        } else if(msg.meta=='yourVersion') {
            console.log('version ponged: ' + msg.version)
            blVersion = msg.version
        }
        } catch (e) {console.error(e)}
    }


///.......... TRAPS ..........//
// Thanks garbomuffin and scratchaddons for guidance

// set helpful function to download projet and return the promise
async function downloadProjectIdPromise (id) {
    const storage = this.runtime.storage;
    if (!storage) {
        log.error('No storage module present; cannot load project: ', id);
        return;
    }
    const vm = this;
    const promise = storage.load(storage.AssetType.Project, id);
    projectAsset = await promise
    return vm.loadProject(projectAsset.data);
}
vm.downloadProjectIdPromise = downloadProjectIdPromise.bind(vm)

// Trap ScratchBlocks -- adapted from https://github.com/ScratchAddons/ScratchAddons/blob/4248dc327a9f3360c77b94a89e396903218a2fc2/addon-api/content-script/Trap.js

// let reactElem = (await getObj(()=>document.querySelector('[class^="gui_blocks-wrapper"]')))

listenForObj('[class^="gui_blocks-wrapper"]',(reactElem)=>{

// let reactElem = (await getObj('[class^="gui_blocks-wrapper"]'))
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
getWorkspace().removeChangeListener(blockListener)
getWorkspace().addChangeListener(blockListener)
})

// Trap Paint
function getPaper() {
    let paperContainer = document.querySelector("[class^='paint-editor_canvas-container']")
    if(!paperContainer) return null;
    let reactInst;
    for(let e of Object.entries(paperContainer)) {
        if(e[0].startsWith('__reactInternalInstance')) {
            reactInst = e[1];
            break;
        }
    }
    return reactInst?.child?.child?.child?.stateNode
}

///.......... ALL THE HACKY THINGS ..........//

function isWorkspaceAccessable() {
    return !!document.querySelector('.blocklyWorkspace')
}

function getWorkspace() {
    let retVal = null
    if(typeof ScratchBlocks == 'undefined') {return retVal}
    Object.entries(ScratchBlocks.Workspace.WorkspaceDB_).forEach(wkv=>{
        if(!wkv[1].isFlyout) {retVal = wkv[1]}
    })
    return retVal;
}
function getWorkspaceId() {
    return getWorkspace()?.id
}

// STAGE IDENTIFIER. DO NOT SET SPRITE NAME TO THIS UNLESS YOU WANT TO PURPOSEFULLY BREAK LINKAGE!!!!
let stageName = 'jHHVSbKjDsRhSWhIlYtd...___+_0)0+-amongus'
function targetToName(target) {
    return target?.isStage ? stageName : target?.sprite.name
}
function nameToTarget(name) {
    return name == stageName ? vm.runtime.getTargetForStage() : vm.runtime.getSpriteTargetByName(name)
}

// Credit to GarboMuffin and apple502j https://github.com/ScratchAddons/ScratchAddons/blob/399e2e51ca43e9299c8d07ff315b91966c7c1a5e/addons/onion-skinning/userscript.js#L428
const getSelectedCostumeIndex = () => {
    const item = document.querySelector("[class*='selector_list-item'][class*='sprite-selector-item_is-selected']");
    if (!item) return -1;
    const numberEl = item.querySelector("[class*='sprite-selector-item_number']");
    if (!numberEl) return -1;
    return +numberEl.textContent - 1;
};

// send to api when project saved
let lastProjectState = store.getState().scratchGui.projectState.loadingState
store.subscribe(function() {
    let state = store.getState().scratchGui.projectState.loadingState
    if(lastProjectState == state) {return; }
    lastProjectState = store.getState().scratchGui.projectState.loadingState

    if(state.endsWith('UPDATING')) {
        console.log('🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢')
        chrome.runtime.sendMessage(exId,{meta:'projectSaved',blId,scratchId,version:blVersion})
    }
})



function replaceBlockly(msg) {
    // replace a target's block data (used for syncing id's on sprite duplicate)
    let target = nameToTarget(msg.target);
    let blocks = target.blocks
    Object.keys(blocks._blocks).forEach(v=>{blocks.deleteBlock(v)})
    console.log(msg.blocks)
    Object.values(msg.blocks).forEach(block=>{blocks.createBlock(block)})
    if(targetToName(vm.editingTarget) == targetToName(target)) {vm.emitWorkspaceUpdate()}
}


proxyActions = {}
//action: vm action function
//name: name to put in recort
//mutator: args generator from recieved data object (has args field)
//then: callback for those replaying action

// mutator takes data object {name, args, extrargs} and returns args list

let prevTarg = null
function editingProxy(action,name,before,after,extrargs,mutator) {
    return proxy(action,name,
        (a)=>({target:targetToName(vm.editingTarget),...(extrargs ? extrargs(a) : null)}),mutator,
        (data)=>{
            if(!!before){before(data)}
            prevTarg = vm.editingTarget
            vm.editingTarget = nameToTarget(data.extrargs.target)
            vm.runtime._editingTarget = vm.editingTarget
        },
        (_a,_b,data)=>{
            if(!prevTarg) {'PREVTARG IS UNDEFINED'}
            if(!!prevTarg && !!vm.runtime.getTargetById(prevTarg.id)) {
            vm.editingTarget = prevTarg;
            vm.runtime._editingTarget = prevTarg
            }
            vm.emitTargetsUpdate()
            if(!!after){after(_a,_b,data)}
        })
}

function proxy(action,name,extrargs,mutator,before,then,dontSend,dontDo,senderThen) {
    return anyproxy(vm,action,name,extrargs,mutator,before,then,dontSend,dontDo,senderThen)
}
function anyproxy(bindTo,action,name,extrargs,mutator,before,then,dontSend,dontDo,senderThen) {
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
            if(dontDo?.(data)) {return}
            proxiedArgs = args
            let retVal
            try{retVal = action.bind(bindTo)(...args)}catch(e){console.error('error on proxy run',e)}
            if(then) {
                if(!!retVal?.then) {
                    // if returns a promise
                        retVal.then((res)=>{then(prevTarget,vm.editingTarget,data,res)})
                    } else {
                    // if is normal resolved function
                        then(prevTarget,vm.editingTarget,data,retVal)
                    }
            }
            return retVal
        } else {
            if(pauseEventHandling) {
                return action.bind(bindTo)(...args)
            } else {
            console.log('intrecepted:')
            console.log(...args)
            let extrargsObj = null;
            if(!!extrargs) {extrargsObj=extrargs(args)}
            proxiedArgs = args

            let retVal = action.bind(bindTo)(...args)
            if(!dontSend?.(...args)) { liveMessage({meta:"sprite.proxy",data:{name,args,extrargs:extrargsObj}}) }
            if(senderThen) {
                if(!!retVal?.then) {
                    // if returns a promise
                        retVal.then(senderThen)
                    } else {
                    // if is normal resolved function
                    senderThen()
                    }
            }
            return retVal
        }
        }
    }
    proxyActions[name] = proxiedFunction;
    return proxiedFunction;
}

function asyncEditingProxy(action,name,before,after,extrargs,mutator) {
    return asyncAnyproxy(vm,action,name,
        (a)=>({target:targetToName(vm.editingTarget),...(extrargs ? extrargs(a) : null)}),mutator,
        (data)=>{
            if(!!before){before(data)}
            prevTarg = vm.editingTarget
            vm.editingTarget = nameToTarget(data.extrargs.target)
            vm.runtime._editingTarget = vm.editingTarget
        },
        (_a,_b,data)=>{
            if(!prevTarg) {'PREVTARG IS UNDEFINED'}
            if(!!prevTarg && !!vm.runtime.getTargetById(prevTarg.id)) {
            vm.editingTarget = prevTarg;
            vm.runtime._editingTarget = prevTarg
            }
            vm.emitTargetsUpdate()
            if(!!after){after(_a,_b,data)}
        })
}

function asyncAnyproxy(bindTo,action,name,extrargs,mutator,before,then,dontSend,dontDo,senderThen) {
    let proxiedFunction =async function(...args) {
        if(args[0]=='linguini') {
// if linguini, ...args are ['linguini', data, data.args]
            args.splice(0,1)
            let data = args.splice(0,1)[0]
            // console.log('data:')
            // console.log(data)
            if(mutator){args = await mutator(data)}
            // else {args = data.args}

            let prevTarget = vm.editingTarget
            if(!!before) {before(data)}
            if(dontDo?.(data)) {return}
            proxiedArgs = args
            let retVal
            try{retVal = action.bind(bindTo)(...args)}catch(e){console.error('error on proxy run',e)}
            if(then) {
                if(!!retVal?.then) {
                    // if returns a promise
                        retVal.then((res)=>{then(prevTarget,vm.editingTarget,data,res)})
                    } else {
                    // if is normal resolved function
                        then(prevTarget,vm.editingTarget,data,retVal)
                    }
            }
            return retVal
        } else {
            if(pauseEventHandling) {
                return action.bind(bindTo)(...args)
            } else {
            console.log('intrecepted:')
            console.log(...args)
            let extrargsObj = null;
            if(!!extrargs) {extrargsObj=extrargs(args)}
            proxiedArgs = args

            let retVal = action.bind(bindTo)(...args)
            if(!dontSend?.(...args)) { liveMessage({meta:"sprite.proxy",data:{name,args,extrargs:extrargsObj}}) }
            if(senderThen) {
                if(!!retVal?.then) {
                    // if returns a promise
                        retVal.then(senderThen)
                    } else {
                    // if is normal resolved function
                    senderThen()
                    }
            }
            return retVal
        }
        }
    }
    proxyActions[name] = proxiedFunction;
    return proxiedFunction;
}


// todo catch shadow create
function isBadToSend(event, target) {
    switch(event.type) {
        // filter out shadow events that shouldnt be proxied
        case 'create': if(event.xml.nodeName == "SHADOW") {return true}
        case 'delete': if(event.oldXml?.nodeName == "SHADOW") {return true}
        case 'move' : {
            let block = target.blocks.getBlock(event.blockId)
            if(block?.shadow) {return true}

            // edge case: c1 move unlinked var block into parent block. c2 blocklive mistakenly moves a linked block into that place. c2 moves linked block out of the parent block and does not move out of c1
            // dont send if moves a varible to same position
            // if(!!block && (block.fields.VARIABLE || block.fields.LIST)) {
            //     if(!!event.oldCoordinate && !!event.newCoordinate && (
            //         Math.round(event.oldCoordinate.x) == Math.round(event.newCoordinate.x) &&
            //         Math.round(event.oldCoordinate.y) == Math.round(event.newCoordinate.y)
            //     )) {return true}
            // }
        }
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
    console.log('is event handling & workspace updating paused?: ' + pauseEventHandling)
    if(pauseEventHandling) {return}
    console.log('just intrecepted',e)
    if(e.type == 'ui'){uiii = e}
    if(e.type == 'create'){createe = e}
    if(e.type == 'delete'){deletee = e}
    if(e.type == 'change'){changee = e}
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
        
        // send variable locator info
        if(e.type == 'move') {
            let block = vm.editingTarget.blocks.getBlock(e.blockId)
            if(!!block && (block.fields.VARIABLE || block.fields.LIST)) {
                extrargs.blockVarId = block.fields.VARIABLE ? block.fields.VARIABLE.id : block.fields.LIST.id
            }
        } else if(e.type == 'change' && (e.name == "VARIABLE" || e.name == "LIST")){
            let block = vm.editingTarget.blocks.getBlock(e.blockId)
            if(!!block) {
                extrargs.blockVarId = e.oldValue
                extrargs.blockVarParent = block.parent
                extrargs.blockVarPos = {x:block.x,y:block.y}
                extrargs.blockVarInput = vm.editingTarget.blocks.getBlock(block.parent)?.inputs.find(input=>(input.block==e.blockId))?.name
            }
        } else if(e.type == 'delete' && (
            e.oldXml?.firstElementChild?.getAttribute('name') == 'VARIABLE' ||
            e.oldXml?.firstElementChild?.getAttribute('name') == 'LIST'
        )) {
            let block = !!vm.editingTarget.blocks._blocks[e.blockId] ? vm.editingTarget.blocks._blocks[e.blockId] : lastDeletedBlock
            extrargs.blockVarId = block.fields.VARIABLE ? block.fields.VARIABLE.id : block.fields.LIST.id
            extrargs.blockVarParent = block.parent
            extrargs.blockVarPos = {x:block.x,y:block.y}
            extrargs.blockVarInput = vm.editingTarget.blocks.getBlock(block.parent)?.inputs.find(input=>(input.block==e.blockId))?.name
        }

        // send field locator info
        if(e.element == 'field') {
            if(vm.editingTarget.blocks.getBlock(e.blockId).shadow) {
            let fieldInputId = e.blockId
            let fieldInput = vm.editingTarget.blocks.getBlock(fieldInputId)
            let parentId = fieldInput.parent
            if(!!parentId) {
                let parentBlock = vm.editingTarget.blocks.getBlock(parentId)
                let inputTag = Object.values(parentBlock.inputs).find(input=>input.shadow==fieldInputId).name

                extrargs.parentId = parentId
                extrargs.fieldTag = inputTag
            }
            }
        }

        // send block xml-related things
        if(!!e.xml) {
            extrargs.xml = {outerHTML:e.xml.outerHTML}
            extrargs.isCBCreateOrDelete = e.xml?.getAttribute('type') == 'procedures_definition'
        }
        if(!!e.oldXml) {
            extrargs.isCBCreateOrDelete = extrargs.isCBCreateOrDelete || e.oldXml?.getAttribute('type') == 'procedures_definition'
        }

        console.log("sending",e,extrargs,'target',targetToName(vm.editingTarget))

        let message = {meta:"vm.blockListen",type:e.type,extrargs,event:e,json:e.toJson(),target:targetToName(vm.editingTarget),}
        
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
    // ___DONT___ Forward (do) event
    // oldBlockListener(e)
}

/// Todo: testing on whether or not to actually execute actions
// Todo: catch stage not being sprite
// Remove thing from undo list

function getDistance(p1,p2) {
    return Math.sqrt(Math.pow(p2.x-p1.x,2) + Math.pow(p2.y-p1.y,2))
}

function onBlockRecieve(d) {

    // for comment parsing cause they did the toJson wrong apparently
    if(d.type == 'comment_change') {
        d.json.newValue = d.json.newContents
    }

    let oldEditingTarget = vm.editingTarget
    // set editing target
    vm.editingTarget = nameToTarget(d.target)
    vm.runtime._editingTarget = vm.editingTarget

    try{
    let vEvent = d.event
    let bEvent = {}
    if(isWorkspaceAccessable()) {
        bEvent = ScratchBlocks.Events.fromJson(d.json,getWorkspace())
    }
    //set blockly event tag
    bEvent.isBlocklive = true

    //........... Modify event ...........//

    // set vm type
    vEvent.type = d.type

    // find true variable block if needed
    if(d.extrargs.blockVarId && !(d.event.blockId in toBeMoved) && !vm.editingTarget.blocks.getBlock(d.event.blockId)) {
        if(d.event.oldParentId || d.extrargs.blockVarParent) {
            let oldParentId = d.extrargs.blockVarParent ? d.extrargs.blockVarParent : d.event.oldParentId
            let realId = vm.editingTarget.blocks.getBlock(oldParentId).inputs[d.extrargs.blockVarInput ? d.extrargs.blockVarInput : d.event.oldInputName].block
            vEvent.blockId = realId;
            bEvent.blockId = realId;
            if(d.type == 'delete') {
                bEvent.ids = [realId];
                vEvent.ids = [realId];
            }
        } else if(d.event.oldCoordinate || d.extrargs.blockVarPos) {
            let oldCoordinate = d.extrargs.blockVarPos ? d.extrargs.blockVarPos : d.event.oldCoordinate
            let varBlocks = vm.editingTarget.blocks._scripts.filter((blockId)=>{
                let block = vm.editingTarget.blocks.getBlock(blockId)
                return (
                    block?.fields?.VARIABLE?.id == d.extrargs.blockVarId ||
                    block?.fields?.LIST?.id == d.extrargs.blockVarId
                )
            })
            let closestBlock
            let closestDistance = -1
            varBlocks.forEach(blockId=>{
                let block = vm.editingTarget.blocks.getBlock(blockId)
                if(!block.parent) {
                    let distance = getDistance({x:block.x,y:block.y},oldCoordinate)
                    if(!closestBlock || distance < closestDistance) {
                        closestBlock = block
                        closestDistance = distance
                    }
                }
            })
            if(!closestBlock) {console.log('bruh')}
            else {
                vEvent.blockId = closestBlock.id;
                bEvent.blockId = closestBlock.id;
                if(d.type == 'delete') {
                    bEvent.ids = [closestBlock.id];
                    vEvent.ids = [closestBlock.id];
                }
            }
        }
    }

    //find true field
    if(!!d.extrargs.fieldTag) {
        let realId = vm.editingTarget.blocks.getBlock(d.extrargs.parentId).inputs[d.extrargs.fieldTag].shadow
        vEvent.blockId = realId;
        bEvent.blockId = realId;
    }
    //xml
    if(!!d.extrargs.xml) {
        vEvent.xml = d.extrargs.xml
    }

    // add comment create xy
    if(d.type == "comment_create") {
        bEvent.xy = d.event.xy
    }

    if(targetToName(oldEditingTarget) == d.target && !pauseEventHandling && isWorkspaceAccessable()) {
        // save speedy move and delete events for later
        if((bEvent.type == 'move' || bEvent.type == 'delete') && bEvent.blockId in toBeMoved) {toBeMoved[bEvent.blockId].push(d)}
        else{
        //inject directly into blockly
        if(!isBadToRunBlockly(bEvent,getWorkspace()) && !isBadToRun(bEvent,vm.editingTarget)) {
            // record newly made block so that we can intercept it's blockly auto-generated move event later
            // ...dont record it for newly created custom block definitions
            if(bEvent.type == 'create' && !d.extrargs.isCBCreateOrDelete){toBeMoved[bEvent.blockId] = []} 
            // record played blocklive event
            blockliveEvents[getStringEventRep(bEvent)] = true
            // run event
            bEvent.run(true)
            lastEventRun = bEvent 

            // for custom blocks, update toolbox
            if(bEvent.element == "mutation" || d.extrargs.isCBCreateOrDelete) {
                getWorkspace().getToolbox().refreshSelection()
            }
        }
    }
    } else {
        if(!isBadToRun(vEvent,vm.editingTarget)) {
            vm.editingTarget.blocks.blocklyListen(vEvent)
        }
    }
    }catch(e) {console.error('error on block event execution',e)}
    //reset editing target
    if(!oldEditingTarget) {console.log('old editing target is undefined!')}
    if(!!oldEditingTarget && !!vm.runtime.getTargetById(oldEditingTarget.id)) {
    vm.editingTarget = oldEditingTarget
    vm.runtime._editingTarget = oldEditingTarget
    }
}

let oldTargUp = vm.emitTargetsUpdate.bind(vm)
vm.emitTargetsUpdate = function(...args) {
    if(pauseEventHandling) {return}
    else {oldTargUp(...args)}
}

let oldEWU = (vm.emitWorkspaceUpdate).bind(vm)
vm.emitWorkspaceUpdate = function() {
    if(pauseEventHandling) {console.log('workspace update voided'); return;}
    if(!isWorkspaceAccessable()) {return;}

    console.log("WORKSPACE UPDATING")
    // add deletes for comments
    getWorkspace()?.getTopComments().forEach(comment=>{
        blockliveEvents[getStringEventRep({type:'comment_delete',commentId:comment.id})] = true
    })
    // add creates for comments in new workspace
    Object.keys(vm.editingTarget.comments).forEach(commentId=>{
        blockliveEvents[getStringEventRep({type:'comment_create',commentId})] = true
    })
    // add deletes for top blocks in current workspace
    getWorkspace()?.topBlocks_.forEach(block=>{
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


// TODO: eventually maybe sync this
// vm.runtime.requestShowMonitor = anyproxy(vm.runtime,vm.runtime.requestShowMonitor,"showmonitor")
// vm.runtime.requestHideMonitor = anyproxy(vm.runtime,vm.runtime.requestHideMonitor,"showmonitor")


//sounds


vm.updateSoundBuffer = asyncEditingProxy(vm.updateSoundBuffer,'updatesound',null,null,(args)=>{
    let extrargs = {}
    return extrargs
},async (data)=>{
    let retArgs = data.args
    retArgs[2] = Uint8Array.from(Object.values(retArgs[2]))
    // WOW im proud of this one! Create an AudioBuffer from Uint8Array
    retArgs[1] = await (new AudioContext({sampleRate:retArgs[1].sampleRate})).decodeAudioData(retArgs[2].buffer.slice(0))
    // Wait no that requires async programming which i dont have here ugggggg
    // LOL JK GET DESTROYED NERRRDDDDDDDD i have the power of anime and copying code on mY SIDE!    
    return retArgs
})


vm.addSound = proxy(vm.addSound,"addsound",
    (args)=>{
        let targetName
        if(!!args[1]){targetName = targetToName(vm.runtime.getTargetById(args[2]))} else {targetName = targetToName(vm.editingTarget)}
        return {target:targetName}
    },
    (data)=>{
        let ret = [data.args[0],nameToTarget(data.extrargs.target).id]
        if(ret[0]?.asset?.data) {
            // adapted from scratch source 'file-uploader'
            ret[0].asset = vm.runtime.storage.createAsset(
                ret[0].asset.assetType, 
                ret[0].asset.dataFormat,
                Uint8Array.from(Object.values(ret[0].asset.data)),null,true);
            ret[0] = {
                name: ret[0].name,
                dataFormat: ret[0].asset.dataFormat,
                asset: ret[0].asset,
                md5: `${ret[0].asset.assetId}.${ret[0].asset.dataFormat}`,
                assetId: ret[0].asset.assetId
            };
        }
        return ret
    }
)





vm.duplicateSound = editingProxy(vm.duplicateSound,"duplicatesound")
vm.deleteSound = editingProxy(vm.deleteSound,"deletesound")
vm.renameSound = editingProxy(vm.renameSound,"renamesound")
vm.shareSoundToTarget = editingProxy(vm.shareSoundToTarget,"sharesound")
vm.reorderSound = proxy(vm.reorderSound,"reordersound",
    (args)=>({target:targetToName(vm.runtime.getTargetById(args[0]))}),
    (data)=>[nameToTarget(data.extrargs.target).id,data.args[1],data.args[2]],null)

// costumes    
vm.renameCostume = editingProxy(vm.renameCostume,"renamecostume")
vm.duplicateCostume = editingProxy(vm.duplicateCostume,"dupecostume")
vm.deleteCostume = editingProxy(vm.deleteCostume,"deletecostume")
vm.reorderCostume = proxy(vm.reorderCostume,"reordercostume",
    (args)=>({target:targetToName(vm.runtime.getTargetById(args[0]))}),
    (data)=>[nameToTarget(data.extrargs.target).id,data.args[1],data.args[2]],null,
    ()=>{vm.emitTargetsUpdate()})
vm.addCostume = proxy(vm.addCostume,"addcostume",
    (args)=>{
        let targetName
        if(!!args[2]){targetName = targetToName(vm.runtime.getTargetById(args[2]))} else {targetName = targetToName(vm.editingTarget)}
        return {target:targetName}
    },
    (data)=>{
        let ret = [data.args[0],data.args[1],nameToTarget(data.extrargs.target)?.id,data.args[3]]
        if(ret[1]?.asset?.data) {
            // adapted from scratch source 'file-uploader'
            ret[1].asset = vm.runtime.storage.createAsset(
                ret[1].asset.assetType, 
                ret[1].asset.dataFormat,
                Uint8Array.from(Object.values(ret[1].asset.data)),null,true);
            ret[1] = {
                name: null,
                dataFormat: ret[1].asset.dataFormat,
                asset: ret[1].asset,
                md5: `${ret[1].asset.assetId}.${ret[1].asset.dataFormat}`,
                assetId: ret[1].asset.assetId
            };
        }
        return ret
    }
)
// vm.updateBitmap = editingProxy(vm.updateBitmap,"updatebitmap",
//     (args)=>({h:args[1].height,w:args[1].width}),
//     (data)=>{
//         let args = data.args;
//         args[1] = new ImageData(Uint8ClampedArray.from(Object.values(args[1].data)), data.extrargs.width, data.extrargs.height);
//         return args
//     })
vm.updateSvg = editingProxy(vm.updateSvg,"updatesvg",null,(_a,_b,data)=>{
    let costumeIndex = getSelectedCostumeIndex()
    console.log(data)
    // update paint editor if reciever is editing the costume
    if(targetToName(vm.editingTarget) == data.extrargs.target && costumeIndex != -1 && costumeIndex == data.args[0]) {
        let costume = vm.editingTarget.getCostumes()[costumeIndex]
        let paper = getPaper()
        console.log('switching paper costume')
        if(!paper) {return;}
        paper.switchCostume(
            costume.dataFormat,
            costume.asset.decodeText(),
            costume.rotationCenterX,
            costume.rotationCenterY,
            paper.props.zoomLevelId,
            paper.props.zoomLevelId)
    }
})
// vm.updateBitmap = proxy(vm.updateBitmap,"updatebit",null,null,null,()=>{vm.emitTargetsUpdate();vm.emitWorkspaceUpdate()})
// vm.updateSvg = proxy(vm.updateSvg,"updatesvg",null,null,null,()=>{vm.emitTargetsUpdate();vm.emitWorkspaceUpdate()})
newTargetEvents = {} // targetName => [events...] //todo make let statement
function addNewTargetEvent(targetName, event) {
    if(!(targetName in newTargetEvents)) {
        newTargetEvents[targetName] = []
    }
    newTargetEvents[targetName].push(event)
}

// ()=>{pauseEventHandling = true},(
vm.addSprite = proxy(vm.addSprite,"addsprite",null,null,null,(a,b)=>{ vm.setEditingTarget(a.id);  })
vm.duplicateSprite = proxy(vm.duplicateSprite,"duplicatesprite",
    // extrargs
    (args)=>({name:targetToName(vm.runtime.getTargetById(args[0]))}),
    (data)=>[nameToTarget(data.extrargs.name).id],
    ()=>{pauseEventHandling = true},
    ((a,b,n,result)=>{
        vm.setEditingTarget(a.id)
        pauseEventHandling = false;
        console.log('🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔🔔 stuff done! b, result',b,result); 
        newTargetEvents[b.sprite.name]?.forEach(event=>blockliveListener(event))
        
    }),null,null,()=>{
        // send replace blocks message
        liveMessage({meta:"vm.replaceBlocks",target:targetToName(vm.editingTarget),blocks:vm.editingTarget.blocks._blocks})
    })
    // Object.keys(vm.editingTarget.blocks._blocks).forEach(v=>{vm.editingTarget.blocks.deleteBlock(v)})
vm.deleteSprite = proxy(vm.deleteSprite,"deletesprite",
    (args)=>({name:targetToName(vm.runtime.getTargetById(args[0]))}),
    (data)=>[nameToTarget(data.extrargs.name).id])
vm.renameSprite = proxy(vm.renameSprite,"renamesprite",
    (args)=>({oldName:targetToName(vm.runtime.getTargetById(args[0]))}),
    (data)=>[nameToTarget(data.extrargs.oldName).id,data.args[1]])
vm.reorderTarget = proxy(vm.reorderTarget,"reordertarget")
// vm.shareBlocksToTarget = proxy(vm.shareBlocksToTarget,"shareblocks",
// (args)=>({toName:vm.runtime.getTargetById(args[1]).sprite.name}),
// (data)=>[data.args[0],vm.runtime.getSpriteTargetByName(data.extrargs.toName).id],null,()=>{vm.emitWorkspaceUpdate()})

let shareCreates = []
let lastDeletedBlock
waitFor(()=>(vm.editingTarget)).then(()=>{
    let oldCreateBlock = vm.editingTarget.blocks.__proto__.createBlock

    vm.editingTarget.blocks.__proto__.createBlock = function(...args) {
        if(isTargetSharing) {
            shareCreates.push(args)
        }
        return oldCreateBlock.call(this,...args)
    }

    let oldDeleteBlock = vm.editingTarget.blocks.__proto__.deleteBlock
    vm.editingTarget.blocks.__proto__.deleteBlock = function(...args) {
        lastDeletedBlock = this._blocks[args[0]]
        return oldDeleteBlock.call(this,...args)
    }
})

waitFor(()=>(vm.extensionManager)).then(()=>{
    vm.extensionManager.loadExtensionURL = 
    anyproxy(vm.extensionManager,vm.extensionManager.loadExtensionURL,"loadextensionurl")
})


let oldShareBlocksToTarget = vm.shareBlocksToTarget
let isTargetSharing = false
vm.shareBlocksToTarget = function(blocks, targetId, optFromTargetId) {
    shareCreates = []
    isTargetSharing = true
    return oldShareBlocksToTarget.bind(vm)(blocks, targetId, optFromTargetId).then(()=>{
        isTargetSharing = false
        let targetName = targetToName(vm.runtime.getTargetById(targetId))
        let fromTargetName = targetToName(vm.runtime.getTargetById(optFromTargetId))
        liveMessage({meta:"vm.shareBlocks",target:targetName,from:fromTargetName,blocks:shareCreates})
    })
}

function doShareBlocksMessage(msg) {
    let target = nameToTarget(msg.target)
    let targetId = target.id
    let fromTargetId = nameToTarget(msg.from)?.id
    // resolve variable conflicts
    // if(!!fromTargetId) {vm.runtime.getTargetById(fromTargetId).resolveVariableSharingConflictsWithTarget(msg.blocks, target);}

    // create new blocks in target
    msg.blocks.forEach(bargs=>{target.blocks.createBlock(...bargs)})
    target.blocks.updateTargetSpecificBlocks(target.isStage);

    if(targetId == vm.editingTarget.id) {vm.emitWorkspaceUpdate()}
    // update flyout for new variables and blocks
    if(!isWorkspaceAccessable()){return}
    getWorkspace().getToolbox().refreshSelection()
}


// vm.shareCostumeToTarget

// no sure what this does but it might be useful at some point this.editingTarget.fixUpVariableReferences();

// port.postMessage();

}













/////........................ GUI INJECTS .........................//////
console.log('running gui inject...')
let shareDropdown = `
<container style="width:200px; row-gap: 5px; display:flex;flex-direction:column;background-color: #4d97ff;padding:10px; padding-left:20px; padding-right:20px;border-radius: 17px;">
<font face="Helvetica Neue" style="color:white;font-weight:normal;">   
<sharedWith style="display:flex;flex-direction: column;">
        <text style="display:flex;align-self: left;padding-left:4px; padding-top:5px;padding-bottom:5px;font-size: large;">
            Shared With
        </text>
        <sharedList  style="overflow: scroll; max-height: 350px; display:flex; min-height: 20px; border-radius:10px;gap:5px;flex-direction: column;  ">
            <cell id="example" style="display:none; gap:10px;flex-direction: row; align-items: center;">
                <pic  style='width:40px; height:40px; border-radius: 100%; display:flex;background-position: center;background-size:cover; background-image:url("https://i.pinimg.com/originals/12/ff/9c/12ff9cd0f45317c362f0c87e2e55bd6c.jpg");';>
                </pic>
                <name onclick='window.open("https:\/\/scratch.mit.edu/users/" + this.innerText)', class="sharedName" style="max-width:122px;overflow:hidden; display:flex;align-self: center; font-size: large;font-weight:bold;">
                    WazzoTV
                </name>
                <x onclick="removeCollaborator(this.username)" style="display:flex; align:right;font-size:large; border-radius: 100%;padding: 0px;">
                    ✕
                </x>
            </cell>
        </sharedList>
    </sharedWith>
    <hr style="display: flex; width: 100%; height:1px;border:none;background-color:#16488f"></hr>
    <search style="display:flex;flex-direction: column; ">
        <text style="display:flex;align-self:  left;padding-top:5px;padding-bottom:5px;padding-left:4px; font-size: large;">
            Add Collaborators
        </text>
        <input id='searchy' style="color:black; display: flex;  margin-bottom:10px; align-self: center;border-radius: 10px; border-style: none; width:190px; height:30px">


    </input>
        <results style="display: flex; height: 40px;">
            <cell class="result" onclick="if(opening){opening=false;return;}addCollaborator(this.username);"  id="resultt" style="visibility: hidden; padding-right:20px; border-radius: 20px; display:flex; gap:10px;flex-direction: row; align-items: center;">
                <!-- <highlight class="resultHighlight" style="z-index: 0;position:absolute; width:240px; height: 50px; left:8px">

                </highlight> -->
                <pic id="resultPic" style='pointer-events:none;z-index: 1;width:40px; height:40px; border-radius: 100%; display:flex;background-position: center;background-size:cover;';>
                    <x id='plus' style="z-index: 1; color:rgb(9, 79, 136);margin-left:10px;display:flex; width:30px; border-radius: 100%;padding: 2px;font-weight: bold;font-size: x-large;">
                        +
                   </x>
                </pic>
                <name id="resultName" onclick='opening=true;window.open("https:\/\/scratch.mit.edu/users/" + this.innerText)' style="overflow:hidden;max-width:144px; z-index: 1;display:flex;align-self: center; font-size: large;font-weight:bold;">

                </name>
                
            </cell>
        </results>
    </search>
    </font>
    </container>

`
let shareScript = `{
let apiUrl = 'http://152.67.248.129:4000'

opening = false
let result = document.querySelector('#resultName')
let resultt = document.querySelector('#resultt')
let plus = document.querySelector('#plus')
let resultPic = document.querySelector('#resultPic')
let example = document.querySelector('#example')

        earch =document.querySelector('#searchy')

        let shareDivs = {}

        cachedUser = null

        addCollaborator = async (username) =>{
            if(username.toLowerCase() in shareDivs) {return}
            let res = cachedUser?.user?.username?.toLowerCase() == username.toLowerCase() ? cachedUser : await (await fetch(\`https://scratch.mit.edu/site-api/users/all/\${username}\`)).json();
            if(!res?.id) {return}
            let img = res?.thumbnail_url

            let newCollab = example.cloneNode(-1)
            console.log(newCollab)
            newCollab.style.display = 'flex'
            Array.from(newCollab.children).find(elem=>elem.localName =='name').innerHTML = res?.user?.username;
            Array.from(newCollab.children).find(elem=>elem.localName =='x').username = res?.user?.username;
            Array.from(newCollab.children).find(elem=>elem.localName =='pic').style.backgroundImage = \`url('\${img}')\`  
            shareDivs[username.toLowerCase()] = newCollab
            example.parentNode.append(newCollab);

            resultt.style.visibility = 'hidden'
            earch.value = ''
            earch.oninput();
        }

        removeCollaborator= async (username)=> {
            if(!(username.toLowerCase() in shareDivs)) {return}
            shareDivs[username.toLowerCase()].remove()
            delete shareDivs[username.toLowerCase()]
        }

        earch.addEventListener("keyup", function(event) {
  // Number 13 is the "Enter" key on the keyboard
  if (event.keyCode === 13) {
    // Cancel the default action, if needed
    addCollaborator(earch.value)
  }
});

        earch.oninput = async ()=>{
            console.log('hi')
            let res

            // await (await fetch("ilhp10/")).json();
             try{(res=await (await fetch('https://scratch.mit.edu/site-api/users/all/' + earch.value)).json())} catch(e) {
                 res=null
             }
            //  try{(res=await (await fetch('https://api.scratch.mit.edu/users/' + earch.value)).json())} catch(e) {
            //      res=null
            //  }
            if(earch.value?.toLowerCase() != res?.user?.username?.toLowerCase()) {return}
             if(!!res?.user?.username) {
            result.innerHTML = res?.user?.username
            result.parentNode.username = res?.user?.username
            let img = res?.thumbnail_url
            // let img = res?.user?.images['60x60']
            cachedUser = res
            console.log(img)
                 resultt.style.visibility = 'visible'
            resultPic.style.backgroundImage = \`url('\${img}')\`  
             } else {
                 resultt.style.visibility = 'hidden'
             }
        }

        function multiplyNode(node, count, deep) {
    for (var i = 0, copy; i < count - 1; i++) {
        copy = node.cloneNode(deep);
        node.parentNode.insertBefore(copy, node);
    }
}

multiplyNode(document.querySelector('cell'), 2, true);

fetch(\`\${apiUrl}/share/\${blId}\`).then(res=>{res.json().then(json=>json.forEach(addCollaborator))})
}
`
let shareCSS = `.sharedName:hover {
    text-decoration: underline;
}
#resultName:hover {
    text-decoration: underline;
}

.result:hover {
background: #6aa8ff;
}
.blockliveloader {
    border: 3px solid rgba(255,0,113,1);
    border-top: 3px solid white;
    border-bottom: 3px solid white;
    border-radius: 50%;
    width: 13px;
    height: 13px;
    animation: spin 2s linear infinite;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`
function makeBlockliveButton() {
    let button = document.createElement('blocklive-init')
    button.className = 'button_outlined-button_1bS__ menu-bar_menu-bar-button_3IDN0'
    button.style.background = "#ff00e6"
    button.style.marginRight = '20px'
    button.style.gap = '7px'
    // button.style.background = ' linear-gradient(90deg, rgba(51,0,54,1) 0%, rgba(255,0,113,1) 60%)'
    button.style.background = 'rgba(255,0,113,1)'
    button.style.display = 'flex'
    button.style.flexDirection = 'row'

    let text = document.createElement('text')
    text.style.textAlign = 'center'
    text.innerHTML = "Blocklive<br>Share"

    let loader = document.createElement('loader')
    loader.className = 'blockliveloader'
    loader.style.display = 'none'
    button.appendChild(loader)
    button.appendChild(text)
    return button
}


function injectJSandCSS() {

    let dropdownScriptElem = document.createElement('script')
    dropdownScriptElem.innerHTML = shareScript
    document.head.appendChild(dropdownScriptElem)

    let styleInj = document.createElement('style')
    styleInj.innerHTML = shareCSS
    document.head.appendChild(styleInj)
}

let blActivateClick = ()=>{
    // change onclick
    blockliveButton.onclick = undefined
    // set spinny icon
    document.querySelector('loader.blockliveloader').style.display = 'flex'

    // save project in scratch
    store.dispatch({type: "scratch-gui/project-state/START_MANUAL_UPDATING"})

    chrome.runtime.sendMessage(exId,{meta:'create',scratchId},(response)=>{
        blId = response.id 

        // ACTIVATE BLOKLIVE!!!
        projectReplaceInitiated = true;
        pauseEventHandling = false
        liveMessage({meta:"myId",id:blId})
        activateBlocklive()
        // JOIN BLOCKLIVE SESSION!!!!
        liveMessage({meta:"joinSession"})
        readyToRecieveChanges = true

        // stop spinny
        document.querySelector('loader.blockliveloader').style.display = 'none'

        // Set button onclick
        blockliveButton.onclick = blShareClick
        document.addEventListener('click', (e)=>{if(e.target.nodeName != 'X' &&!dropdown.contains(e.target) && !button.contains(e.target)){dropdown.style.display = 'none'}})
        blShareClick()
    })
}
let blShareClick = ()=>{console.log('clicked'); dropdown.style.display = (dropdown.style.display == 'none' ? 'flex' : 'none') }

console.log('listening for share button')
blockliveButton = null
listenForObj('#app > div > div.gui_menu-bar-position_3U1T0.menu-bar_menu-bar_JcuHF.box_box_2jjDp > div.menu-bar_main-menu_3wjWH > div:nth-child(7) > span',
    (bc)=>{
        bc.children[1].children[0].innerHTML = "Become Blajingus"

        let container = document.createElement('blockliveContainer')
        container.style.display = 'flex'
        container.style.flexDirection = 'column'

        let button = makeBlockliveButton()
        blockliveButton = button
        let dropdown = document.createElement('blockliveDropdown')
        dropdown.innerHTML = shareDropdown
        dropdown.style.position = 'absolute'
        dropdown.style.top = '40px'
        dropdown.style.borderRadius = '17px'
        dropdown.style.boxShadow = '3px 7px 19px 3px rgba(0,0,0,0.48)'
        dropdown.style.display = 'none'

        button.onclick = ()=>{
            if(blId) {
                // if already is shared
                return blShareClick()
            } else {
                // if is regular scratch project
                return blActivateClick()
            }
        }

        container.appendChild(button)
        container.appendChild(dropdown)
        bc.parentNode.parentNode.insertBefore(container,bc.parentNode)

        injectJSandCSS()
    }
)