class BlockliveProject {

    static fromJSON(json) {
        let ret = new BlockliveProject(json.title)
        Object.entries(json).forEach(entry=>{
            ret[entry[0]] = entry[1]
        })
        return ret;
    }


    // projectJSON
    // projectJSONVersion = 0
    version = -1
    changes = []
    changeOffset = 0; // TODO!
    lastTime = Date.now();
    lastUser = "";
    title;

    constructor(title) {
        this.title = title
    }

    recordChange(change) {
        this.changes.push(change)
        this.version++;
        this.lastTime = Date.now()
    }

    getChangesSinceVersion(lastVersion) {
        return this.changes.slice(lastVersion)
    }

    trimChanges() {
        for(let i=0; i<this.version-1; i++) {
            this.changes[i] = {r:1}
        }
    }
}

class BlockliveClient {
    isReady = true;
    username
    socket

    constructor(socket, username) {
        this.socket = socket
        this.username = username
    }

    trySendMessage(data) {
        if(this.isReady) {this.socket.send(data)}
    }

    id() {
        return this.socket?.id
    }

}

class BlockliveSess {
    connectedClients = {}
    project
    id

    constructor(project,id) {
        this.project = project
        this.id = id
    }

    addClient(client) {
        this.connectedClients[client.id()] = client
    }
    removeClient(id) {
        delete this.connectedClients[id]
    }

    getClientFromSocket(socket) {
        return this.connectedClients[socket?.id]
    }

    getConnectedUsernames() {
        return [...(new Set(Object.values(this.connectedClients).map(client=>client.username?.toLowerCase())))]
    }

    sendChangeFrom(socket,msg,excludeVersion) {
        Object.values(this.connectedClients).forEach(client=>{
            if(socket.id != client.id()){ 
                console.log('sending message to client: ' + client.id() + " | type: " + msg.type)
                client.trySendMessage({
                type:'projectChange',
                blId:this.id,
                version: excludeVersion ? null : this.project.version,
                msg,
                from:socket.id,
                user:this.getClientFromSocket(socket)?.username
            })}
        })
    }

    onProjectChange(socket, msg) {
        this.project.recordChange(msg)
        this.project.lastUser = this.getClientFromSocket(socket) ? this.getClientFromSocket(socket).username : this.project.lastUser
        this.sendChangeFrom(socket,msg)
    }
}

class ProjectWrapper {

    toJSON() {
        let ret = {
            project:this.project,
            id:this.id,
            scratchId:this.scratchId,
            scratchVersion:this.scratchVersion,
            linkedWith:this.linkedWith,
            owner:this.owner,
            sharedWith:this.sharedWith,
        }
        return ret;
    }

    static fromJSON(json) {
        let ret = new ProjectWrapper('&')
        Object.entries(json).forEach(entry=>{
            if(entry[0] != 'project') {
                ret[entry[0]] = entry[1]
            }
        })
        ret.project = BlockliveProject.fromJSON(json.project)
        ret.session = new BlockliveSess(ret.project,ret.id)
        return ret
    }

    session
    project

    // blocklive id
    id
    // most up to date scratch project id
    scratchId
    // index of next change i think
    scratchVersion = 0
    linkedWith = [] // {scratchId, owner}

    owner
    sharedWith = []

    constructor(owner,scratchId,blId,title) {
        if(owner == '&') {return}
        this.id = blId
        this.owner = owner
        this.scratchId = scratchId
        this.project = new BlockliveProject(title)
        this.session = new BlockliveSess(this.project,this.id)
        this.linkedWith.push({scratchId,owner})
        owner = owner
    }

    scratchSaved(id,version) {
        // dont replace scratch id if current version is already ahead
        if(version <= this.scratchVersion) {console.log('version too low. not recording. most recent version & id:',this.scratchVersion, this.scratchId);return}
        this.scratchId = id
        this.scratchVersion = version
        console.log('linkedWith length', this.linkedWith.length)
        this.linkedWith.find(proj=>proj.scratchId == id).version = version
    }

    linkProject(scratchId, owner, version) {
        this.linkedWith.push({scratchId,owner,version})
    }

    // returns {scratchId, owner}
    getOwnersProject(owner) {
        return this.linkedWith.find(project=>project.owner?.toLowerCase()==owner?.toLowerCase())
    }

    joinSession(socket,username) {
        if(socket.id in this.session.connectedClients) {return}
        let client = new BlockliveClient(socket,username)
        this.session.addClient(client)
        if(!this.project.lastUser) {this.project.lastUser = username}
    }

}

