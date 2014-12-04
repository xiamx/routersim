/* @flow */
var net = require('net'),
    util = require('util'),
    _ = require('underscore'),
    nconf = require('nconf'),
    winston = require('winston'),
    Chance = require('chance'),
    chance = new Chance(),
    repl = require('repl'),
    lsdb = require('./lsdb'),
    RouterDescription = require('./routerDescription'),
    LinkDescription = require('./linkDescription'),
    ports = require('./ports');
// configure the necessaries
winston.cli();
nconf.argv().env().defaults({
    listenPort: 0,
    emulatedip: chance.ip(), // random ip
});

var SENTINAL = '\r\n';

var sendMessage = function(socket, msg) {
    socket.write(msg.concat(SENTINAL));
};

var getRouterKey = function(processIP, processPort) {
    return processIP + ":" + processPort;
};
var routers = {};
var getRouterSelf = function() {
    return new RouterDescription(server.address().address, server.address().port, nconf.get('emulatedip'));
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
    var helloPacket = _.extend(genPacketCommon({
        dstIP: dstIP
    }), {
        type: 'hello'
    });
    return function(socket) {
        sendMessage(socket, JSON.stringify(helloPacket));
    };
};
var genSendDD = function(dstIP, withAbstract) {
    var packet = _.extend(genPacketCommon({
        dstIP: dstIP
    }), {
        type: 'DD',
        LSAAbstract: withAbstract ? lsdb.getLSAAbstracts() : [],
    });
    return function(socket) {
        sendMessage(socket,JSON.stringify(packet));
    };
};
var genSendLSAReq = function(dstIP, reportedLSA){
    var packet = _.extend(genPacketCommon({
        dstIP: dstIP
    }), {
        type: 'REQ',
        LSAAbstract: lsdb.getRequestedLSAAbstracts(reportedLSA),
    });
    return function(socket) {
        sendMessage(socket,JSON.stringify(packet));
    };
};

var genSendLSAUpdate = function(dstIP, requestedLSAAbstracts){
    var packet = _.extend(genPacketCommon({
        dstIP: dstIP
    }), {
        type: 'UPDATE',
        LSA: lsdb.getRequestedLSA(requestedLSAAbstracts),
        LSAAbstract: lsdb.getLSAAbstracts(),
    });
    return function(socket) {
        sendMessage(socket, JSON.stringify(packet));
    };
};

var genBroadcastLSAUpdate = function(dstIP, lsa){
    var packet = _.extend(genPacketCommon({
        dstIP: dstIP
    }), {
        type: 'UPDATE',
        LSA: lsa,
        LSAAbstract: lsdb.getLSAAbstracts(),
    });
    return function(socket) {
        sendMessage(socket, JSON.stringify(packet));
    };
};

var processHello = function(data, connection) {
    var key = getRouterKey(data.srcProcessIP, data.srcProcessPort);
    if(!routers[key]) {
        routers[key] = {
            status: 'INIT',
            processIP: data.srcProcessIP,
            processPort: data.srcProcessPort,
            emulatedip: data.srcIP,
            socket: connection
        };
        genSendHello(data.srcIP)(connection);
    } else if(routers[key].status === 'INIT') {
        routers[key] = _.extend(routers[key], {
            status: 'TWO_WAY'
        });
        genSendHello(data.srcIP)(connection);
    } else if(routers[key].status === 'TWO_WAY') {
        routers[key] = _.extend(routers[key], {
            status: 'EXSTART'
        });
        genSendDD(data.srcIP, false)(connection);
    }
};
var processDD = function(data, connection) {
    var key = getRouterKey(data.srcProcessIP, data.srcProcessPort);
        if(routers[key].status === 'TWO_WAY') {
            routers[key] = _.extend(routers[key], {
                status: 'EXSTART'
            });
            genSendDD(data.srcIP, false)(connection);
        } else if(routers[key].status === 'EXSTART') {
            routers[key] = _.extend(routers[key], {
                status: 'EXCHANGE'
            });
            genSendDD(data.srcIP, true)(connection);
            genSendLSAReq(data.srcIP, data.LSAAbstract)(connection);
        } else if(routers[key].status === 'EXCHANGE') {
            routers[key] = _.extend(routers[key], {
                status: 'LOADING'
            });
        }
};

