import { STATUS_CODES } from 'http'
import fetch from 'node-fetch'

let processes = {}
import {uptimeWebhookUrl} from './secrets/secrets.js'

function addProcess(pid,url) {
    processes[pid] = {pid,url,status:0}
}
addProcess('blocklive','https://spore.us.to:4000/')

function checkAll() {
    Object.keys(processes).forEach(pid=>check(pid))
}
checkAll()
setInterval(checkAll,1000 * 60) // check every minute! 

async function check(processId) {
    let status;
    let process = processes[processId]
    try { 
        let response = await fetch(process.url)
        status = response.status 
    }
    catch(e) { status = e.message }
    
    if(process.status != status) {
        process.status = status;
        notify(process)
    }
}
check('blocklive')

function getStatusText(status) {
    return STATUS_CODES[status] ? status + ': ' + STATUS_CODES[status] : status;
}

function notify(process) {
    let capitalizedName = process.pid.replace(process.pid[0],process.pid[0].toUpperCase())
    let statusText = getStatusText(process.status)
    let message = process.status == 200 ? 
    `:white_check_mark: :sunglasses: ${capitalizedName} is back up and running :white_check_mark:\n\`${statusText}\``
    : `:rotating_light: :dizzy_face: ${capitalizedName} server is down! The request threw the following error :point_down::rotating_light:\n\`${statusText}\` <@296733673745547264>`

    fetch(uptimeWebhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:message})}).then(res=>res.text().then(text=>console.log(text)))
}