const app = require('express')();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
io.on('connection', (client) => {
     /* … */ 
});
server.listen(3000);

// initial handshake:
// client says hi, sends username & creds, sends project id 
// server generates id, sends id
// server sends JSON or scratchId
// client loads, sends when isReady
// connection success!! commense the chitter chatter!