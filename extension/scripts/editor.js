console.log('CollabLive Editor Inject Running...')

// get exId
const exId = document.querySelector(".blocklive-ext").dataset.exId

//////////// TRAP UTILS ///////////

function sleep(millis) {
    return new Promise(res=>setTimeout(res,millis));
}
let queryList = []
let bl_projectId = null
store = null
let playAfterDragStop = []
function mutationCallback() {
    if(typeof BL_UTILS == 'object'){
        if(!BL_UTILS.isDragging() && playAfterDragStop.length > 0) {
            playAfterDragStop.forEach(msg=>{blockliveListener(msg)})
            playAfterDragStop = []
        }
    }
    if(bl_projectId && store?.getState().preview.projectInfo.id != bl_projectId) {location.reload()}
    bl_projectId = store?.getState().preview.projectInfo.id;
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
            // console.log('waiting for lambda resolve: ' + lambda)
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
    if(msg.meta=="blockly.event" || msg.meta=="sprite.proxy"||msg.meta=="vm.blockListen"||msg.meta=="vm.shareBlocks" ||msg.meta=="vm.replaceBlocks" ||msg.meta=="vm.updateBitmap") {
        blVersion++
    }
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
            liveMessage({meta:"joinSession"}) // TODO: maybe do away with sending join message?
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

async function startBlocklive(creatingNew) {
    pauseEventHandling = true
    liveMessage({meta:"myId",id:blId})
    activateBlocklive()
    if(creatingNew || store.getState().scratchGui.projectState.loadingState.startsWith('SHOWING')) {
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
    // Get usable scratch id
    // await waitFor(()=>{!isNaN(parseFloat(location.pathname.split('/')[2]))})
    // scratchId = location.pathname.split('/')[2]
    waitFor(()=>(!isNaN(parseFloat(location.pathname.split('/')[2])))).then(()=>{scratchId = location.pathname.split('/')[2]})

    // trap vm and store
    let reactInst = Object.values(await getObj('div[class^="stage-wrapper_stage-wrapper_"]')).find((x) => x.child)
    vm = reactInst.child.child.child.stateNode.props.vm;
    store = reactInst.child.child.child.stateNode.context.store
    addButtonInjectors()
    blId = isNaN(parseFloat(location.pathname.split('/')[2])) ? '' : await getBlocklyId(scratchId);
    if(!blId) {
        chrome.runtime.sendMessage(exId,{meta:'callback'},(request) => { if(request.meta == 'initBlocklive') { 
            blId = request.blId; 
            startBlocklive(true);}});
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
    // let inpoint = await getInpoint(id)
    let inpoint = await getJson(id)
    let projectJson = inpoint.json;
    if(inpoint.err) {alert('issue joining blocklive id: ' + id + '\n error: ' + inpoint.err);return;}
    pauseEventHandling = true
    try {
    // console.log('downloading scratch id',inpoint.scratchId)
    console.log('loading scratch project inpoint',inpoint)
    await vm.loadProject(projectJson)
        blVersion = inpoint.version
    } catch (e) {
        prompt(`Scratch couldn't load the project JSON we had saved for this project. Clicking OK or EXIT will attempt to load the project from the changelog, which may take a moment. \n\nSend this blocklive id to @ilhp10 on scratch:`,`${blId};`)
        // prompt(`Blocklive cannot load project data! The scratch api might be blocked by your network. Clicking OK or EXIT will attempt to load the project from the changelog, which may take a moment. \n\nHere are your ids if you want to report this to @ilhp10:`,`BLOCKLIVE_ID: ${blId}; SCRATCH_REAL_ID: ${scratchId}; INPOINT_ID: ${inpoint.scratchId}`)
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
// function getInpoint(blockliveId) {
//     return new Promise((res)=>{chrome.runtime.sendMessage(exId,{meta:'getInpoint',blId:blockliveId},res)})     
// }
function getJson(blockliveId) {
    return new Promise((res)=>{chrome.runtime.sendMessage(exId,{meta:'getJson',blId:blockliveId},res)})     
}
function getChanges(Id,version) {
    return new Promise((res)=>{chrome.runtime.sendMessage(exId,{meta:'getChanges',blId,version},res)})
}
function fetchTitle(blId) {
    return new Promise((res)=>{chrome.runtime.sendMessage(exId,{meta:'getTitle',blId},res)})
}

let getAndPlayNewChanges

async function activateBlocklive() {

    playChanges = async (changes)=>{
        pauseEventHandling = true
        for (let i = 0; i < changes.length; i++) {
            await blockliveListener(changes[i])
        }
        if(changes.currentVersion){blVersion = changes.currentVersion}
        pauseEventHandling = false

        vm.emitWorkspaceUpdate()
        vm.emitTargetsUpdate()
    }

    // set scope exposed functions    
    getAndPlayNewChanges = async ()=>{

        console.log('syncing since version: ' +  blVersion) 
        fetchTitle(blId).then(title=>setTitle(title)) // set title

        // sync all other project changes
        changes = await getChanges(blId,blVersion)
        if(typeof BL_UTILS != 'undefined' && BL_UTILS.isDragging()) {
            console.log('queing it for later')
            playAfterDragStop.push({meta:'resyncCached',changes})
        } else {
            await playChanges(changes)
        }
    
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
        if(typeof BL_UTILS != 'undefined' && BL_UTILS.isDragging()) {
            // dong add to list if its a move event on the current moving block
            if(msg.meta == 'vm.blockListen' && msg.type == 'move' && msg.event.blockId == BL_UTILS.getDraggingId()) {return}
            else { playAfterDragStop.push(msg) }
            return;
        }
    
        // console.log('recieved message',msg)
        if(!!msg.version){blVersion = msg.version-1} // TODO: possibly disable this
        try{
        if(msg.meta == 'resyncCached') {
            // remember to await shit
            await playChanges(msg.changes)
        } else if (msg.meta=="sprite.proxy") {
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
                // console.log('saving for later')
                addNewTargetEvent(msg.target,msg);
            }
            else {
                // console.log('doing')
                blVersion++
                replaceBlockly(msg)
            }
        } else if(msg.meta == 'vm.updateBitmap') { // TODO: Do this better-- pass in changes from bg script
            await updateBitmap(msg)
        } else if(msg.meta=='yourVersion') {
            console.log('version ponged: ' + msg.version)
            blVersion = msg.version
        } else if(msg.meta == 'setTitle') {
            setTitle(msg.title)
        } else if(msg.meta == 'resync') { // TODO: Do this better-- pass in changes from bg script
            if(readyToRecieveChanges){getAndPlayNewChanges()}
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
    let retVal = Blockly.getMainWorkspace()
    if(typeof ScratchBlocks == 'undefined') {return retVal}
    Object.entries(ScratchBlocks.Workspace.WorkspaceDB_).forEach(wkv=>{
        if(!wkv[1].isFlyout && wkv[1].deleteAreaToolbox_) {retVal = wkv[1]}
    })
    return retVal;
}
function getWorkspaceId() {
    return getWorkspace()?.id
}

function getDraggingId() {
    return Blockly.getMainWorkspace().getBlockDragSurface().getCurrentBlock()?.getAttribute('data-id')
}
function isDragging() {
    return Blockly.getMainWorkspace()?.isDragging()
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

BL_UTILS = {
    isWorkspaceAccessable,
    getWorkspace,
    getWorkspaceId,
    getDraggingId, isDragging,
    targetToName,
    nameToTarget,
    getSelectedCostumeIndex,
}

// send to api when project saved and name change
let lastProjectState = store.getState().scratchGui.projectState.loadingState
let lastTitle = store.getState().preview.projectInfo.title
let settingTitle = null
store.subscribe(function() {
    // HANDLE PROJECT SAVE
    let state = store.getState().scratchGui.projectState.loadingState
    if(lastProjectState != state) { // If state changed
        lastProjectState = store.getState().scratchGui.projectState.loadingState

        if(state.endsWith('UPDATING')) {
            console.log('🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢')
            chrome.runtime.sendMessage(exId,{meta:'projectSavedJSON',blId,json:vm.toJSON(),version:blVersion,})
            // chrome.runtime.sendMessage(exId,{meta:'projectSaved',blId,scratchId,version:blVersion})
        }
    }

    // HANDLE TITLE CHANGE
    let title = store.getState().preview.projectInfo.title
    if(title != lastTitle) {
        lastTitle = title
        if(title != settingTitle) {
            console.log('title changed to',title)
            liveMessage({meta:'setTitle',blId,title})
        }
    }
})


function setTitle(title) {
    settingTitle = title
    let elem = document.querySelector("#frc-title-1088") //Todo: query id
    if(elem) {
        Object.entries(elem).find(en=>en[0].startsWith('__reactEventHandlers$'))[1].onBlur({currentTarget:{value:title}})
    } else {
        store.dispatch({
            type: 'projectTitle/SET_PROJECT_TITLE',
            title
        });
    }
}



function replaceBlockly(msg) {
    // replace a target's block data (used for syncing id's on sprite duplicate)
    let target = nameToTarget(msg.target);
    let blocks = target.blocks
    Object.keys(blocks._blocks).forEach(v=>{blocks.deleteBlock(v)})
    // console.log(msg.blocks)
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
            // console.log('intrecepted:')
            // console.log(...args)
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
            // console.log('intrecepted:')
            // console.log(...args)
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
        case 'var_delete':
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
// listen to local blockly events
function blockListener(e) {
    // console.log('is event handling & workspace updating paused?: ' + pauseEventHandling)
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
            if(!!block && (
                block.opcode == "data_variable" || block.opcode == "data_listcontents"
            )) {
                extrargs.blockVarId = e.oldValue
                extrargs.blockVarParent = block.parent
                extrargs.blockVarPos = {x:block.x,y:block.y}
                extrargs.blockVarInput = Object.values(new Object(vm.editingTarget.blocks.getBlock(block.parent)?.inputs))?.find(input=>(input.block==e.blockId))?.name
            }
        } else if(e.type == 'delete' && (
            e.oldXml?.firstElementChild?.getAttribute('name') == 'VARIABLE' ||
            e.oldXml?.firstElementChild?.getAttribute('name') == 'LIST'
        )) {
            let block = !!vm.editingTarget.blocks._blocks[e.blockId] ? vm.editingTarget.blocks._blocks[e.blockId] : lastDeletedBlock
            extrargs.blockVarId = block.fields.VARIABLE ? block.fields.VARIABLE.id : block.fields.LIST.id
            extrargs.blockVarParent = block.parent
            extrargs.blockVarPos = {x:block.x,y:block.y}
            extrargs.blockVarInput = Object.values(new Object(vm.editingTarget.blocks.getBlock(block.parent)?.inputs))?.find(input=>(input.block==e.blockId))?.name
        }

        // send field locator info
        if(e.element == 'field') {
            if(vm.editingTarget.blocks.getBlock(e.blockId).shadow) {
            let fieldInputId = e.blockId
            let fieldInput = vm.editingTarget.blocks.getBlock(fieldInputId)
            let parentId = fieldInput.parent
            if(!!parentId) {
                let parentBlock = vm.editingTarget.blocks.getBlock(parentId)
                let inputTag = Object.values(new Object(parentBlock.inputs)).find(input=>input.shadow==fieldInputId).name

                extrargs.parentId = parentId
                extrargs.fieldTag = inputTag
            }
            }
        }

        // send broadcast name (in case of auto broadcast delete on recieving client)
        if(e.type == 'change' && e.name == "BROADCAST_OPTION") {
            extrargs.broadcastName = vm.runtime.getTargetForStage().variables[e.newValue]?.name
            extrargs.broadcastId = vm.runtime.getTargetForStage().variables[e.newValue]?.id
        }

        // send block xml-related things
        if(!!e.xml) {
            extrargs.xml = {outerHTML:e.xml.outerHTML}
            extrargs.isCBCreateOrDelete = e.xml?.getAttribute('type') == 'procedures_definition'
        }
        if(!!e.oldXml) {
            extrargs.isCBCreateOrDelete = extrargs.isCBCreateOrDelete || e.oldXml?.getAttribute('type') == 'procedures_definition'
        }

        // console.log("sending",e,extrargs,'target',targetToName(vm.editingTarget))

        let message = {meta:"vm.blockListen",type:e.type,extrargs,event:e,json:e.toJson(),target:targetToName(vm.editingTarget),}
        
        // intercept and save create events to send later
        if(e.type == "create") {
            createEventMap[e.blockId] = message
        // } else if (e.type == 'comment_create') { //TODO: maybe add back
        //     createEventMap[e.commentId] = message
        // intercept auto generated move event
        } else if ((e.type == 'move') && e.blockId in toBeMoved){
            let moveEvents = toBeMoved[e.blockId]
            // console.log("move events",moveEvents)
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
                    // setTimeout(()=>{liveMessage(createEventMap[e.blockId])},5000 )
                }
                delete createEventMap[e.blockId]
            }
            if(e.commentId in createEventMap) {
                if(e.type == 'comment_delete') {
                    message = null
                } else { 
                    liveMessage(createEventMap[e.commentId]) 
                    // setTimeout(()=>{liveMessage(createEventMap[e.commentId]) },5000)
                }
                delete createEventMap[e.commentId]
            }
            if(!!message){
                liveMessage(message)
                // setTimeout(()=>{liveMessage(message)},5000)
            }
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

    // pause workspace updating
    pauseWorkspaceUpdating()

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
            if(!closestBlock) {/*console.log('bruh')*/}
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
    let queueUpdate = false;
    if(!!d.extrargs.fieldTag) {
        let realId = vm.editingTarget.blocks.getBlock(d.extrargs.parentId).inputs[d.extrargs.fieldTag].shadow
        // queueUpdate = vm.editingTarget.blocks.getBlock(realId)?.opcode == 'sensing_of_object_menu' // workspace update if updates mid-
        vEvent.blockId = realId;
        bEvent.blockId = realId;
    }

    // create broadcast if needed
    if(!!d.extrargs.broadcastName && !vm.runtime.getTargetForStage().variables[d.json.newValue]) {
        let createVmEvent = {isCloud: false, isLocal: false, type: "var_create", varId: d.extrargs.broadcastId, varName: d.extrargs.broadcastName, varType: "broadcast_msg"}
        console.log('remaking broadcast',createVmEvent)
        vm.blockListener(createVmEvent)

        if(isWorkspaceAccessable()) {
            let createBlEvent = ScratchBlocks.Events.fromJson(createVmEvent,getWorkspace())
            blockliveEvents[getStringEventRep(createBlEvent)] = true
            createBlEvent.run(true)
        }
    }

    //xml
    if(!!d.extrargs.xml) {
        vEvent.xml = d.extrargs.xml
    }

    // add comment create xy
    if(d.type == "comment_create") {
        bEvent.xy = d.event.xy
    }

    if(
        (
            (targetToName(oldEditingTarget) == d.target && !pauseEventHandling) || // if in same editing target that event is for
            (['var_create','var_delete'].indexOf(d.type) != -1 && !d.json.isLocal) // or if event is a global variable create or delete
        )
        && isWorkspaceAccessable() // and no matter what make sure that workspace is accessable
    ){
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

            // try to add transition element stuff
            // if(false ) {
            if(bEvent.type == 'move') {
                let blockElement = getWorkspace()?.getBlockById(bEvent.blockId)?.getSvgRoot()
                console.log(blockElement)
                if(blockElement) {
                    blockElement.style.transition='transform 0.5s';
                }
            }
        // }
    
            // blockElement?.style.transitionProperty='transform';

            bEvent.run(true)
            // blockElement?.style.transition='transform 0.5s';

            lastEventRun = bEvent 

            // for custom blocks, update toolbox
            if(bEvent.element == "mutation" || d.extrargs.isCBCreateOrDelete) {
                getWorkspace().getToolbox().refreshSelection()
            }

            // highlight blocks
            if(['create','move','change'].indexOf(bEvent.type)) {
                console.log(d)
                let blockId = bEvent.blockId
                outlineBlock(blockId)
            }
            // 'comment_create','comment_change','comment_move'

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
    continueWorkspaceUpdating()
}

let oldTargUp = vm.emitTargetsUpdate.bind(vm)
let etuListeners = []
vm.emitTargetsUpdate = function(...args) {
    etuListeners.forEach(e=>e?.())
    etuListeners = []
    if(pauseEventHandling) {return}
    else {oldTargUp(...args)}
}

let oldEWU = (vm.emitWorkspaceUpdate).bind(vm)

bl_workspaceUpdatingPaused = false
bl_workspaceUpdateRequested = false
function pauseWorkspaceUpdating() {
    bl_workspaceUpdatingPaused = true  
}
function continueWorkspaceUpdating() {
    bl_workspaceUpdatingPaused = false
    if(bl_workspaceUpdateRequested) {vm.emitWorkspaceUpdate()}
    bl_workspaceUpdateRequested = false
}

vm.emitWorkspaceUpdate = function() {
    if(pauseEventHandling) {console.log('workspace update voided'); return;}
    if(bl_workspaceUpdatingPaused) {bl_workspaceUpdateRequested = true; console.log('workspace update saved'); return;}
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

    // set animation
    // Blockly.getMainWorkspace().getAllBlocks().forEach(block=>{block.getSvgRoot().style.transition='transform 0.5s';})
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
        if(!!args[1]){targetName = targetToName(vm.runtime.getTargetById(args[1]))} else {targetName = targetToName(vm.editingTarget)}
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
// vm.updateBitmap = editingProxy(vm.updateBitmap,"updatebitmap",null,(_a,_b,data)=>{
//     let costumeIndex = getSelectedCostumeIndex()
//     // console.log(data)
//     // update paint editor if reciever is editing the costume
//     if(targetToName(vm.editingTarget) == data.extrargs.target && costumeIndex != -1 && costumeIndex == data.args[0]) {
//         // todo use some other method of refreshing the canvas
//         document.getElementById('react-tabs-4').click()
//         document.getElementById('react-tabs-2').click()
//     }
// },
//     (args)=>({height:args[1].height,width:args[1].width}),
//     (data)=>{
//         let args = data.args;
//         args[1] = new ImageData(Uint8ClampedArray.from(Object.values(args[1].data)), data.extrargs.width, data.extrargs.height);
//         return args
//     })
vm.updateSvg = editingProxy(vm.updateSvg,"updatesvg",null,(_a,_b,data)=>{
    let costumeIndex = getSelectedCostumeIndex()
    // console.log(data)
    // update paint editor if reciever is editing the costume
    // todo: instead of checking with vm.editingTarget, use _a or _b
    if(targetToName(_a) == data.extrargs.target && costumeIndex != -1 && costumeIndex == data.args[0]) {
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
let oldUpdateBitmap = vm.updateBitmap
vm.updateBitmap = (...args)=>{
    // args: costumeIndex, bitmap, rotationCenterX, rotationCenterY, bitmapResolution
    oldUpdateBitmap.bind(vm)(...args);
    // vm runs emitTargetsUpdate after creating new asset
    etuListeners.push(async()=>{
        let target = BL_UTILS.targetToName(vm.editingTarget);

        let costumeIndex = args[0]
        let bitmapResolution = args[4]
        let costume = vm.editingTarget.getCostumes()[costumeIndex];
        let sendCostume = JSON.parse(JSON.stringify(costume))
        delete sendCostume.asset
        console.log(costume)
        let asset = costume.asset;
    
        let bitmap = args[1]
        let w=bitmap.sourceWidth === 0 ? 0 : bitmap.width;
        let h=bitmap.sourceHeight === 0 ? 0 : bitmap.height;

        // send costume to scratch servers
        let stored = await vm.runtime.storage.store(asset.assetType,asset.dataFormat,asset.data,asset.assetId);
        // get costume info to send

        liveMessage({meta:'vm.updateBitmap',costume:sendCostume,target,costumeIndex,assetType:asset.assetType,h,w,bitmapResolution})
    })
}
async function updateBitmap(msg) {
    console.log(msg)
    console.log(msg.costume.assetId)
    let target = BL_UTILS.nameToTarget(msg.target)
    let costume = target.getCostumes()[msg.costumeIndex]
    asset = await vm.runtime.storage.load(msg.assetType,msg.costume.assetId,msg.costume.dataFormat)

    costume.asset = asset
        Object.entries(msg.costume).forEach(entry=>{
            costume[entry[0]] = entry[1]
        }
    )

    vm.emitTargetsUpdate()

    // update paper 
    let selectedCostumeIndex = getSelectedCostumeIndex()
    if(BL_UTILS.targetToName(vm.editingTarget) == msg.target && selectedCostumeIndex != -1 && msg.costumeIndex == selectedCostumeIndex) {
        let costume = vm.editingTarget.getCostumes()[msg.costumeIndex]
        let paper = getPaper()
        console.log('switching paper costume')
        if(!paper) {return;}
        paper.switchCostume(
            costume.dataFormat,
            costume.asset.encodeDataURI(),
            costume.rotationCenterX,
            costume.rotationCenterY,
            paper.props.zoomLevelId,
            paper.props.zoomLevelId)
    }

    // image = new ImageData(new Uint8ClampedArray(asset.data.buffer),msg.w,msg.h)
    // console.log(image)

    /// TODO GET BITMAP SHOWING UP IN RENDER
    // const tmpCanvas = document.createElement('canvas');
    // tmpCanvas.width = msg.w;
    // tmpCanvas.height = msg.h;
    // const tmpCtx = tmpCanvas.getContext('2d');
    // const imageData = tmpCtx.createImageData(msg.w, msg.h);
    // imageData.data.set(asset.data);
    // tmpCtx.putImageData(imageData, 0, 0);
    // console.log(imageData)

    // vm.runtime.renderer.updateBitmapSkin(
    //     costume.skinId,
    //     tmpCanvas,
    //     msg.bitmapResolution,
    //     [costume.rotationCenterX / msg.bitmapResolution, costume.rotationCenterY / msg.bitmapResolution]
    // );
}
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

function postCursorPosition() {
    let workspace = getWorkspace()
    if(!workspace) {return}
    let scrollX = workspace.scrollX
    let scrollY = workspace.scrollY
    let scale = workspace.scale
    let targetName = BL_UTILS.targetToName(vm.editingTarget)
    let cursor = {scrollX,scrollY,scale,targetName}
    liveMessage({type:'setCursor',cursor})
}
setInterval(postCursorPosition,2500)


}



function createTagElement(username,color) {
    let innerHTML = `
               <div class="square" style="background-color: ${color}">
            </div>

            <div class="circle" style="background-color: ${color}; border: solid 2px ${color};">
            </div>

            <div class="usernameTag">
              <div class="tagName" style="background-color: ${color};"">${username}</div> 
            </div>
            `

    let tag = document.createElement('g')
    // let tag = document.createElement(username)
    tag.className ='tag'
    tag.innerHTML = innerHTML;
    return tag;
}

function setTag(tag, state) {
    if(state) {
        tag.classList.remove('turnOff')
        tag.classList.add('turnOn')
    } else {
        tag.classList.remove('turnOn')
        tag.classList.add('turnOff')
    }
}
function setOutline(blocks,state){
    if(state) {
        blocks.classList.remove('turnOff')
        blocks.classList.remove('turnedOff')
        blocks.classList.add('blocRect','turnOn')
    } else {
        blocks.classList.remove('turnOn')
        blocks.classList.remove('turnedOn')
        blocks.classList.add('blocRect','turnOff')
    }
    let animation = blocks.getAnimations().find(anim=>anim.animationName?.includes('outline'))
    animation.addEventListener('finish',()=>{
        if(state) {
            blocks.classList.remove('turnOn')
            blocks.classList.add('turnedOn')
        } else {
            blocks.classList.remove('turnOff')
            blocks.classList.add('turnedOff')
        } 
    })
}

function selectBlock(blocks,username,state,color) {
    blocks.style.outlineColor = color;
    let tag = blocks.querySelector('g' + '.tag')
    // let tag = blocks.querySelector(username + '.tag')
    if(!tag) {
        tag = createTagElement(username,color)
        blocks.appendChild(tag)
    }
    setOutline(blocks,state,color)
    setTag(tag,state,color)
}


BL_BlockOutlinesUsers = {} // {username: {blockid?,styles:{}}}
BL_BlockTimeouts = {} // {blockid:timeoutid}
BL_BlockOutlinesBlocks = {} // {blockid:def}

function resetBlock(outlineObj) {
    let block = Blockly.getMainWorkspace().getBlockById(outlineObj.blockId) 
        ?? Blockly.getMainWorkspace().getCommentById(outlineObj.blockId) 
    if(!block) {return}
    let element = block.getSvgRoot()
    element.style.transition = 'all 0.5s'
    selectBlock(element,'ilhp10',false)
}
function setBlockStyles(blockId,blockElem,newStyles) {
    let styles = {}
    blockElem.style.transition = 'transform 0.5s'
    selectBlock(blockElem,'ilhp10',true,'rgb(238, 0, 255)')
    return {blockId,styles}
}



function outlineBlock(blockId, username) {
    if(blockId in BL_BlockOutlinesBlocks) {
        resetBlock(BL_BlockOutlinesBlocks[blockId])
        delete BL_BlockOutlinesBlocks[blockId]
        clearTimeout(BL_BlockTimeouts[blockId])
        delete BL_BlockTimeouts[blockId]
    }
    if(username in BL_BlockOutlinesUsers) {
        resetBlock(BL_BlockOutlinesUsers[username])
        delete BL_BlockOutlinesUsers[username]
    } 
    let workspace = Blockly.getMainWorkspace()
    if(!workspace) {return}
    let block = workspace.getBlockById(blockId) ?? workspace.getCommentById(blockId) 
    if(!block) {return}

    let blockElem = block.getSvgRoot();

    const blockResetDef = setBlockStyles(blockId,blockElem,
        {'outline':'solid 8px rgb(255,0,113)'}
    )
    BL_BlockOutlinesUsers[username] = blockResetDef;
    BL_BlockOutlinesBlocks[blockId] = blockResetDef;
    
    let timeoutId = setTimeout(()=>{resetBlock(blockResetDef)},2500) // clear outline in 5 seconds
    BL_BlockTimeouts[blockId] = timeoutId
}










/////........................ GUI INJECTS .........................//////
console.log('running gui inject...')
let shareDropdown = `
<container style="width:200px; row-gap: 5px; display:flex;flex-direction:column;background-color: #4d97ff;padding:10px; padding-left:15px; padding-right:15px;border-radius: 17px;">
<div  style="color:white;font-weight:normal;font-face='Helvetica Neue','Helvetica',Arial,sans-serif">   
<sharedWith style="display:flex;flex-direction: column;">
        <text style="display:flex;align-self: left;padding-left:4px; padding-top:5px;padding-bottom:5px;font-size: large;">
            Shared With
        </text>
        <sharedList  style="overflow: auto; max-height: 350px; display:flex; min-height: 20px; border-radius:10px;gap:5px;flex-direction: column;  ">
            <cell id="blModalExample" style="display:none; gap:10px;flex-direction: row; align-items: center;">
                <pic  style='width:40px; height:40px; border-radius: 100%; display:flex;background-position: center;background-size:cover; background-image:url("https://i.pinimg.com/originals/12/ff/9c/12ff9cd0f45317c362f0c87e2e55bd6c.jpg");';>
                </pic>
                <name onclick='window.open("https:\/\/scratch.mit.edu/users/" + this.innerText)', class="sharedName" style="cursor:pointer; max-width:122px;overflow:hidden; display:flex;align-self: center; font-size: large;font-weight:bold;">
                    WazzoTV
                </name>
                <x onclick="removeCollaborator(this.username)" style="cursor:pointer; display:flex; align:right;font-size:large; border-radius: 100%;padding: 0px;">
                    ✕
                </x>
            </cell>
        </sharedList>
    </sharedWith>
    <hr style="display: flex; width: 100%; height:1px;border:none;background-color:#16488f"></hr>
    <search style="display:flex;flex-direction: column; ">
        <text style="display:flex;flex-direction:column;align-self:  left;padding-top:5px;padding-bottom:5px;padding-left:4px; font-size: large;">
            Add Collaborators
            <textt style="font-size:small; color:#b4d4ff; font-style:italic">Friends must add you on their list</textt>
            </text>
        <input id='searchy' style="color:black; display: flex;  margin-bottom:10px; align-self: center;border-radius: 10px; border-style: none; width:190px; height:30px">


    </input>
        <results style="display: flex; height: 40px;">
            <cell class="result" onclick="if(opening){opening=false;return;}addCollaborator(this.username);"  id="resultt" style="cursor:pointer; visibility: hidden; padding-right:20px; border-radius: 20px; display:flex; gap:10px;flex-direction: row; align-items: center;">
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
    </div>
    </container>

`
let shareScript = `{
let apiUrl = 'https://spore.us.to:4000'

opening = false
let result = document.querySelector('#resultName')
resultt = document.querySelector('#resultt')
let plus = document.querySelector('#plus')
let resultPic = document.querySelector('#resultPic')
blModalExample = document.querySelector('#blModalExample')

        earch =document.querySelector('#searchy')

        shareDivs = {}

        
        earch.addEventListener("keyup", function(event) {
  // Number 13 is the "Enter" key on the keyboard
  if (event.keyCode === 13) {
    // Cancel the default action, if needed
    addCollaborator(earch.value)
  }
});

        earch.oninput = async ()=>{
            console.log('hi')
            let currentSearching = earch.value.toLowerCase()
            let user = await getUserInfo(earch.value)
            if(currentSearching != earch.value.toLowerCase()) { return}
            if(user) {
           
            result.innerHTML = user.username
            result.parentNode.username = user.username

            resultt.style.visibility = 'visible'
            resultPic.style.backgroundImage = \`url('\${user.pic}')\`  
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

// fetch(\`\${apiUrl}/share/\${blId}\`).then(res=>{res.json().then(json=>json.forEach(addCollaborator))})
}
`
let shareCSS = `

.sharedName:hover {
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



.blActiveName {
    // visibility: hidden;
    filter: opacity(0%);

    // background-color: #ff00e6;
    color: #fff;
    transition: .2s;

    padding: 5px;
    border-radius: 6px;
    display: flex;
    align-self: center;
   
    /* Position the tooltip text - see examples below! */
    position: absolute;
    z-index: 1;

  }
  

  .blActiveUser:hover ~ .blActiveName {
    // visibility: visible;
    filter: opacity(100%);
  }






// highlight blocks


.tag{
    position: absolute;
    /* outline-color: rgb(255, 41, 216); */
    /* transform:translate(150px,50px) ;     */
    transform:translate(-110px,0px)  ;

}
.tagName{
    color:white;
    padding: 4px;
border-radius: 20px;

}

.usernameTag{   
    position: absolute;
    /* transform:rotate(-135deg)  ; */
    top:90px;

    font-size: 30px;
    font-family: helvetica;
    font-weight: bold;
    text-align: center;
    width: 100px;
  
    opacity: 0;

transition: .2s;


display: flex;
align-self: center;
align-items: center;
justify-content: center;
justify-items:center;

}

.tag:hover .usernameTag{
    opacity: 1;
}

.circle {
    position:absolute;
    width:100px;
    height:100px;
    border-radius: 100%;
    left:0px;
    top:0px;
    background: url("https://img.freepik.com/premium-photo/astronaut-outer-open-space-planet-earth-stars-provide-background-erforming-space-planet-earth-sunrise-sunset-our-home-iss-elements-this-image-furnished-by-nasa_150455-16829.jpg?w=2000");
    background-size: cover;
}

.square{    
    position:absolute;
    transform: translate(4px,3px) rotate(135deg);
    transform-origin: bottom right;
    width:50px;
    height:50px;
    top:0;
    left:0px;

}

.tag.turnOn {
    animation-name: indicateOn;
    animation-duration: .25s;
    animation-fill-mode:forwards;

}
.tag.turnOff{
    animation-name: indicateOff;
    animation-duration: .25s;
    animation-fill-mode:forwards;
}

@keyframes indicateOn {
    from {
        transform:translate(-170px,0px);
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}
@keyframes indicateOff {
    from {
        opacity: 1;

    }
    to {
        transform:translate(-170px,0px);
        opacity: 0;
    }
}


.blocRect{
    outline-style: solid;
    outline-width: 6px;
    border-radius: 20px;
}
/* .pinkOutline{
    outline-color: rgb(255, 41, 216);
}
.blueOutline{
    outline-color: rgb(0, 99, 165);
} */
.blocRect.turnOn {
    animation-name: outlineSelect;
    animation-duration: .25s;
    animation-fill-mode:forwards;
}
.blocRect.turnedOn {
    outline-offset: 0px;
}
.blocRect.turnOff{
    animation-name: outlineUnselect;
    animation-duration: .25s;
    animation-fill-mode:forwards;
}
.blocRect.turnedOff{
    outline:none;
}

@keyframes outlineSelect {
    from {
        outline-offset: 20px;
        outline-color: rgba(0,0,0,0);
    }
    to {
        outline-offset: 0px;
    }
}
@keyframes outlineUnselect {
    to {
        outline-offset: 20px;
        outline-color: rgba(0,0,0,0);
    }
    from {
        outline-offset: 0px;
    }
}



`




usersCache = {}

async function getUserInfo(username) {
    if(!username) {return}
    if(username?.toLowerCase() in usersCache && usersCache[username?.toLowerCase()]?.pk) {return usersCache[username?.toLowerCase()]}

    let res
    try{ 
        res=await (await fetch('https://scratch.mit.edu/site-api/users/all/' + username?.toLowerCase())).json()
    } catch(e) {
        return null
    }
    if(!res) {
        return null
    }

    let user = res.user
    user = getWithPic(user)
    usersCache[user.username.toLowerCase()] = user
    return user
}
function getWithPic(user) {
    user.pic = `https://cdn2.scratch.mit.edu/get_image/user/${user.pk}_60x60.png`
    return user
}


async function addCollaboratorGUI (user,omitX){
    if(user.username.toLowerCase() in shareDivs) {return}
    if(!user) {return}

    let newCollab = blModalExample.cloneNode(-1)
    // console.log(newCollab)
    newCollab.style.display = 'flex'
    Array.from(newCollab.children).find(elem=>elem.localName =='name').innerHTML = user.username;
    let x = Array.from(newCollab.children).find(elem=>elem.localName =='x')
    if(omitX === true) {
        x.remove()
    } else {
        x.username = user.username;
    }
    Array.from(newCollab.children).find(elem=>elem.localName =='pic').style.backgroundImage = `url('${user.pic}')`  
    shareDivs[user.username.toLowerCase()] = newCollab
    blModalExample.parentNode.append(newCollab);

    resultt.style.visibility = 'hidden'
    earch.value = ''
    earch.oninput();
}

async function removeCollaboratorGUI (username) {
    if(!(username.toLowerCase() in shareDivs)) {return}
    shareDivs[username.toLowerCase()].remove()
    delete shareDivs[username.toLowerCase()]
}

function removeAllCollaboratorsGUI() {
    Object.values(shareDivs).forEach(div=>div.remove())
    shareDivs = {}
}

async function addCollaborator(username) {
    if(username.toLowerCase() in shareDivs) {return}
    let user = await getUserInfo(username)
    if(!user) {return}
    addCollaboratorGUI(user)
    chrome.runtime.sendMessage(exId,{meta:"shareWith",'username':user.username,id:blId,pk:user.pk})
}

function removeCollaborator(user) {
    removeCollaboratorGUI(user)
    chrome.runtime.sendMessage(exId,{meta:"unshareWith",user,id:blId})
}

function refreshShareModal() {
    if(!blId) {return}
    return new Promise(promRes=>{chrome.runtime.sendMessage(exId,{meta:'getShared',id:blId},async (res)=>{
        removeAllCollaboratorsGUI()
        for (boi of res) {if(!boi.pk) {console.log('oi!',boi);boi.pk = (await getUserInfo(boi.username)).pk};console.log(boi)}
        res.forEach(getWithPic)
        addCollaboratorGUI(res.shift(),true)
        res.forEach(addCollaboratorGUI)
        promRes()
    })})
}

function makeBlockliveButton() {
    let button = document.createElement('blocklive-init')
    button.className = 'button_outlined-button_1bS__ menu-bar_menu-bar-button_3IDN0'
    button.style.marginRight = '20px'
    button.style.paddingLeft = '7px'
    button.style.paddingRight = '7px'
    button.style.gap = '7px'
    // button.style.background = ' linear-gradient(90deg, rgba(51,0,54,1) 0%, rgba(255,0,113,1) 60%)'
    button.style.background = 'rgba(255,0,113,1)' // blocklive pink
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

let yeet = '⚠️'


function injectJSandCSS() {

    let dropdownScriptElem = document.createElement('script')
    dropdownScriptElem.innerHTML = shareScript
    document.head.appendChild(dropdownScriptElem)

    let styleInj = document.createElement('style')
    styleInj.innerHTML = shareCSS
    document.head.appendChild(styleInj)
}

let blActivateClick = async ()=>{
    // change onclick
    blockliveButton.onclick = undefined
    // set spinny icon
    document.querySelector('loader.blockliveloader').style.display = 'flex'

    // save project in scratch
    store.dispatch({type: "scratch-gui/project-state/START_MANUAL_UPDATING"})

    await waitFor(()=>(!isNaN(parseFloat(location.pathname.split('/')[2]))))
    scratchId = location.pathname.split('/')[2]

    let json = vm.toJSON()

    chrome.runtime.sendMessage(exId,{json,meta:'create',scratchId,title:store.getState().preview.projectInfo.title},async (response)=>{
        blId = response.id 

        // ACTIVATE BLOKLIVE!!!
        projectReplaceInitiated = true;
        pauseEventHandling = false
        liveMessage({meta:"myId",id:blId})
        activateBlocklive()
        // JOIN BLOCKLIVE SESSION!!!!
        liveMessage({meta:"joinSession"})
        readyToRecieveChanges = true
        await refreshShareModal()
        // stop spinny
        document.querySelector('loader.blockliveloader').style.display = 'none'

        // Set button onclick
        blockliveButton.onclick = blShareClick
        reloadOnlineUsers()

        blShareClick()
    })
}
let blShareClick = ()=>{console.log('clicked'); blDropdown.style.display = (blDropdown.style.display == 'none' ? 'flex' : 'none'); refreshShareModal() }

console.log('listening for share button')
blockliveButton = null
blDropdown = null

function doIOwnThis() {
    return store.getState().session.session.user.id == store.getState().preview.projectInfo.author.id;
}
function addButtonInjectors() {
listenForObj('#app > div > div.gui_menu-bar-position_3U1T0.menu-bar_menu-bar_JcuHF.box_box_2jjDp > div.menu-bar_main-menu_3wjWH > div:nth-child(7) > span',
    (bc)=>{
        // bc.children[1].children[0].innerHTML = "Become Blajingus"

        let container = document.createElement('blockliveContainer')
        container.style.display = 'flex'
        container.style.flexDirection = 'column'

        if(!doIOwnThis()) {return} // if 
        let button = makeBlockliveButton()
        blockliveButton = button
        let dropdown = document.createElement('blockliveDropdown')
        dropdown.innerHTML = shareDropdown
        dropdown.style.position = 'absolute'
        dropdown.style.top = '40px'
        dropdown.style.borderRadius = '17px'
        dropdown.style.boxShadow = '3px 7px 19px 3px rgba(0,0,0,0.48)'
        dropdown.style.display = 'none'
        blDropdown = dropdown

        button.onclick = ()=>{
            if(blId) {
                // if already is shared
                return blShareClick()
            } else {
                // if is regular scratch project
                return blActivateClick()
            }
        }
        document.addEventListener('click', (e)=>{if(e.target.nodeName != 'X' &&!dropdown.contains(e.target) && !button.contains(e.target)){dropdown.style.display = 'none'}})

        container.appendChild(button)
        container.appendChild(dropdown)
        bc.parentNode.parentNode.insertBefore(container,bc.parentNode)

        injectJSandCSS()

        refreshShareModal()
    }
)

//// Inject active users display
listenForObj("#app > div > div.gui_menu-bar-position_3U1T0.menu-bar_menu-bar_JcuHF.box_box_2jjDp > div.menu-bar_account-info-group_MeJZP",(accountInfo)=>{
   
    let topBar = accountInfo.parentElement;

    let panel = document.createElement('div')
    panel.id = 'blUsersPanel'
    panel.style = "display: flex; jusify-content:center; align-items: center; gap: 3px; max-width: 300px; overflow: auto;"
    topBar.insertBefore(panel,accountInfo)

    let activeText = document.createElement('div')
    activeText.innerHTML = 'online:'
    activeText.style.color = '#104691'
    activeText.style.background = 'lightblue'
    activeText.style.padding = '2px'
    activeText.style.borderRadius= '3px'
    activeText.style.alignSelf= 'center'

    activeText.style.marginRight = '10px'
    panel.appendChild(activeText)

    if(!blId) {document.getElementById('blUsersPanel').style.visibility = 'hidden'}
    else {document.getElementById('blUsersPanel').style.visibility = 'visible'}
    reloadOnlineUsers();
})
}

let COLORS = ['teal','#c42b63']
let COLORS_BRIGHT = ['#00b9d1','#ff00e6']
let yo_1 = Math.round(Math.random());

function clearActive() {
    if(!document.getElementById('blUsersPanel')) {return}
    document.getElementById('blUsersPanel').innerHTML = ''

    let activeText = document.createElement('div')
    activeText.innerHTML = 'online:'
    activeText.style.color = '#104691'
    activeText.style.background = 'lightblue'
    activeText.style.padding = '2px'
    activeText.style.borderRadius= '3px'
    activeText.style.alignSelf= 'center'

    activeText.style.marginRight = '10px'
    document.getElementById('blUsersPanel').appendChild(activeText)
}

async function displayActive(users) {
    if(!document.getElementById('blUsersPanel')) {return}
    if(!blId) {document.getElementById('blUsersPanel').style.visibility = 'hidden'}
    else {document.getElementById('blUsersPanel').style.visibility = 'visible'}

    let yo = yo_1
    let panel = document.getElementById('blUsersPanel')
    if(!panel) {return}
    for(let i = 0; i<users.length; i++) {

        let container = document.createElement('divv')
        container.onclick = ()=>{
            let u = users[i]

            let editingTargetId = BL_UTILS.nameToTarget(u.cursor.targetName).id
            if(u.cursor.targetName) {
                vm.setEditingTarget(editingTargetId)
            }

            let workspace = BL_UTILS.getWorkspace()
            if(u.cursor.scale && u.cursor.scrollX && u.cursor.scrollY) {
            if(!BL_UTILS.getWorkspace().startDragMetrics) {
                BL_UTILS.getWorkspace().startDragMetrics = BL_UTILS.getWorkspace().scrollbar.oldHostMetrics_
            }
            workspace.setScale(u.cursor.scale);
            workspace.scroll(u.cursor.scrollX,u.cursor.scrollY);}
        }

        // setInterval(()=>{
        // console.log('getBlockDragSurface',Blockly.getMainWorkspace().getBlockDragSurface(),
        //     'isDragging',Blockly.getMainWorkspace().isDragging()
        // )},500)


        panel.style = "display: flex; justify-content: center; align-items: center;"
        container.style.height = "70%"


        let user = document.createElement('img')
        if(!users[i].pk) {
            user.src = (await getUserInfo(users[i].username)).pic
        } else {
            user.src = `https://cdn2.scratch.mit.edu/get_image/user/${users[i].pk}_60x60.png`
        }
        user.style.borderRadius = '10px'
        // user.style.height = '100%'
        user.style.width = '33.59px'
        user.style.height = '33.59px'

        user.style.objectFit = 'cover'
        yo++;
        yo = yo%COLORS.length
        user.style.outline = '3px solid ' + COLORS[yo]
        // user.style.outline = '3px solid ' + COLORS[Math.floor(Math.random()*COLORS.length)]
        user.className = 'blActiveUser'

        let tooltip = document.createElement('div');
        tooltip.innerHTML = users[i].username
        tooltip.style.backgroundColor = COLORS_BRIGHT[yo]
        tooltip.className = 'blActiveName'
        container.appendChild(user)
        container.appendChild(tooltip)
        panel.appendChild(container)
    }
}


function reloadOnlineUsers() {
    chrome.runtime.sendMessage(exId,{meta:'getActive',id:blId},(res)=>{
        blCursors = res
        clearActive()
        displayActive(res)
    })
}

setInterval(reloadOnlineUsers,2500)
setTimeout(reloadOnlineUsers,500)