var net = require('net'),
    _ = require('underscore'),
    nconf = require('nconf'),
    winston = require('winston'),
    chance = new require('chance')(),
    repl = require('repl');

winston.cli();
nconf.argv().env().defaults({
    listenPort: 0,
    emulatedip: chance.ip(), // random ip
});

var getRouterKey = function(processIP, processPort) {
    return processIP + ":" + processPort;
};

attachedClients = {};
routers = {};

var genSendHello = function(dstIP) {
    var helloPacket = {
        type: 'hello',
        srcProcessIP: server.address().address,
        srcProcessPort: server.address().port,
        srcIP: nconf.get('emulatedip'),
        dstIP: dstIP
    };
    return function(socket) {
        socket.write(JSON.stringify(helloPacket));
    };
};

var processHello = function(data, connection) {
    key = getRouterKey(data.srcProcessIP, data.srcProcessPort);
    if (!routers[key]) {
        routers[key] = {
            status: 'INIT',
            processIP: data.srcProcessIP,
            processPort: data.srcProcessPort,
            emulatedip: data.srcIP
        };
        genSendHello(data.srcIP)(connection);
    } else {
        if (routers[key].status === 'INIT') {
            routers[key] = {
                status: 'TWO_WAY'
            };
            genSendHello(data.srcIP)(connection);
        }
    }
};

var processData = function(data, connection) {
    if (data.type === 'hello') {
        processHello(data, connection);
    }
};

var server = net.createServer(function(c) { //'connection' listener
    winston.info('server connected');
    c.on('data', function(data){
        data = JSON.parse(data);
        winston.info('server received data', data);
        processData(data, c);
    });
    c.on('end', function() {
        winston.info('server disconnected');
    });
});

server.listen(nconf.get('listenPort'), function() { //'listening' listener
    console.log('Server bound to port %j', server.address().port);
    console.log('my emulated ip', nconf.get('emulatedip'));
});

attach = function(remoteip, remoteport, emulatedip, weight) {
    var client = net.connect({port: remoteport,
                             host: remoteip
    }, function() { //'connect' listener
        winston.info('client connected');
    });
    client.on('data', function(data) {
        data = JSON.parse(data);
        winston.info('client received data', data);
        processData(data, client);
    });
    client.on('end', function() {
        winston.info('client disconnected', data);
    });
    attachedClients[getRouterKey(remoteip, remoteport)] = {
        processIP: remoteip,
        processPort: remoteport,
        emulatedip: emulatedip,
        socket: client
    };
};

start = function() {
    _.each(attachedClients, function(client){
        genSendHello(client.emulatedip)(client.socket);
    });
};

repl.start({
  input: process.stdin,
  output: process.stdout
});

