// user:
//  friends LIST of STRING
//  projects owned by user LIST of 
//  projects shared to user LIST
//     > blocklive id
//     > from user
//  scratch id (pk- "primary key")
//


export default class UserManager {

    static fromJSON(json) {
        let thing = new UserManager()
        thing.users = json.users
        return thing
    }

    users = {}

    verify(username,token) {
        return !!(getUser(username)?.token == token) // 🟢
    }

    befriend(base,to) {
        console.log(base + ' friending ' + to)
        this.getUser(base)?.friends.push(to?.toLowerCase()) // 🚨
    }
    unbefriend(base,take) {
        console.log(base + ' unfriending ' + take)
        take = take?.toLowerCase()
        this.getUser(base)?.friends.splice(this.getUser(base)?.friends.indexOf(take),1) // 🚨
    }

    getUser(username) {
        if(!(username?.toLowerCase() in this.users)) {
            this.addUser(username) 
        }
        return this.users[username.toLowerCase()] // 🟢
    }

    addUser(username) {
        if(!(username?.toLowerCase() in this.users)) {
            this.users[username.toLowerCase()] = {username,friends:[],token:this.token(),sharedTo:{},myProjects:[]} // 🚨
        }
        return this.getUser(username)
    }

    newProject(owner,blId) {
        console.log(`usrMngr: adding new project ${blId} owned by ${owner}`)
        if(this.getUser(owner).myProjects.indexOf(blId) != -1){return}
        this.getUser(owner).myProjects.push(blId)
    }

    share(username,blId,from) {
        from = from?.toLowerCase()
        console.log(`usrMngr: sharing ${blId} with ${username} from ${from}`)
        let map = this.getUser(username)?.sharedTo
        if(!map) {return}
        if(blId in map) {return}
        map[blId] = {from,id:blId}
    }
    unShare(username,blId) {
        username = username?.toLowerCase()
        console.log(`usrMngr: unsharing ${blId} with ${username}`)
        let map = this.getUser(username)?.sharedTo
        if(!map) {return}
        delete map[blId]

        let ownedIndex = this.getUser(username)?.myProjects.indexOf(blId)
        if(ownedIndex != -1) {
            this.getUser(username)?.myProjects.splice(ownedIndex,1)
        }

    }
    getSharedObjects(username) {
        return Object.values(this.getUser(username)?.sharedTo)
    }
    getShared(username) {
        let user = this.getUser(username)
        let objs = this.getSharedObjects(username)
        if(!objs) {return []}
        return objs.filter((proj)=>(user.friends.indexOf(proj.from?.toLowerCase())!=-1)).map((proj)=>(proj.id))
    }
    getAllProjects(username) {
        return this.getUser(username).myProjects.concat(this.getShared(username))
    }

    rand() {
        return Math.random().toString(36).substr(2); // remove `0.`
    };
    
    token() {
        return this.rand() + this.rand(); // to make it longer
    };
}