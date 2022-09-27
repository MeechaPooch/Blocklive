// be mindful of:
// numbers being passed as strings

import express from 'express'
const app = express();
import cors from 'cors'
app.use(cors())
import http from 'http'
const server = http.createServer(app);
import {Server} from 'socket.io'
const io = new Server(server, {
     cors:{origin:'*'},
     maxHttpBufferSize:2e7 // scrtch asset size limit
});

import SessionManager from './sessionManager.js'
import UserManager from './userManager.js'
import fs from 'fs'
import { ppid } from 'process';
import path from 'path';
import sanitize from 'sanitize-filename';
// Load session and user manager objects


/// LOAD SESSION MANAGER
// todo: build single recursive directory to object parsing function
let sessionsObj = {}
sessionsObj.blocklive = loadMapFromFolder('storage/sessions/blocklive');
sessionsObj.scratchprojects = loadMapFromFolder('storage/sessions/scratchprojects');
sessionsObj.lastId = fs.existsSync('storage/sessions/lastId') ? parseInt(fs.readFileSync('storage/sessions/lastId').toString()) : 0
console.log(sessionsObj.lastId)

sessionsObj = JSON.parse(fs.readFileSync('storage/sessions.json'))

var sessionManager = SessionManager.fromJSON(sessionsObj)
Object.values(sessionManager.blocklive).forEach(project=>project.project.trimChanges())

/// LOAD USER MANAGER
// var userManager = UserManager.fromJSON({users:loadMapFromFolder('storage/users')})
var userManager = UserManager.fromJSON({users:JSON.parse(fs.readFileSync('storage/users.json'))})

// let id = sessionManager.newProject('tester124','644532638').id
// sessionManager.linkProject(id,'602888445','ilhp10',5)
// userManager.befriend('ilhp10','tester124')
// userManager.befriend('tester124','ilhp10')
// console.log(JSON.stringify(sessionManager))

function sleep(millis) {
     return new Promise(res=>setTimeout(res,millis))
}
if(!fs.existsSync('storage')) {
     fs.mkdirSync('storage')
}

function saveMapToFolder(obj, dir) {
     // if obj is null, return
     if(!obj) {console.warn('tried to save null object to dir: ' + dir); return}
     // make directory if it doesnt exist
     if (!fs.existsSync(dir)){fs.mkdirSync(dir,{recursive:true})}
     let promises = []
     Object.entries(obj).forEach(entry=>{
          entry[0] = sanitize(entry[0])
          promises.push(
               new Promise(res=>fs.writeFile(dir+path.sep+entry[0],JSON.stringify(entry[1]),null,res))
          )
     })
     return Promise.all(promises)
}
function loadMapFromFolder(dir) {
     let obj = {}
     // check that directory exists, otherwise return empty obj
     if(!fs.existsSync('dir')) {return obj}
     // add promises
     fs.readdirSync(dir,{withFileTypes:true})
          .filter(dirent=>dirent.isFile())
          .map(dirent=>([dirent.name,fs.readFileSync(dir + path.sep + dirent.name)]))
          .forEach(entry=>{
               obj[entry[0]] = JSON.parse(entry[1]) // parse file to object
     })
     console.log(obj)
     return obj
}
function save() {
     return Promise.all([
          // new Promise(res=>fs.writeFile('storage/sessions.json',JSON.stringify(sessionManager),null,res)),
          // new Promise(res=>fs.writeFile('storage/users.json',JSON.stringify(userManager),null,res))
          saveMapToFolder(sessionManager.blocklive,'storage/sessions/blocklive'),
          saveMapToFolder(sessionManager.scratchprojects,'storage/sessions/scratchprojects'),
          new Promise(res=>fs.writeFile('storage/sessions/lastId',(sessionManager.lastId).toString(),null,res)),
          saveMapToFolder(userManager.users,'storage/users')
     ])
}
saveMapToFolder(sessionManager.blocklive,'storage/sessions/blocklive')

async function saveLoop() {
     while(true) {
          await save();
          await sleep(10000)
     }
}
saveLoop()


