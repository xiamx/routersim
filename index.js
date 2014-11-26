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
links = [];

var getRouterSelf = function(){
    return {
        processIP: server.address().address,
        processPort: server.address().port,
        emulatedip: nconf.get('emulatedip')
    };
};

var genPacketCommon = function(params) {
    return {
        srcProcessIP: server.address().address,
        srcProcessPort: server.address().port,
        srcIP: nconf.get('emulatedip'),
        dstIP: params.dstIP
    };
};

var genSendHello = function(dstIP) {
    var helloPacket = _.extend(genPacketCommon({dstIP: dstIP}), {
        type: 'hello'
    });
    return function(socket) {
        socket.write(JSON.stringify(helloPacket));
    };
};

var genSendDD = function(dstIP, withAbstract) {
    var packet = _.extend(genPacketCommon({dstIP: dstIP}), {
        type: 'DD'
    });
    return function(socket) {
        socket.write(JSON.stringify(packet));
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
    } else if (routers[key].status === 'INIT') {
        routers[key] = _.extend(routers[key], {
            status: 'TWO_WAY'
        });
        genSendHello(data.srcIP)(connection);
    } else if (routers[key].status === 'TWO_WAY') {
        routers[key] = _.extend(routers[key], {
            status: 'EXSTART'
        });
        genSendDD(data.srcIP, false)(connection);
    }
};

var processDD = function(data, connection) {
    key = getRouterKey(data.srcProcessIP, data.srcProcessPort);
    if (routers[key].status === 'TWO_WAY') {
        routers[key] = _.extend(routers[key], {
            status: 'EXSTART'
        });
        genSendDD(data.srcIP, false)(connection);
    } else if (routers[key].status === 'EXSTART') {
        routers[key] = _.extend(routers[key], {
            status: 'EXCHANGE'
        });
        genSendDD(data.srcIP, true)(connection);
    }
};

var processData = function(data, connection) {
    if (data.type === 'hello') {
        processHello(data, connection);
    } else if (data.type === 'DD') {
        processDD(data, connection);
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
        winston.info('client disconnected');
    });
    routers[getRouterKey(remoteip, remoteport)] = {
        processIP: remoteip,
        processPort: remoteport,
        emulatedip: emulatedip,
        status: 'INIT',
        socket: client
    };
};

start = function() {
    _.each(routers, function(client){
        genSendHello(client.emulatedip)(client.socket);
    });
};

repl.start({
  input: process.stdin,
  output: process.stdout
});

