import express from 'express'
const app = express();
import cors from 'cors'
app.use(cors())
import http from 'http'
const server = http.createServer(app);
import {Server} from 'socket.io'
const io = new Server(server, {cors:"*"});

import SessionManager from './sessionManager.js'
let sessionManager = new SessionManager()
let id = sessionManager.newProject('ilhp10','602888445').id
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
     'projectChange':(data,client)=>{sessionManager.projectChange(data.blId,data,client)},
     'getChanges':(data,client)=>{
          let project = sessionManager.getProject(data.id)
          if(!project) {return}
          let changes = project?.project.getChangesSinceVersion(data.version)
          client.send({type:'projectChanges',changes,projectId:data.id,currentVersion:project.project.version})
     }
}

let sendMessages = ['blProjectInfo','projectChange','loadFromId','projectChanges']

io.on('connection', (client) => {
     client.on("message",(data)=>{
          if(data.type in messageHandlers) {
               messageHandlers[data.type](data,client)
          } else {console.log('discarded unknown mesage type: ' + data.type)}
     })

     client.on('disconnect',(reason)=>{
          sessionManager
     })
});
io.on('message',(client)=>{

})

app.get('/blId/:scratchId',(req,res)=>{
     res.send(sessionManager.scratchprojects[req.params.scratchId])
})
app.get('/changesSince/:id/:version',(req,res)=>{
     let project = sessionManager.getProject(req.params.id)
     if(!project) {res.send([])}
     else {
          res.send(project.project.getChangesSinceVersion(req.params.version))
     }
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
app.get('/projectInpoint',(req,res)=>{
     res.send({err:"no project id specified"})
})

app.get('/',(req,res)=>{
     res.send('')
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