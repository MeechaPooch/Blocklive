let apiUrl = 'http://spore.us.to:4000'

chrome.runtime.onInstalled.addListener((details)=>{
  if(details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({url:'https://sites.google.com/catlin.edu/blocklive-quickstart-guide/home'})
  } else if (details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
    chrome.tabs.create({url:'https://sites.google.com/catlin.edu/blocklive-quickstart-guide/new-blocklive-version'})
  }
})


async function backgroundScript() {

importScripts('background/socket.io.js')
importScripts('background/blockliveProject.js')

// user info
// let username = 'ilhp10'

// let apiUrl = 'http://127.0.0.1:4000'

////////// ACTIVE PROJECTS DATABASE //////////
// blId -> [ports...]
let blockliveTabs = {}
// blId -> BlockliveProject
let projects = {}
// portName -> blId
let portIds = {}

let newProjects = {} // tabId (or 'newtab') -> blId
let tabCallbacks = {} // tabId -> callback function

function getProjectId(url) {
  if(projectsPageTester.test(url)) {
    let id = new URL(url).pathname.split('/')[2]
    // dont redirect if is not /projects/id/...
    if(isNaN(parseFloat(id))) {
      return null
    } else {
      return id
    }
  } else {
    return null
  }
}

async function handleNewProject(tab) {
  let id = getProjectId(tab.url)
  if(!!id && tab.id in newProjects) {
    let blId = newProjects[tab.id]
    delete newProjects[tab.id]
    fetch(`${apiUrl}/linkScratch/${id}/${blId}/${uname}`,{
      method:"PUT",
    }) // link scratch project with api
    tabCallbacks[tab.id]({meta:'initBlocklive',blId}); // init blocklive in project tab
  }
}

const newProjectPage = 'https://scratch.mit.edu/create'
async function prepRedirect(tab) {
  if(uname == '*') {return false}
  let id = getProjectId(tab.url)


  // dont redirect if is not /projects/id/...
  if(!id) { return false }
  let info = await (await fetch(apiUrl + `/userRedirect/${id}/${uname}`)).json()
  // dont redirect if scratch id is not associated with bl project
  if(info.goto == 'none') {return false}
  // dont redirect if already on project
  if(info.goto == id) { return false }

  if(info.goto == 'new') {
    //register callbacks and redirect
    newProjects[tab.id] = info.blId //TODO: send this with api
    return newProjectPage
  } else {
    if(tab.url.endsWith('editor') || tab.url.endsWith('editor/')) {
      return `https://scratch.mit.edu/projects/${info.goto}/editor`;
    } else {
      return `https://scratch.mit.edu/projects/${info.goto}`;
    }
  }
}

function playChange(blId,msg,optPort) {
  // record change
  //projects[blId]?.recordChange(msg)

  // send to local clients
  if(!!optPort) {
    blockliveTabs[blId]?.forEach((p=>{try{if(p!=optPort){p.postMessage(msg)}}catch(e){console.error(e)}}))
  } else {
    blockliveTabs[blId]?.forEach(p=>{try{p.postMessage(msg)}catch(e){console.log(e)}})
  }
}

//////// INIT SOCKET CONNECTION ///////
const socket = io.connect(apiUrl,{jsonp:false,transports:['websocket']})
// socket.on("connect_error", () => { socket.io.opts.transports = ["websocket"];});
console.log('connecting')
socket.on('connect',async ()=>{
  console.log('connected with id: ',socket.id)
  ports.forEach(port=>port.postMessage('resync'))
  let blIds = Object.keys(blockliveTabs) 
  if(blIds.length != 0) {socket.send({type:'joinSessions',username:await makeSureUsernameExists(),pk:upk,ids:blIds})}
})
socket.on('disconnect',()=>{
  if(ports.length != 0) {
    socket.connect()
  }
})
socket.on('message',(data)=>{
  console.log('message',data)
  if(data.type=='projectChange') {
    if(data.version){projects[data.blId]?.setVersion(data.version -1)}
    data.msg.version = data.version
    playChange(data.blId,data.msg)
 } else if(data.type=='yourVersion') {
    projects[data.blId]?.setVersion(data.version)
 }
})


let uname = (await chrome.storage.local.get(['uname'])).uname
let upk = (await chrome.storage.local.get(['upk'])).upk
uname = uname ? uname : '*'
upk = upk ? upk : undefined


let lastUnameRefresh = null
async function refreshUsername(force) {
  // if(!force && uname!='*' && Date.now() - lastUnameRefresh < 1000 * 10) {return uname} // limit to refreshing once every 10 seconds
  lastUnameRefresh = Date.now()
  res = await fetch("https://scratch.mit.edu/session/?blreferer", {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
    });
let json = await res.json()
if(!json.user) {return uname;}
uname = json.user.username
upk = json.user.id
chrome.storage.local.set({uname,upk})

return uname
}
async function makeSureUsernameExists() {
  if(uname == '*') {
    return refreshUsername()
  } else {
    return uname
  }
}
refreshUsername()

// Listen for Project load
let projectsPageTester = new RegExp('https://scratch.mit.edu/projects/*.')
chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
  if(changeInfo.url?.startsWith('https://scratch.mit.edu/')) {refreshUsername(true)}
  if(changeInfo.url) {
    await makeSureUsernameExists()
    
    console.log('tab location updated',changeInfo, tab)

    let newUrl = await prepRedirect(tab)
    if(newUrl) {
      console.log('redirecting tab to: ' + newUrl, tab)
      chrome.tabs.update(tab.id,{url:newUrl})
    } else {
      handleNewProject(tab)
    }
  }
}
);