export default class SessionManager{

    toJSON() {
        let ret = {
            scratchprojects:this.scratchprojects, //todo return only changed projects
            blocklive:this.blocklive,
            lastId:this.lastId,
        }
        return ret
        
    }
    static fromJSON(ob) {
        console.log(ob)
        let ret = new SessionManager();
        if(ob.scratchprojects) { ret.scratchprojects = ob.scratchprojects; }
        if(ob.lastId) { ret.lastId = ob.lastId; }
        if(ob.blocklive) { Object.entries(ob.blocklive).forEach(entry=>{
            ret.blocklive[entry[0]] = ProjectWrapper.fromJSON(entry[1]);
        })}
        
        return ret;
    }

    static inst;

    
    // map scratch project id's to info objects {owner, blId}
    scratchprojects = {}
    // id -> ProjectWrapper
    blocklive = {}
    socketMap = {}

    lastId = 0

    constructor() {
        SessionManager.inst = this
    }

    linkProject(id,scratchId,owner,version) {
        let project = this.getProject(id)
        if(!project) {return}
        project.linkProject(scratchId,owner,version)
        this.scratchprojects[scratchId] = {owner,blId:id}
    }

    newProject(owner,scratchId,title) {
        if(scratchId in this.scratchprojects) {return this.getProject(this.scratchprojects[scratchId].blId)}
        let id = new String(this.getNextId())
        let project = new ProjectWrapper(owner,scratchId,id,title)
        this.blocklive[id] = project
        this.scratchprojects[scratchId] = {owner,blId:id}

        return project
    }

    join(socket,id,username,) {
        let project = this.getProject(id)
        if(!project) {return}
        project.joinSession(socket,username)
        if(!(socket.id in this.socketMap)) {
            this.socketMap[socket.id] = {username:username,projects:[]}
        }
        if(this.socketMap[socket.id].projects.indexOf(project.id) == -1){
            this.socketMap[socket.id].projects.push(project.id)
        }
    }
    leave(socket,id,voidMap) {
        let project = this.getProject(id)
        if(!project) {return}
        project.session.removeClient(socket.id)
        if(socket.id in this.socketMap && !voidMap) {
            let array = this.socketMap[socket.id].projects

            const index = array.indexOf(id);
            if (index > -1) {
                array.splice(index, 1);
            }
        }
        if(Object.keys(project.session.connectedClients).length == 0) {
            project.project.trimChanges()
        }
    } 

    disconnectSocket(socket) {
        if(!(socket.id in this.socketMap)){return}
        this.socketMap[socket.id].projects.forEach(projectId=>{this.leave(socket,projectId,true)})
        delete this.socketMap[socket.id]
    }

    projectChange(blId,data,socket) {
        this.getProject(blId)?.session.onProjectChange(socket,data.msg)
    }

    getVersion(blId) {
        return this.getProject(blId)?.project.version
    }

    getNextId() {
        return ++this.lastId
    }

    // todo checking
    attachScratchProject(scratchId, owner, blockliveId) {
        this.scratchprojects[scratchId] = {owner,blId:blockliveId}
    }

    getProject(blId) {
        return this.blocklive[blId]
    }

    shareProject(id,user,pk) {
        console.log(`sessMngr: sharing ${id} with ${user} (usrId ${pk})`)
        let project = this.getProject(id)
        if(!project) {return}
        project.sharedWith.push(user)
    }
    unshareProject(id,user) {
        console.log(`sessMngr: unsharing ${id} with ${user}`)
        let project = this.getProject(id)
        if(!project) {return}

        project.linkedWith.filter(proj=>(proj.owner.toLowerCase() == user.toLowerCase())).forEach(proj=>{
            project.linkedWith.splice(project.linkedWith.indexOf(proj))
            delete this.scratchprojects[proj.scratchId]
        })

        if(project.owner.toLowerCase() == user.toLowerCase()) {
            project.owner = project.sharedWith[0] ? project.sharedWith[0] : '';
        }
        
        let userIndex = project.sharedWith.indexOf(user)
        if(userIndex != -1) {
            project.sharedWith.splice(userIndex,1)
        }
        // TODO: Handle what-if their project is the inpoint?
    }

    getScratchToBLProject(scratchId) {
        let blId = this.scratchprojects[scratchId]?.blId
        if(!blId) {return null}
        return this.getProject(blId)
    }

}