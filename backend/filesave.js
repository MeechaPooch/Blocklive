import fs from 'fs'
import path from 'path';
import sanitize from 'sanitize-filename';

export const blocklivePath = 'storage/sessions/blocklive'
export const scratchprojectsPath = 'storage/sessions/scratchprojects'
export const lastIdPath = 'storage/sessions/lastId'
export const usersPath = 'storage/users'


function sleep(millis) {
    return new Promise(res=>setTimeout(res,millis))
}
if(!fs.existsSync('storage')) {
    fs.mkdirSync('storage')
}

export function saveMapToFolder(obj, dir) {
    // if obj is null, return
    if(!obj) {console.warn('tried to save null object to dir: ' + dir); return}
    // make directory if it doesnt exist
    if (!fs.existsSync(dir)){fs.mkdirSync(dir,{recursive:true})}
    let promises = []
    Object.entries(obj).forEach(entry=>{
         entry[0] = sanitize(entry[0])
         if(entry[0] == '') {return}
         try{
              fs.writeFileSync(dir+path.sep+entry[0],JSON.stringify(entry[1]));
         } catch (e) {
              console.error('Error when saving filename: ' + entry[0])
              console.error(e)
         }
    })
}
export function loadMapFromFolder(dir) {
    let obj = {}
    // check that directory exists, otherwise return empty obj
    if(!fs.existsSync(dir)) {return obj}
    // add promises
    fs.readdirSync(dir,{withFileTypes:true})
         .filter(dirent=>dirent.isFile())
         .map(dirent=>([dirent.name,fs.readFileSync(dir + path.sep + dirent.name)]))
         .forEach(entry=>{
              try{
                   obj[entry[0]] = JSON.parse(entry[1]) // parse file to object
              } catch (e) {
                   console.error('json parse error on file: ' + dir + path.sep + "\x1b[1m" /* <- bold */ + entry[0] + "\x1b[0m" /* <- reset */)
              }
    })
    return obj
}