let messageHandlers = {
     'joinSession':(data,client)=>{
          sessionManager.join(client,data.id,data.username)
          if(data.pk) { userManager.getUser(data.username).pk = data.pk }
     },'joinSessions':(data,client)=>{
          data.ids.forEach(id=>{sessionManager.join(client,id,data.username)})
          if(data.pk) { userManager.getUser(data.username).pk = data.pk }
     },
     'leaveSession':(data,client)=>{
          sessionManager.leave(client,data.id)
     },
     'shareWith':(data,client)=>{
          sessionManager.shareProject(data.id,data.user,data.pk)
     },
     'projectChange':(data,client,callback)=>{
          sessionManager.projectChange(data.blId,data,client)
          callback(sessionManager.getVersion(data.blId))
     },
     'getChanges':(data,client)=>{
          let project = sessionManager.getProject(data.id)
          if(!project) {return}
          let changes = project?.project.getChangesSinceVersion(data.version)
          client.send({type:'projectChanges',changes,projectId:data.id,currentVersion:project.project.version})
     },
     'setTitle':(data,client)=>{
          let project = sessionManager.getProject(data.blId)
          if(!project) {return}
          project.project.title = data.msg.title
          project.session.sendChangeFrom(client,data.msg,true)
     }
}

let sendMessages = ['blProjectInfo','projectChange','loadFromId','projectChanges']

io.on('connection', (client) => {
     client.on("message",(data,callback)=>{
          console.log('message recieved',data,'from: ' + client.id)
          if(data.type in messageHandlers) {
               messageHandlers[data.type](data,client,callback)
          } else {console.log('discarded unknown mesage type: ' + data.type)}
     })

     client.on('disconnect',(reason)=>{
          sessionManager.disconnectSocket(client)
     })
});

app.get('/newProject/:scratchId/:owner',(req,res)=>{
     let project = sessionManager.getScratchToBLProject(req.params.scratchId)
     if(!project) {
          console.log('creating new project from scratch project: ' + req.params.scratchId + " by " + req.params.owner + ' titled: ' + req.query.title)
          project = sessionManager.newProject(req.params.owner,req.params.scratchId,req.query.title)
          userManager.newProject(req.params.owner,project.id)
     }
     res.send({id:project.id})
})

app.get('/blId/:scratchId',(req,res)=>{
     res.send(sessionManager.scratchprojects[req.params.scratchId]?.blId)
})
app.get('/scratchIdInfo/:scratchId',(req,res)=>{
     if (req.params.scratchId in sessionManager.scratchprojects) {
          res.send(sessionManager.scratchprojects[req.params.scratchId])
     } else {
          res.send({err:('could not find blocklive project associated with scratch project id: ' + req.params.scratchId)})
     }
})
// todo: sync info and credits with this endpoint as well?
app.get('/projectTitle/:id',(req,res)=>{
     let project = sessionManager.getProject(req.params.id)
     if(!project) {
          res.send({err:'could not find project with blocklive id: ' + req.params.id})
     } else {
          res.send({title:project.project.title})
     }
})
app.post('/projectSaved/:scratchId/:version',(req,res)=>{
     console.log('saving project, scratchId: ',req.params.scratchId, ' version: ',req.params.version)
     let project = sessionManager.getScratchToBLProject(req.params.scratchId)
     if(!project) {console.log('could not find project!!!');
     res.send('not as awesome awesome :)')
     return;
}
     project.scratchSaved(req.params.scratchId,parseFloat(req.params.version))
     res.send('awesome :)')
})
app.get('/whereTo/:username/:scratchId',(req,res)=>{
     if (req.params.scratchId in sessionManager.scratchprojects) {
          let project = sessionManager.getScratchToBLProject(res.params.scratchId)
          let possibleProject = project.getOwnersProject(req.params.username)
          if(possibleProject) {
               res.send({scratchId:possibleProject.scratchId, blId:project.id, owner:possibleProject.owner})
          } else {
               res.send(sessionManager.scratchprojects[req.params.scratchId])
          }

     } else {
          res.send({err:('could not find blocklive project associated with scratch project id: ' + req.params.scratchId)})
     }
})
app.get('/changesSince/:id/:version',(req,res)=>{
     let project = sessionManager.getProject(req.params.id)
     if(!project) {res.send([])}
     else {
          res.send(project.project.getChangesSinceVersion(parseFloat(req.params.version)))
     }
})
app.put('/linkScratch/:scratchId/:blId/:owner',(req,res)=>{
     console.log('linking:',req.params)
     sessionManager.linkProject(req.params.blId,req.params.scratchId,req.params.owner,0)
     res.send('cool :)')
})
app.get('/projectInpoint/:blId',(req,res)=>{
     let project = sessionManager.getProject(req.params.blId)
     if(!project) {
          // res.status(404)
          res.send({err:'project with id: ' +req.params.blId+' does not exist'})
     }
     else {
          let scratchId = project.scratchId
          // let changes = project.project.getChangesSinceVersion(project.scratchVersion)
          res.send({scratchId,scratchVersion:project.scratchVersion})
     }
})
app.get('/userRedirect/:scratchId/:username',(req,res)=>{
     let project = sessionManager.getScratchToBLProject(req.params.scratchId)
     if(!project) {res.send({goto:'none'})}
     else {
          let ownedProject = project.getOwnersProject(req.params.username)
          if(!!ownedProject) {
               res.send({goto:ownedProject.scratchId})
          } else {
               res.send({goto:'new', blId:project.id})
          }
     }
})
app.get('/projectInpoint',(req,res)=>{
     res.send({err:"no project id specified"})
})

