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
let sessionManager = new SessionManager()
let userManager = new UserManager()
// let id = sessionManager.newProject('tester124','644532638').id
// sessionManager.linkProject(id,'602888445','ilhp10',5)
// userManager.befriend('ilhp10','tester124')
// userManager.befriend('tester124','ilhp10')
// console.log(JSON.stringify(sessionManager))

let messageHandlers = {
     'joinSession':(data,client)=>{
          sessionManager.join(client,data.id,data.username)
     },'joinSessions':(data,client)=>{
          data.ids.forEach(id=>{sessionManager.join(client,id,data.username)})
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

app.get('/share/:id',(req,res)=>{
     let project = sessionManager.getProject(req.params.id)
     let list = project?.sharedWith
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