import express from 'express'

const app = express();
import cors from 'cors'
app.use(cors())
app.use(express.json())
////////////
import http from 'http'
import { countReset } from 'console';
const server = http.createServer(app);
////////////


app.post('/test',(req,res)=>{
    console.log(req.body)
    res.sendStatus(200)
})

const port = 4000
server.listen(port,'0.0.0.0');
console.log('listening on port ' + port)

