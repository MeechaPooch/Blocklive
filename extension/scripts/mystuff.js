console.log('mystuff inject started')

// var exId = 'gelkmljpoacdjkjkcfekkmgkpnmeomlk'
var exId = 'lkemkleahdmbjeeeclnglhjhniiknhlf'

////////// INJECT UTILS //////////

let queryList = []
function mutationCallback() {
    let toDelete = []
    queryList.forEach(query=>{
        let elem = document.querySelector(query.query)
        if(elem && !elem.blSeen) {
            if(query.once){toDelete.push(query)}
            else {elem.blSeen = true}
            query.callback(elem)
        }
    })
    toDelete.forEach(query=>{queryList.splice(queryList.indexOf(query),1)})
}
let observer = new MutationObserver(mutationCallback)
observer.observe(document.documentElement,{ subtree: true, childList: true })
function getObj(query) {
    let obj = document.querySelector(query)
    if(obj) {return new Promise(res=>{res(obj)})}
    return new Promise(res=>{
        queryList.push({query,callback:res,once:true})
    })
}
function listenForObj(query,callback) {
    let obj = document.querySelector(query)
    if(obj) {obj.blSeen = true; callback(obj)}
    queryList.push({query,callback,once:false})
}




// BLM!!!!
function getBlMyStuff() {
    return new Promise((promRes)=>{
    chrome.runtime.sendMessage(exId,{meta:'myStuff'},promRes)
    })
}

function getbox(title,scratchId,lastModified,lastModBy) {
    return`
    <div class="media-item-content not-shared">
      <div class="media-thumb">
        <a href="/projects/${scratchId}/">
          <img src="//cdn2.scratch.mit.edu/get_image/project/${scratchId}_100x80.png">
        </a>
      </div>
      <div class="media-info">
        <span class="media-info-item title"><a style="color:#ff4ad5" href="/projects/${scratchId}/">${title}</a></span>
      	<span class="media-info-item date shortDateFormat">
        
          Last modified: 
          
            ${timeSince(new Date(lastModified))} ago by ${lastModBy}
          
        </span>
      <a href="/projects/${scratchId}/#editor" data-control="edit" class="media-control-edit small button grey">
	      <span>See inside</span>
      </a>
      </div>
      <div class="media-action">
	      <div><a href="#" class="media-trash" style="color:#ff4ad5" data-control="trash">Leave</a></div>
      </div>
    </div>`
}

https://stackoverflow.com/questions/3177836/how-to-format-time-since-xxx-e-g-4-minutes-ago-similar-to-stack-exchange-site
function timeSince(date) {

    var seconds = Math.floor((new Date() - date) / 1000);
    if(seconds < 0) {return 'zero seconds'}
  
    var interval = seconds / 31536000;
  
    if (interval > 1) {
      return Math.floor(interval) + " years";
    }
    interval = seconds / 2592000;
    if (interval > 1) {
      return Math.floor(interval) + " months";
    }
    interval = seconds / 86400;
    if (interval > 1) {
      return Math.floor(interval) + " days";
    }
    interval = seconds / 3600;
    if (interval > 1) {
      return Math.floor(interval) + " hours";
    }
    interval = seconds / 60;
    if (interval > 1) {
      return Math.floor(interval) + " minutes";
    }
    return Math.floor(seconds) + " seconds";
  }

function getId(listItem) {
    return listItem.children[0].children[0].children[0].getAttribute('href').split('/')[2]
}

function convertToBlocklive(listItem,projectObj) {
    listItem.children[0].children[1].children[0].children[0].style.color = '#ff4ad5'
    listItem.children[0].children[2].children[0].children[0].style.color = '#ff4ad5'
    listItem.children[0].children[2].children[0].children[0].innerHTML = 'Leave'
    listItem.children[0].children[1].children[0].children[0].innerHTML = projectObj.title
    listItem.children[0].children[1].children[1].innerHTML = `\n          Last modified: \n          \n            ${timeSince(new Date(projectObj.lastTime))} ago by ${projectObj.lastUser}\n          \n        `
}

function addProject(projectObj) {
    let newBox = document.createElement('li')
    newBox.innerHTML = getbox(projectObj.title,projectObj.scratchId,projectObj.lastTime,projectObj.lastUser)
    document.querySelector('ul.media-list').insertBefore(newBox,document.querySelector('ul.media-list').firstChild)
}



////////// RUN ON START! ///////////

let blMySTuff
let blMyStuffMap = {}
async function onTabLoad() {
    blMySTuff = await getBlMyStuff()
    listenForObj('ul.media-list',(list)=>{
        if(!document.querySelector("#tabs > li.first.active")) {return} // return if "all projects" not selected
        blMySTuff.forEach(projObj=>{blMyStuffMap[projObj.scratchId] = projObj})
        let toDelete = []
        for(let child of list.children) {
            let scratchId = getId(child)
            let blockliveProject = blMyStuffMap[scratchId]
            if(blockliveProject) {
                if(Date.now() - blockliveProject.lastTime < 1000 * 60 * 60 * 2) { // if project was edited less than 2 hours ago
                    toDelete.push(child)
                } else {
                    convertToBlocklive(child,blockliveProject)
                    delete blMyStuffMap[scratchId]
                }
            }
        }
        toDelete.forEach(elem=>{elem.remove()})
        let leftOver = Object.values(blMyStuffMap)
        leftOver.sort((a,b)=>{b.lastTime - a.lastTime})
        for(let projObj of leftOver) {
            addProject(projObj)
        }
    })
}
onTabLoad()