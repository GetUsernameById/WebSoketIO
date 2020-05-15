const express = require("express");
// const app = express();
const net = require('net');
const sio = require('socket.io');
const redis = require('socket.io-redis');
// const http = require('http');
const farmhash = require('farmhash');
const proc = require('process');

let cluster = require('cluster');
let port = 3000;





if(cluster.isMaster){

    const cpuCount = require('os').cpus().length;
    let workers = [];


    //console.log(`cpuCount ${cpuCount}`);
    
    
    
    //cpuCount - 1
    for(let i = 0; i < 3; i++){
        workers[i] = cluster.fork();

        
        workers[i].on('fork', (worker) => {
            // console.log(`Worker #${worker.id} is online!!`);
        
        })
        workers[i].on('listening', (worker, adress) => {
            // console.log(`Worker #${worker.id} is connected now to ${JSON.stringify(adress)}!!`);
            
        })
        workers[i].on('dissconect', (worker) => {
            console.log(`Worker #${worker.id} has disconnected!!`);
            
        })
        workers[i].on('exit', (worker) => {
            console.log(`Worker #${worker.id} is dead!!`);
            cluster.fork();
        })
    }

    /**
     *  Вспомогательная функция для получения рабочего индекса на основе IP-адреса.
     *  IP-адрес преобразуется в число, удалив нечисловые символы, а затем сжимая его до количества имеющихся у нас процессов.
     * 
     * @param {*} ip IP-адрес
     * @param {*} len Количество воркеров
     */
    let worker_index = function(ip, len) {
		return farmhash.fingerprint32(ip) % len; // Farmhash is the fastest and works with IPv6, too
    };
    
    /**
     * Создайте внешний сервер, слушающий наш порт.
     * Мы получили соединение и должны передать его соответствующему работнику. Получите рабочий для исходного IP-адреса этого соединения и передайте ему соединение.
     */
    console.log('IMA HERE');
    
    let server = net.createServer({ pauseOnConnect: true }, function(connection) {
        let worker = workers[worker_index(connection.remoteAddress, 3)];
        console.log(`IP ${connection.remoteAddress} `, worker_index(connection.remoteAddress, 3)); 
		worker.send('sticky-session:connection', connection);
	}).listen(port);
    
}else{
    const app = new express();

    app.use(express.static('public'));

    app.get('/', (req, res) => {
        
        res.sendFile(__dirname + '/public/index.html');
        
    });
    
    app.get('/admin', (req, res) => {
        console.log('GET CLUSTER ADMIN ', cluster.worker.id);
        res.sendFile(__dirname + '/public/admin.html');
    });
    
    app.get('/cashbox', (req, res) => {
        console.log('GET CLUSTER CASHBOX ', cluster.worker.id);
        res.sendFile(__dirname + '/public/cashbox.html');
    });

    const server = app.listen(0, 'localhost');
    const io = sio(server);
    
    io.adapter(redis({ host: 'localhost', port: 6379 }));
    // console.log(process.pid);
    // proc.emit('message', 'Hello from worker');

    process.on('message', function(message, connection) {
		if (message !== 'sticky-session:connection') {
			return;
		}

		// Эмулируем событие соединения на сервере, генерируя событие с подключением, которое нам прислал мастер
		server.emit('connection', connection);

		connection.resume();
	});
      

    let cashboxesCount = 0;
    
    io.of('admin').use((socket, next) =>{
        if (socket.handshake.query && socket.handshake.query.data){
            socket.authData = JSON.parse(socket.handshake.query.data); 
            // console.log(socket.authData);
            next();
        } else {
            next(new Error('Authentication error'));
        }   
    }).on('connection', (socket) =>{
        console.log('clusterAdm ' + cluster.worker.id);
        
        socket.join(`${socket.authData.role}/${socket.authData.organisationID}/${socket.authData.storeID}`);
        socket.join(`${socket.authData.role}/${socket.authData.organisationID}`);
        
    
        // let connectedCashboxes = io.of('/cashbox').clients().connected;
       
        let connectedCashboxes = io.of('/cashbox').adapter.nsp.connected; 
        let cashboxData = []
        
        if(Object.keys(connectedCashboxes).length > 0){
            io.of('cashbox').in(`cashbox/${socket.authData.organisationID}/${socket.authData.storeID}`).clients((error, clients) => {
                if (error) throw error;
                clients.forEach(client => {
                    let authData = connectedCashboxes[client].authData;
                    cashboxData.push({...authData, socketID: connectedCashboxes[client].id});
                });
                socket.emit('getActiveCashbox', cashboxData);
            }); 
        }
        
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
        console.log('clusterCB ' + cluster.worker.id);
        // process.send({type: "connection",payload: socket.id, cluster : cluster.worker.id});
        
        
        
        socket.join(`${socket.authData.role}/${socket.authData.organisationID}/${socket.authData.storeID}`);
        socket.join(`${socket.authData.role}/${socket.authData.organisationID}`);
    
        /**
         * Отправляет связаными комнатой админам событие на добавление новой комнаты
         */
        io.of('admin')
                .to(`admin/${socket.authData.organisationID}/${socket.authData.storeID}`)
                .emit('connectedNewCb', {...socket.authData, socketID: socket.id});
    
    
    
        socket.on('disconnect', (reason) => {
            console.log('Cb disconect', reason)
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