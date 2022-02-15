importScripts('background/socket.io.js')
importScripts('background/blockliveProject.js')

// user info
let username = 'ilhp10'

// let apiUrl = 'http://127.0.0.1:4000'
let apiUrl = 'http://152.67.248.129:4000'

////////// ACTIVE PROJECTS DATABASE //////////
// blId -> [ports...]
let blockliveTabs = {}
// blId -> BlockliveProject
let projects = {}
// portName -> blId
let portIds = {}

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
socket.on('connect',()=>{
  console.log('connected with id: ',socket.id)
})
socket.on('disconnect',()=>{

})
socket.on('message',(data)=>{
  console.log('message',data)
  if(data.type=='projectChange') {
    projects[data.blId]?.setVersion(data.version -1)
    data.msg.version = data.version
    playChange(data.blId,data.msg)
 } else if(data.type=='yourVersion') {
    projects[data.blId]?.setVersion(data.version)
 }
})


let uname = '*'
// async function getUsername() {
//   chrome.storage.local.get(['username'])
// }
async function refreshUsername() {
  res = await fetch("https://scratch.mit.edu/session/?blreferer", {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
    });
let username = (await res.json()).user.username

// chrome.storage.local.set({username})
uname = username
return username
}

let newProjects = {}

// Listen for See Inside
let projectsPageTester = new RegExp('https://scratch.mit.edu/projects/*.')
chrome.tabs.onUpdated.addListener(async function
  (tabId, changeInfo, tab) {
    return; // TODO: REMOVE
    if(tab.id in newProjects) {} 
  else if (changeInfo.url) {
    // if url is scratch page
    console.log('page url changed to:', changeInfo.url)
    if(projectsPageTester.test(changeInfo.url)) {
      console.log('url is a scratch project')

      // if scratch project is also registered in blocklive
      let url = new URL(changeInfo.url)
      let scratchId = url.pathname.split('/')[2]
      console.log(scratchId)
      let projectInfo = (await (await fetch(`${apiUrl}/scratchIdInfo/${scratchId}`)).json())
      if(projectInfo.err) {return}
      console.log('blocklive id:',projectInfo.blId)

      // if user doesnt own project
      await refreshUsername()
      if(uname == projectInfo.owner) {return}

      // open new project page
      newProjects[tab.id] = projectInfo.blId
      chrome.tabs.update(tab.id,{url:'https://scratch.mit.edu/create'})
    }
  }
}
);

let lastPortId = 0

let ports = []
// Connections to scratch editor instances
chrome.runtime.onConnectExternal.addListener(function(port) {
  port.name = ++lastPortId
  ports.push(port)
  // console.assert(port.name === "knockknock");
  port.onMessage.addListener(function(msg) {
    console.log(msg)
    if(msg.meta=="blockly.event" || msg.meta=="sprite.proxy"||msg.meta=="vm.blockListen"||msg.meta=="vm.shareBlocks" ||msg.meta=="vm.replaceBlocks") {
      let blIdd = portIds[port.name]
      
      playChange(blIdd,msg,port)

      // send to websocket
      socket.send({type:'projectChange',msg,blId:blIdd},(res)=>{
        port.postMessage({meta:'yourVersion',version:res})
      })
    } else if (msg.meta=='myId') {
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
      socket.send({type:"joinSession",id:portIds[port.name],username:'ilhp10'}) // todo: replace username
    }

  });
  port.onDisconnect.addListener((p)=>{
    ports.splice(ports.indexOf(p),1);
    let blockliveId = portIds[p.name]
    let list = blockliveTabs[blockliveId]
    blockliveTabs[blockliveId].splice(list.indexOf(p),1);
    delete portIds[p.name]
    if(blockliveTabs[blockliveId].length == 0) {socket.send({type:'leaveSession',id:blockliveId})}
  })
});


// Proxy project update messages
chrome.runtime.onMessageExternal.addListener(
  async function (request, sender, sendResponse) {
    console.log("external message:", request);
    if(request.meta == 'getBlId') {
      if(!request.scratchId || request.scratchId == '.') {return ''}
      sendResponse((await (await fetch(`${apiUrl}/blId/${request.scratchId}`)).text()).replaceAll('"',''))
    } else if(request.meta =='imnew'){
      if(sender.tab.id in newProjects) {sendResponse(newProjects[sender.tab.id])}
    } else if(request.meta =='getInpoint') {
      sendResponse(await (await fetch(`${apiUrl}/projectInpoint/${request.blId}`)).json())
    } else if(request.meta =='getChanges') {
      sendResponse(await (await fetch(`${apiUrl}/changesSince/${request.blId}/${request.version}`)).json())
    } else if(request.meta == 'shareWith') {
      fetch(`${apiUrl}/share/${request.id}/${request.user}`,{method:'PUT',body:{from:username}})
    }
  });

  