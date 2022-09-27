import fs from 'fs'
import fetch from 'node-fetch'


let thing = JSON.parse(fs.readFileSync('users.json'))
console.log(thing)
Object.entries(thing).forEach(person=>{
    console.log(person[1].friends?.forEach)
    person[1].friends?.forEach?.(friend=>{
        fetch(`http://152.67.226.232:4001/friends/${person[0]}/${friend}`,{method:'post'})
    })
})


// let things = JSON.parse(fs.readFileSync('bl.json'))

// things.forEach(project=>{
//     let owner = project.sharedWith.shift()
//     fetch(`http://152.67.248.129:4000/newProject/${project.scratchId}/${owner.username}?title=${encodeURIComponent('Recovered Blocklive Project')}`).then(res=>{
//         res.json().then(json=>{
//             let id = json.id
//             project.sharedWith.forEach(person=>{
//     fetch(`http://152.67.248.129:4000/share/${id}/${person.username}/${owner.username}?pk=${person.pk}`,{method:'put'})
//             })
//         }).catch(e=>{console.log(e)})
//     })
// })