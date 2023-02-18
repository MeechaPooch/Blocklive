// be mindful of:
// numbers being passed as strings


///////////
import express from 'express'
const app = express();
import cors from 'cors'
app.use(cors({origin:'*'}))
app.use(express.json({ limit: '5MB' }))
////////////
// import http from 'http'
// const server = http.createServer(app);
////////////
// copied from https://stackoverflow.com/questions/11804202/how-do-i-setup-a-ssl-certificate-for-an-express-js-server
import os from 'os'
import path from 'path';
let homedir = '/home/opc'
let privateKey = fs.readFileSync( homedir + path.sep + 'letsencrypt/live/spore.us.to/privkey.pem' );
let certificate = fs.readFileSync( homedir + path.sep + 'letsencrypt/live/spore.us.to/fullchain.pem' );
import https from 'https'
const server = https.createServer({
     key: privateKey,
     cert: certificate,
},app);
/////////

import {Server} from 'socket.io'
const io = new Server(server, {
     cors:{origin:'*'},
     maxHttpBufferSize:2e10
});

import SessionManager from './sessionManager.js'
import UserManager from './userManager.js'
import fs from 'fs'
import { ppid } from 'process';
import sanitize from 'sanitize-filename';

import { blocklivePath, lastIdPath, loadMapFromFolder, saveMapToFolder, scratchprojectsPath, usersPath} from './filesave.js'
// Load session and user manager objects


/// LOAD SESSION MANAGER
// todo: build single recursive directory to object parsing function
let sessionsObj = {}
// sessionsObj.blocklive = loadMapFromFolder('storage/sessions/blocklive');
sessionsObj.blocklive = {};
sessionsObj.scratchprojects = loadMapFromFolder('storage/sessions/scratchprojects');
sessionsObj.lastId = fs.existsSync('storage/sessions/lastId') ? parseInt(fs.readFileSync('storage/sessions/lastId').toString()) : 0
console.log(sessionsObj)

// sessionsObj = JSON.parse(fs.readFileSync('storage/sessions.json')) // load sessions from file sessions.json

var sessionManager = SessionManager.fromJSON(sessionsObj)
Object.values(sessionManager.blocklive).forEach(project=>project.project.trimChanges())

/// LOAD USER MANAGER
var userManager = UserManager.fromJSON({users:loadMapFromFolder('storage/users')}) // load from users folder
// var userManager = UserManager.fromJSON({users:JSON.parse(fs.readFileSync('storage/users.json'))}) // load from file users.json


// share projects from sessions db in users db
// Object.values(sessionManager.blocklive).forEach(proj=>{
//      let owner = proj.owner;
//      let sharedWith = proj.sharedWith;
//      sharedWith.forEach(person=>{
//           userManager.share(person,proj.id, owner)
//      })
// })


// let id = sessionManager.newProject('tester124','644532638').id
// sessionManager.linkProject(id,'602888445','ilhp10',5)
// userManager.befriend('ilhp10','tester124')
// userManager.befriend('tester124','ilhp10')
// console.log(JSON.stringify(sessionManager))

function sleep(millis) {
     return new Promise(res=>setTimeout(res,millis))
}
function save() {
     saveMapToFolder(sessionManager.blocklive,blocklivePath);
     saveMapToFolder(sessionManager.scratchprojects,scratchprojectsPath);
     fs.writeFileSync(lastIdPath,(sessionManager.lastId).toString());
     saveMapToFolder(userManager.users,usersPath);
}
saveMapToFolder(sessionManager.blocklive,blocklivePath)

async function saveLoop() {
     while(true) {
          try{ await save(); } 
          catch (e) { console.error(e) }
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
     },
     'setCursor':(data,client)=>{
          let project = sessionManager.getProject(data.blId)
          if(!project) {return}
          let cursor = project.session.getClientFromSocket(client)?.cursor
          if(!cursor) {return}
          Object.entries(data.cursor).forEach(e=>{
               if(e[0] in cursor) { cursor[e[0]] = e[1] }
          })
     },
     'chat':(data,client)=>{
          sessionManager.getProject(data.blId)?.onChat(data.msg,client)
     }
}

let sendMessages = ['blProjectInfo','projectChange','loadFromId','projectChanges']

io.on('connection', (client) => {
     client.on("message",(data,callback)=>{
          // console.log('message recieved',data,'from: ' + client.id)
          if(data.type in messageHandlers) {
               messageHandlers[data.type](data,client,callback)
          } else {console.log('discarded unknown mesage type: ' + data.type)}
     })

     client.on('disconnect',(reason)=>{
          sessionManager.disconnectSocket(client)
     })
});

