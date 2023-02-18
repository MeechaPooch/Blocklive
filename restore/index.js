import fetch from 'node-fetch'
import fs from 'fs'

let exists = true
let i = 1
let db = []
let users = {}
while(exists) {
    i++
    let bl = await (await fetch('http://152.67.226.232:4000/projectInpoint/' + i)).json()

    exists = !!bl.scratchId
if(!exists) {break}
    bl.sharedWith = await (await fetch('http://152.67.226.232:4000/share/' + i)).json()
    bl.sharedWith.forEach(user=>{users[user.username]=user})
    db.push(bl)
    console.log(bl)
}

let promise = async ()=>{}
Object.keys(users).forEach(name=>{
    console.log(name)
    promise = Promise.all([promise,fetch('http://152.67.226.232:4000/friends/' + name).then(
        res=>{
            res.json().then(json=>{
                users[name].friends = json
            }).catch(e=>{})
        }
        )])
})
await promise
console.log(users)

await new Promise(res=>{fs.writeFile('users.json',JSON.stringify(users),res)})
fs.writeFileSync('bl.json',JSON.stringify(db))
