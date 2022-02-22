import express from 'express'
const app = express();
import cors from 'cors'
app.use(cors())
import http from 'http'
const server = http.createServer(app);
import {Server} from 'socket.io'
const io = new Server(server, {cors:{origin:'*'}});

import SessionManager from './sessionManager.js'
import UserManager from './userManager.js'
let sessionManager = new SessionManager()
let userManager = new UserManager()
let id = sessionManager.newProject('tester124','644532638').id
// sessionManager.linkProject(id,'602888445','ilhp10',5)

let messageHandlers = {
     'joinSession':(data,client)=>{
          sessionManager.join(client,data.id,data.username)
     },
     'leaveSession':(data,client)=>{
          sessionManager.leave(client,data.id)
     },
     'shareWith':(data,client)=>{
          sessionManager.shareProject(data.id,data.user)
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
          res.send(project.project.getChangesSinceVersion(req.params.version))
     }
})
app.put('/linkScratch/:scratchId/:blId',(req,res)=>{
     sessionManager.linkProject(req.params.blId,req.params.scratchId,req.body.username,0)
})
app.get('/projectInpoint/:blId',(req,res)=>{
     let project = sessionManager.getProject(req.params.blId)
     if(!project) {
          // res.status(404)
          res.send({err:'project with id' +req.params.blId+'does not exist'})
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
          let ownedProject = project.getOwnersProject(req.username)
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

app.get('/',(req,res)=>{
     res.send('wow youre a hacker wow')
})

app.post('/friends/:user',(req,res)=>{
     console.log(req.body)
     userManager.befriend(req.params.user,req.body.friend)
})
app.delete('/friends/:user',(req,res)=>{
     console.log(req.body)
     userManager.unbefriend(req.params.user,req.body.friend)
})
app.get('/friends/:user',(req,res)=>{
     res.send(userManager.getUser(req.params.user)?.friends)
})

app.get('/userProjects/:user',(req,res)=>{
     res,send(userManager.getShared(req.params.user))
})

app.get('/share/:id',(req,res)=>{
     let list = sessionManager.getProject(req.params.id)?.sharedWith
     res.send(list ? list : {err:'could not find blocklive project: ' + req.params.id} )
})
app.put('/share/:id/:to',(req,res)=>{
     sessionManager.shareProject(req.params.id, req.params.to)
     userManager.share(req.params.to, req.params.id, req.body.from)
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