app.post('/newProject/:scratchId/:owner',(req,res)=>{
     console.log('yeetee')
     if(sanitize(req.params.scratchId + '') == '') {res.send({err:'invalid scratch id'}); return}
     let project = sessionManager.getScratchToBLProject(req.params.scratchId)
     let json = req.body;
     if(!project) {
          console.log('creating new project from scratch project: ' + req.params.scratchId + " by " + req.params.owner + ' titled: ' + req.query.title)
          project = sessionManager.newProject(req.params.owner,req.params.scratchId,json,req.query.title)
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
// app.post('/projectSaved/:scratchId/:version',(req,res)=>{
//      console.log('saving project, scratchId: ',req.params.scratchId, ' version: ',req.params.version)
//      let project = sessionManager.getScratchToBLProject(req.params.scratchId)
//      if(!project) {console.log('could not find project!!!');
//      res.send('not as awesome awesome :)')
//      return;
// }
//      project.scratchSaved(req.params.scratchId,parseFloat(req.params.version))
//      res.send('awesome :)')
// })
app.post('/projectSavedJSON/:blId/:version',(req,res)=>{
     let json = req.body;
     console.log('saving project, blId: ',req.params.blId, ' version: ',req.params.version,'json:',json)
     let project = sessionManager.getProject(req.params.blId)
     if(!project) {console.log('could not find project!!!');
          res.send('not as awesome awesome :)')
          return;
     }
     project.scratchSavedJSON(json,parseFloat(req.params.version))
     res.send('awesome :)')
})
app.get('/projectJSON/:blId',(req,res)=>{
     let blId = req.params.blId;
     let project = sessionManager.getProject(blId);
     if(!project) {res.send(404); return;}
     let json = project.projectJson;
     let version = project.jsonVersion
     res.send({json,version});
     return;
})
// app.get('/whereTo/:username/:scratchId',(req,res)=>{
//      if (req.params.scratchId in sessionManager.scratchprojects) {
//           let project = sessionManager.getScratchToBLProject(res.params.scratchId)
//           let possibleProject = project.getOwnersProject(req.params.username)
//           if(possibleProject) {
//                res.send({scratchId:possibleProject.scratchId, blId:project.id, owner:possibleProject.owner})
//           } else {
//                res.send(sessionManager.scratchprojects[req.params.scratchId])
//           }

//      } else {
//           res.send({err:('could not find blocklive project associated with scratch project id: ' + req.params.scratchId)})
//      }
// })
app.get('/changesSince/:id/:version',(req,res)=>{
     let project = sessionManager.getProject(req.params.id)
     if(!project) {res.send([])}
     else {
          res.send(project.project.getChangesSinceVersion(parseFloat(req.params.version)))
     }
})
app.get('/chat/:id/',(req,res)=>{
     let project = sessionManager.getProject(req.params.id)
     if(!project) {res.send([])}
     else {
          res.send(project.getChat())
     }
})
app.put('/linkScratch/:scratchId/:blId/:owner',(req,res)=>{
     console.log('linking:',req.params)
     sessionManager.linkProject(req.params.blId,req.params.scratchId,req.params.owner,0)
     res.send('cool :)')
})
// app.get('/projectInpoint/:blId',(req,res)=>{
//      let project = sessionManager.getProject(req.params.blId)
//      if(!project) {
//           // res.status(404)
//           res.send({err:'project with id: ' +req.params.blId+' does not exist'})
//      }
//      else {
//           let scratchId = project.scratchId
//           // let changes = project.project.getChangesSinceVersion(project.scratchVersion)
//           res.send({scratchId,scratchVersion:project.scratchVersion})
//      }
// })
app.get('/userRedirect/:scratchId/:username',(req,res)=>{
     let project = sessionManager.getScratchToBLProject(req.params.scratchId)
     if(!project) {res.send({goto:'none'})}
     else {
          let ownedProject = project.getOwnersProject(req.params.username)
          if(!!ownedProject) {
               res.send({goto:ownedProject.scratchId})
          } else if(project.isSharedWith(req.params.username) || req.params.username=='ilhp10') {
               res.send({goto:'new', blId:project.id})
          } else {
               res.send({goto:'none',notshared:true})
          }
     }
})
// app.get('/projectInpoint',(req,res)=>{
//      res.send({err:"no project id specified"})
// })

app.get('/active/:blId',(req,res)=>{
     let usernames = sessionManager.getProject(req.params.blId)?.session.getConnectedUsernames()
     let clients = sessionManager.getProject(req.params.blId)?.session.getConnectedUsersClients()
     if(usernames) {
          res.send(usernames.map(name=>{
               let user = userManager.getUser(name)
               return {username:user.username,pk:user.pk,cursor:clients[name].cursor}
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
     res.send(userManager.getShared(req.params.user))
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
     }).filter(Boolean) // filter out non-existant projects // TODO: automatically delete dead pointers like this
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
