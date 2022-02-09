class BlockliveProject {
    // projectJSON
    // projectJSONVersion = 0
    version = -1
    changes = []

    constructor() {
    }

    recordChange(change) {
        this.changes.push(change)
        this.version++;
    }

    getChangesSinceVersion(lastVersion) {
        return this.changes.slice(lastVersion)
    }
}

class BlockliveClient {
    isReady = false;
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

    constructor(project) {
        this.project = project
    }

    addClient(socket,client) {
        this.connectedClients[socket.id] = client
    }
    removeClient(id) {
        delete this.connectedClients[id]
    }

    getClientFromSocket(socket) {
        return this.connectedClients[socket?.id]
    }

    onProjectChange(socket, msg) {
        this.project.recordChange(msg)
        Object.values(this.connectedClients).forEach(client=>{
            if(socket.id != client.id()){ client.trySendMessage({
                type:'projectChange',
                version:this.project.version,
                data:msg,
                from:socket.id,
                user:this.getClientFromSocket(socket)?.username
            })}
        })
    }
}

class ProjectWrapper {
    session 
    project

    // blocklive id
    id
    // most up to date scratch project id
    scratchId
    scratchVersion = 0
    linkedWith = [] // {scratchId, owner}

    owner
    sharedWith = []

    constructor(owner,scratchId,blId) {
        this.id = blId
        this.scratchId = scratchId
        this.project = new BlockliveProject()
        this.session = new BlockliveSess(this.project)
        owner = owner
    }

    scratchSaved(id,version) {
        this.scratchId = id
        this.scratchVersion = version
    }

    linkProject(scratchId, owner, version) {
        this.linkedWith.push({scratchId,owner,version})
    }

    joinSession(socket,username) {
        if(socket.id in this.session.connectedClients) {}
        let client = new BlockliveClient(socket,username)
        this.session.addClient(client)
    }

}

export default class SessionManager{

    static inst;

    
    // map scratch project id's to blocklive id's
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
        this.scratchprojects[scratchId] = id
    }

    newProject(owner,scratchId) {
        if(scratchId in this.scratchprojects) {return blocklive[this.scratchprojects[scratchId]]}
        let id = new String(this.getNextId())
        let project = new ProjectWrapper(owner,scratchId,id)
        this.blocklive[id] = project
        this.scratchprojects[scratchId] = id

        return project
    }

    join(socket,id,username,) {
        let project = sessionManager.getProject(id)
        if(!project) {return}
        project.joinSession(client,username)
        if(!(socket.id in this.socketMap)) {
            this.socketMap[socket.id] = {username:username,projects:[]}
        }
        this.socketMap[socket.id].projects.push(project.id)
    }
    leave(socket,id,voidMap) {
        let project = sessionManager.getProject(id)
        if(!project) {return}
        project.session.removeClient(socket.id)
        if(socket.id in this.socketMap && !voidMap) {
            let array = this.socketMap[socket.id].projects

            const index = array.indexOf(id);
            if (index > -1) {
                array.splice(index, 1);
            }
        }
    }

    disconnectSocket(socket) {
        if(!(socket.id in this.socketMap)){return}
        this.socketMap[socket.id].projects.forEach(projectId=>{this.leave(socket,projectId,true)})
        delete this.socketMap[socket.id]
    }

    projectChange(blId,data,socket) {
        this.getProject(blId)?.session?.onProjectChange(socket,data.msg)
    }

    getNextId() {
        return ++this.lastId
    }

    // todo checking
    attachScratchProject(scratchId, owner, blockliveId) {
        this.scratchprojects[scratchId] = {user:owner,blocklive:blockliveId}
    }

    getProject(blId) {
        return this.blocklive[blId]
    }

    shareProject(id,user) {
        let project = this.getProject(id)
        if(!project) {return}
        project.sharedWith.push(user)
    }

    getScratchToBLProject(scratchId) {
        let blId = this.scratchprojects[scratchId]
        if(!blId) {return null}
        return this.blocklive[blId.blocklive]
    }

}