let lastPortId = 0

let ports = []
// Connections to scratch editor instances
chrome.runtime.onConnectExternal.addListener(function(port) {
  if(socket.disconnected) {socket.connect()}

  port.name = ++lastPortId
  ports.push(port)

  let blId = ''
  // console.assert(port.name === "knockknock");
  port.onMessage.addListener(async function(msg) {
    console.log(msg)
    if(msg.meta=="blockly.event" || msg.meta=="sprite.proxy"||msg.meta=="vm.blockListen"||msg.meta=="vm.shareBlocks" ||msg.meta=="vm.replaceBlocks") {
      let blIdd = portIds[port.name]
      
      playChange(blIdd,msg,port)

      // send to websocket
      socket.send({type:'projectChange',msg,blId:blIdd},(res)=>{
        if(!!res) {
          port.postMessage({meta:'yourVersion',version:res})
        }
      })
    } else if (msg.meta=='myId') {
      blId = msg.id
      // record websocket id
      if(!(msg.id in blockliveTabs)) {
        blockliveTabs[msg.id] = [] 
      }
      if(port.name in portIds) {}
      else {
        blockliveTabs[msg.id].push(port)
        portIds[port.name] = msg.id
      }
        
      // create project object
      if(!(msg.id in projects)) {
        projects[msg.id] = new BlockliveProject()
      }
    } else if (msg.meta == 'joinSession') {
      await makeSureUsernameExists()
      socket.send({type:"joinSession",id:portIds[port.name],username:await makeSureUsernameExists(),pk:upk})
    } else if (msg.meta == 'setTitle') {
      playChange(blId,msg,port)
      // send to websocket
      socket.send({type:'setTitle',blId,msg})
    } else {
      msg.blId = blId ?? msg.blId
      socket.send(msg)
    }

  });
  port.onDisconnect.addListener((p)=>{
    ports.splice(ports.indexOf(p),1);
    let blockliveId = portIds[p.name]
    let list = blockliveTabs[blockliveId]
    blockliveTabs[blockliveId].splice(list.indexOf(p),1);
    delete portIds[p.name]
    setTimeout(()=>{
      if(blockliveTabs[blockliveId].length == 0) {socket.send({type:'leaveSession',id:blockliveId})}
      if(ports.length == 0) {socket.disconnect()} // Todo: handle disconnecting and reconnecting backend socket
    },5000); // leave socket stuff if page doesnt reconnect in 5 seconds
  })
});


// Proxy project update messages
chrome.runtime.onMessageExternal.addListener(
  async function (request, sender, sendResponse) {
    console.log("external message:", request);
    if(request.meta == 'getBlId') {
      if(!request.scratchId || request.scratchId == '.') {return ''}
      sendResponse((await (await fetch(`${apiUrl}/blId/${request.scratchId}`)).text()).replaceAll('"',''))
    } else if(request.meta =='getInpoint') {
      sendResponse(await (await fetch(`${apiUrl}/projectInpoint/${request.blId}`)).json())
    } else if(request.meta =='getChanges') {
      sendResponse(await (await fetch(`${apiUrl}/changesSince/${request.blId}/${request.version}`)).json())
    } else if(request.meta == 'getUsername') {
      sendResponse(uname)
    } else if(request.meta == 'callback') {
      tabCallbacks[sender.tab.id] = sendResponse
    } else if(request.meta == 'projectSaved') {
      // {meta:'projectSaved',blId,scratchId,version:blVersion}
      fetch(`${apiUrl}/projectSaved/${request.scratchId}/${request.version}`,{method:'POST'})
    } else if(request.meta == 'myStuff') {
      sendResponse(await(await fetch(`${apiUrl}/userProjectsScratch/${await refreshUsername()}`)).json())
    } else if(request.meta == 'create') {
      sendResponse(await(await fetch(`${apiUrl}/newProject/${request.scratchId}/${await refreshUsername()}?title=${encodeURIComponent(request.title)}`)).json())
    } else if(request.meta == 'shareWith') {
      fetch(`${apiUrl}/share/${request.id}/${request.username}/${uname}?pk=${request.pk}`,{
        method:'PUT'
      })
    } else if(request.meta == 'unshareWith') {
      fetch(`${apiUrl}/unshare/${request.id}/${request.user}`,{
        method:'PUT'
      })
    } else if(request.meta == 'getShared') {
      sendResponse(await(await fetch(`${apiUrl}/share/${request.id}`)).json())
    } else if (request.meta == 'getTitle') {
      sendResponse((await(await fetch(`${apiUrl}/projectTitle/${request.blId}`)).json()).title)
    } else if(request.meta == 'leaveScratchId') {
      fetch(`${apiUrl}/leaveScratchId/${request.scratchId}/${await refreshUsername()}`,{
        method:'PUT'
      })
    } else if(request.meta == 'getActive') {
      sendResponse(await (await fetch(`${apiUrl}/active/${request.id}`)).json())
    }
  });

  
  chrome.runtime.onMessage.addListener(async function(request, sender, sendResponse) {
    if(request.meta == 'getUsername') {
      sendResponse(uname)
    }
  })
}

backgroundScript()