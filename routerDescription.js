/* @flow */

var RouterDescription = function(processIP, processPort, emulatedip, status) {
    this.processIP = processIP;
    this.processPort = processPort;
    this.emulatedip = emulatedip;
    this.status = status || 'INIT';
};
module.exports = RouterDescription;