var processReq = function(data, connection) {
    var key = getRouterKey(data.srcProcessIP, data.srcProcessPort);
        if(routers[key].status === 'EXCHANGE') {
            routers[key] = _.extend(routers[key], {
                status: 'LOADING'
            });
            genSendLSAUpdate(data.srcIP, data.LSAAbstract)(connection);
        } else {
            genSendLSAUpdate(data.srcIP, data.LSAAbstract)(connection);
        }
};

var processUpdate = function(data, connection) {
    var key = getRouterKey(data.srcProcessIP, data.srcProcessPort);
    if(routers[key].status === 'LOADING') {
        genSendLSAReq(data.srcIP, data.LSAAbstract)(connection);
        routers[key] = _.extend(routers[key], {
            status: 'FULL'
        });
    }
    _.each(data.LSA, lsdb.addLSA);
};

var processData = function(data, connection) {
    if(data.type === 'hello') {
        processHello(data, connection);
    } else if(data.type === 'DD') {
        processDD(data, connection);
    } else if(data.type === 'REQ') {
        processReq(data, connection);
    } else if(data.type === 'UPDATE') {
        processUpdate(data, connection);
    }
};

var preprocessor = function(){
    var buffer = '';
    var processingfun = function(client, data) {
        buffer = buffer.concat(data);
        var cursor = buffer.indexOf(SENTINAL);
        while (cursor > -1) {
            var jsonString = buffer.slice(0, cursor);
            var json = JSON.parse(jsonString);
            winston.info('server received data', json);
            processData(json, client);
            buffer = buffer.slice(cursor + SENTINAL.length);
            cursor = buffer.indexOf(SENTINAL);
        }
    };
    return processingfun;
};

var server = net.createServer(function(c) { //'connection' listener
    winston.info('server connected');
    var serverPrep = preprocessor();
    c.on('data', function(data) {
        serverPrep(c, data);
    });
    c.on('end', function() {
        winston.info('server disconnected');
    });
});
server.listen(nconf.get('listenPort'), function() { //'listening' listener
    winston.info('Server bound to port %j', server.address().port);
    winston.info('my emulated ip', nconf.get('emulatedip'));
    lsdb.init(getRouterSelf());
    winston.info('LSDB Initialized');
});
var attach = function(remoteip, remoteport, emulatedip, weight) {
    var client = net.connect({
        port: remoteport,
        host: remoteip
    }, function() { //'connect' listener
        winston.info('client connected');
    });
    var buffer = '';
    var clientPrep = preprocessor();
    client.on('data', function(data) {
        clientPrep(client, data);
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
    var port = ports.attach(remoteip, remoteport, emulatedip, weight);
    var lsa = lsdb.getLSA(getRouterSelf().emulatedip);
    lsa.addLink(new LinkDescription(emulatedip, port, weight));
    lsa.lsaSeqNum++;
    lsdb.addLSA(lsa);
};
var disconnect = function(portNum) {
    p = ports.get(portNum);
    var emulatedip = p.emulatedip;
    var lsa = lsdb.getLSA(getRouterSelf().emulatedip);
    lsa.removeLink(emulatedip);
    lsa.lsaSeqNum++;
    lsdb.addLSA(lsa);
    ports.detach(portNum);
    _.each(_.values(routers), function(router){
        genBroadcastLSAUpdate(router.emulatedip, [lsa])(router.socket);
    });
    
};
var start = function() {
    var socketEnabledClients = _.filter(routers, function(c) {
        return c.socket;
    });
    _.each(socketEnabledClients, function(client) {
        genSendHello(client.emulatedip)(client.socket);
    });
};
var local = repl.start({
    input: process.stdin,
    output: process.stdout,
    writer: function(obj) {
        return util.inspect(obj, {depth: 5, colors: true});
    }
});
local.context.start = start;
local.context.attach = attach;
local.context.disconnect = disconnect;
local.context.routers = routers;
local.context.lsdb = lsdb;
local.context.ports = ports;
