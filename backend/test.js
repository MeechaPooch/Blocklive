import Lines from 'n-readlines'
import { Filter } from "./profanity-filter.js";
import fs from 'fs'

let filter = new Filter()
filter.loadDefault()

console.log(filter.isVulgar('f u c k'))
console.log(filter.isVulgar('2g1c'))
console.log(filter.isVulgar('2g1c'))
console.log(filter.isVulgar('2g1c'))
console.log(filter.isVulgar('hi'))
console.log(filter.isVulgar('  ,     con  '))

// let lines = new Lines('./filterwords/words.txt')
// let line;
// let output = []
// let vulgar = []
// while (line = lines.next()) {
//     line = line.toString('ascii')
//     if(!filter.isVulgar(line)) {output.push(line)}
//     else {vulgar.push(line)}
// }

// fs.writeFileSync('filterwords/okWords2.txt',output.join('\n'))
// fs.writeFileSync('filterwords/badWords2.txt',vulgar.join('\n'))