app.get('/active/:blId',(req,res)=>{
     let usernames = sessionManager.getProject(req.params.blId)?.session.getConnectedUsernames()
     if(usernames) {
          res.send(usernames.map(name=>{
               let user = userManager.getUser(name)
               return {username:user.username,pk:user.pk}
          }))
     } else {
          res.send({err:'could not get users for project with id: ' + req.params.blId})
     }
})

app.get('/',(req,res)=>{
     res.send('wow youre a hacker wow')
})

app.post('/friends/:user/:friend',(req,res)=>{

     userManager.befriend(req.params.user,req.params.friend)
     res.send('awwww :)')
})
app.delete('/friends/:user/:friend',(req,res)=>{
     userManager.unbefriend(req.params.user,req.params.friend)
     res.send('sadge moment :<(')

})
app.get('/friends/:user',(req,res)=>{
     res.send(userManager.getUser(req.params.user)?.friends)
})

// get list of blocklive id's shared with user
app.get('/userProjects/:user',(req,res)=>{
     res,send(userManager.getShared(req.params.user))
})
// get list of scratch project info shared with user for displaying in mystuff
app.get('/userProjectsScratch/:user',(req,res)=>{
     let blockliveIds = userManager.getAllProjects(req.params.user)
     let projectsList = blockliveIds.map(id=>{
          let projectObj = {}
          let project = sessionManager.getProject(id)
          if(!project) {return null}
          projectObj.scratchId = project.getOwnersProject(req.params.user)?.scratchId
          if(!projectObj.scratchId) {projectObj.scratchId = project.scratchId}
          projectObj.title = project.project.title
          projectObj.lastTime = project.project.lastTime
          projectObj.lastUser = project.project.lastUser

          return projectObj
     })
     res.send(projectsList)
})

app.put('/leaveScratchId/:scratchId/:username',(req,res)=>{
     let project = sessionManager.getScratchToBLProject(req.params.scratchId)
     sessionManager.unshareProject(project.id, req.params.username)
     userManager.unShare(req.params.username, project.id)
     res.send('uncool beans!!!! /|/|/|')
})

app.get('/share/:id',(req,res)=>{
     let project = sessionManager.getProject(req.params.id)
     let list = project?.sharedWith
     if(!list) {res.send('yeet yeet'); return;}
     list = list.map(name=>({username:name,pk:userManager.getUser(name).pk})) // Add user ids for profile pics
     res.send(list ? [{username:project.owner,pk:userManager.getUser(project.owner).pk}].concat(list) : {err:'could not find blocklive project: ' + req.params.id} )
})
app.put('/share/:id/:to/:from',(req,res)=>{
     if(sessionManager.getProject(req.params.id)?.owner == req.params.to) {
          res.send('i lost all mah beans!!!!')
          return
     }
     sessionManager.shareProject(req.params.id, req.params.to, req.query.pk)
     userManager.getUser(req.params.to).pk = req.query.pk
     userManager.share(req.params.to, req.params.id, req.params.from)
     res.send('cool beans ()()()')
})
app.put('/unshare/:id/:to/',(req,res)=>{
     if(sessionManager.getProject(req.params.id)?.owner == req.params.to) {
          res.send('you stole me beanz didnt u!!!?!?!?!?')
          return
     }
     sessionManager.unshareProject(req.params.id, req.params.to)
     userManager.unShare(req.params.to, req.params.id)
     res.send('uncool beans!!!! /|/|/|')
})


const port = 4000
server.listen(port,'0.0.0.0');
console.log('listening on port ' + port)

// initial handshake:
// client says hi, sends username & creds, sends project id 
// server generates id, sends id
// server sends JSON or scratchId
// client loads, sends when isReady
// connection success!! commense the chitter chatter!