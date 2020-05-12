const express = require("express");
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const proc = require('process');


let cluster = require('cluster');
let port = 3000;


if(cluster.isMaster){
    
    const cpuCount = require('os').cpus().length;
    const map = new Map();


    console.log(`cpuCount ${cpuCount}`);
    
    
    

    for(let i = 0; i < cpuCount; i++){
        cluster.schedulingPolicy = cluster.SCHED_NONE;
        cluster.fork();
    }

    

    cluster.on('fork', (worker) => {
        // console.log(`Worker #${worker.id} is online!!`);
       
    })
    cluster.on('listening', (worker, adress) => {
        // console.log(`Worker #${worker.id} is connected now to ${JSON.stringify(adress)}!!`);
        
    })
    cluster.on('dissconect', (worker) => {
        console.log(`Worker #${worker.id} has disconnected!!`);
        
    })
    cluster.on('exit', (worker) => {
        console.log(`Worker #${worker.id} is dead!!`);
        cluster.fork();
        
    })

    let numReq = 0;

    
    for (const id in cluster.workers) {
        cluster.workers[id].on('message', messageHandler);
    }

    function messageHandler(data){
        console.log(data);
        
        map.set(data.payload, 123);
    }
    
}else{

    
   
    // console.log(process.pid);
    proc.emit('message', 'Hello from worker');
    app.use(express.static('public'));
    app.get('/', (req, res) => {
        res.sendFile(__dirname + '/public/index.html');
    });
    
    app.get('/admin', (req, res) => {
        res.sendFile(__dirname + '/public/admin.html');
    });
    
    app.get('/cashbox', (req, res) => {
        res.sendFile(__dirname + '/public/cashbox.html');
    });
      
    http.listen(port + cluster.worker.id, () => {
        // console.log(`listening on *${port}`);
    });
    
    let cashboxesCount = 0;
    
    io.of('admin').use((socket, next) =>{
        if (socket.handshake.query && socket.handshake.query.data){
            socket.authData = JSON.parse(socket.handshake.query.data); 
            next();
        } else {
            next(new Error('Authentication error'));
        }   
    }).on('connection', (socket) =>{
    
        socket.join(`${socket.authData.role}/${socket.authData.organisationID}/${socket.authData.storeID}`);
        socket.join(`${socket.authData.role}/${socket.authData.organisationID}`);
        
        
        // process.send({type: "connection",payload: socket.id, env:process.argv});

       
    
        let connectedCashboxes = io.of('/cashbox').clients().connected;
        let cashboxData = []
        io.of('/cashbox').in(`cashbox/${socket.authData.organisationID}/${socket.authData.storeID}`).clients((error, clients) => {
            if (error) throw error;
            
            clients.forEach(client => {
                cashboxData.push(connectedCashboxes[client].authData);
            });
            socket.emit('getActiveCashbox', cashboxData);
        });
    
        
        
        // console.log(connectedCashboxes);
        
        // let cashboxData = []
        
        
        // for (client in connectedCashboxes) {
        //     console.log(client);
        //     cashboxData.push(connectedCashboxes[client].authData);
        // }
    
        // socket.emit('getActiveCashbox', cashboxData);
        // io.to(data.socketID).emit('action', {...data, AdminID: socket.authData.id, socketId: socket.id})
        // io.of('cashbox')
        //     .to(`cashbox/${socket.authData.organisationID}/${socket.authData.storeID}`)
        //     .emit('pingCashbox', {...data, adminID: socket.authData.id, socketId: socket.id})
    
        // socket.emit('getActiveCashbox', cashboxesCount)    
    
    
        
       
        socket.on('reloadCashbox', socketID =>{
            console.log(socketID);
            
            io.of('cashbox')
                .to(socketID)
                .emit('reloadCashbox', null);
        })
        
        socket.on('addNewProduct', data =>{    
            // io.to(data.socketID).emit('action', {...data, AdminID: socket.authData.id, socketId: socket.id})
            io.of('cashbox')
                .to(`cashbox/${socket.authData.organisationID}/${socket.authData.storeID}`)
                .emit('addNewProduct', {...data, adminID: socket.authData.id, socketId: socket.id});
        });
    
        // socket
        //     .to(`cashbox/${socket.authData.organisationID}/${socket.authData.storeID}/${socket.authData.storeID}`)
        //     .emit('addNewProduct', {type: 'getState', payload: null})
    })
    
    
    
    io.of('cashbox').use((socket, next) =>{
        if (socket.handshake.query && socket.handshake.query.data){
            socket.authData = JSON.parse(socket.handshake.query.data); 
            next();
        } else {
            next(new Error('Authentication error'));
        }   
    }).on('connection', (socket) =>{
    
        socket.join(`${socket.authData.role}/${socket.authData.organisationID}/${socket.authData.storeID}`);
        socket.join(`${socket.authData.role}/${socket.authData.organisationID}`);
    
        /**
         * Отправляет связаными комнатой админам событие на добавление новой комнаты
         */
        io.of('admin')
                .to(`admin/${socket.authData.organisationID}/${socket.authData.storeID}`)
                .emit('connectedNewCb', {...socket.authData, socketID: socket.id});
    
    
    
        socket.on('disconnect', (reason) => {
            console.log('Cb disconect')
            io.of('admin')
                .to(`admin/${socket.authData.organisationID}/${socket.authData.storeID}`)
                .emit('dissconectCb', {...socket.authData, socketID: socket.id});
        });
        
    
    
        socket.on('action', aсtion => {
            socket
              .to(`admin/${socket.authData.organisationID}/${socket.authData.storeID}`)
              .emit('action', {...aсtion, equipID: socket.authData.id, socketId: socket.id});
          })
    
        socket.on('pingCashbox', () =>{    
            cashboxesCount++; 
            console.log(cashboxesCount)   
        });
    }) 
}