export default class SessionManager{

    static inst;

    BlockliveProject = class BlockliveProject {
        // unique blocklive id
        id
        clients = []

        // most up to date scratch project id
        scratchId
        scratchProjectVersion = 0

        // projectJSON
        // projectJSONVersion = 0
        version = -1
        changes = []

        constructor(id, scratchId) {
            this.id = id
            this.scratchId = scratchId
        }

        recordChange(change) {
            this.changes.push(change)
            this.version++;
        }

        getChangesSinceVersion(lastVersion) {
            return this.changes.slice(lastVersion)
        }
    }

    BlockliveClient = class BlockliveClient {
        isReady = false;

        trySendMessage(msg) {

        }

    }

    BlockliveSess = class BlockliveSess {
        connectedClients = []
    }

    // map scratch project id's to blocklive id's
    scratchprojects = {}
    blocklive = {}

    lastId = 0

    constructor() {
        SessionManager.inst = this
    }

    getNextId() {
        return ++this.lastId
    }

    // todo checking
    attachScratchProject(scratchId, blockliveId) {
        this.scratchprojects[scratchId] = blockliveId
    }

}