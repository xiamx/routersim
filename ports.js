var _ = require('underscore');
var ports = function() {
    var _ports = [];
    var _availablePorts = [1, 2, 3, 4];
    return {
        hasEmptyPort: function() {
            return _ports.length < 4;
        },
        attach: function(remoteip, remoteport, emulatedip, weight) {
            if(_availablePorts.length < 1) {
                throw new Error("Trying to attach a port but there are no more available port left");
            } else {
                var targetPort = _availablePorts.pop();
                _ports.push({
                    remoteip: remoteip,
                    remoteport: remoteport,
                    emulatedip: emulatedip,
                    weight: weight,
                    port: targetPort
                });
                return targetPort;
            }
        },
        get: function(port) {
            return _.find(_ports, function(p) {
                return p.port === port;
            });
        },
        detach: function(port) {
            if(_availablePorts.indexOf(port) >= 0) {
                throw new Error("Trying to detach a port that isn't attached.");
            } else {
                _ports = _.reject(_ports, function(p) {
                    return p.port === port;
                });
                _availablePorts.push(port);
            }
        },
        inspect: function() {
            return _ports;
        }
    };
}();

module.exports = ports;