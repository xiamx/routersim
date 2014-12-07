/* @flow */
var util = require('util');
var _ = require('underscore');
var LinkDescription = require('./linkDescription');
var LSA = require('./lsa');
var winston = require('winston');
var lsdb = function() {
    var _store = {};
    var linkContained = function(endpoint1, endpoint2) {
        return _.some(_store, function(l) {
            return(l[0] === endpoint1 && l[1] === endpoint2) || (l[0] === endpoint2 && l[1] === endpoint1);
        });
    };
    var rd;
    var distance = {}; // shortest distance to each known endpoint
    var previoushop = {}; // the next hop that is of the shortest distance to each known endpoint
    var f = {
        init: function(selfRouter) {
            rd = selfRouter;
            var lsa = new LSA(rd.emulatedip, rd.emulatedip);
            var ld = new LinkDescription(rd.emulatedip, -1, 0);
            lsa.addLink(ld);
            var temp = {};
            temp[lsa.linkStateID] = lsa;
            _store = _.extend(_store, temp);
        },
        addLSA: function(lsa) {
            if(!_.has(_store, lsa.linkStateID) || _store[lsa.linkStateID].lsaSeqNum <= lsa.lsaSeqNum) {
                _store[lsa.linkStateID] = new LSA(lsa.linkStateID, lsa.advRouter, lsa.lsaAge, lsa.lsaSeqNum, lsa.links);
                f.sssp();
                return true;
            } else {
                winston.info('Discarded outdated LSA', lsa);
                return false;
            }
        },
        getLSA: function(emulatedip) {
            return _store[emulatedip];
        },
        getLSAAbstracts: function() {
            return _.map(_store, function(lsa, linkStateID) {
                return {
                    linkStateID: linkStateID,
                    linkStateSeq: lsa.lsaSeqNum
                };
            });
        },
        getRequestedLSAAbstracts: function(reportedLSA) {
            //winston.info("getRequestedLSAABstract");
            //winston.info("reporeted", reportedLSA);
            //console.trace('here')
            return _.filter(reportedLSA, function(rlsa) {
                if(_.has(_store, rlsa.linkStateID)) {
                    if(_store[rlsa.linkStateID].lsaSeqNum <= rlsa.linkStateSeq) {
                        return true;
                    } else {
                        return false;
                    }
                } else {
                    return true;
                }
            });
        },
        getRequestedLSA: function(requestedLSAAbstracts) {
            return _.compact(_.map(requestedLSAAbstracts, function(lsaa) {
                if(_.has(_store, lsaa.linkStateID)) {
                    if(_store[lsaa.linkStateID].lsaSeqNum <= lsaa.linkStateSeq) {
                        return _store[lsaa.linkStateID];
                    } else {
                        return null;
                    }
                } else {
                    return _store[lsaa.linkStateID];
                }
            }));
        },
        getNeighbourLinks: function(ip) {
            var neighbours = [];
            // first get explictly labelled neigbour
            neighbours = _.union(neighbours, _store[ip].links );
            // then get the implicitly labelled neighbours (where i'm listed as neighbours in other nodes)
            neighbours = _.union(neighbours, _.chain(_store).filter(function(value){
                return _.contains(_.pluck(value.links, 'linkID'), ip);
            }).values().pluck('links').value());
            return neighbours;
        },
        sssp: function() {
            var sink;
            distance = {};
            previoushop = {};
            
            var initialize = function() {
                sink = [rd.emulatedip];
                var links = _store[rd.emulatedip].links;
                _.each(links, function(link){
                    if (!_.has(distance, link.linkID)){
                        distance[link.linkID] = link.tosMetrics;
                        previoushop[link.linkID] = sink[0];
                    }
                });
            };
            
            var updateCost = function(newlyAddedNode) {
                if (!_store[newlyAddedNode]) {
                    delete distance[newlyAddedNode];
                    delete previoushop[newlyAddedNode];
                    return;
                }
                _.each(_store[newlyAddedNode].links, function(link) {
                    if (!_.has(distance, link.linkID)){
                        distance[link.linkID] = link.tosMetrics + distance[newlyAddedNode];
                        previoushop[link.linkID] = newlyAddedNode;
                    }
                });
                _.each(distance, function(value, key){
                    // does the newlyAddedNode connect with the target node?
                    if (_store[newlyAddedNode] && _.has(_store[newlyAddedNode].links, key)) {
                        // if so check if using newlyAddedNode leads to a
                        // shorter path
                        // 
                        var altDistance = distance[newlyAddedNode] + _store[newlyAddedNode].links[key].tosMetrics;
                        if (altDistance < value) {
                            distance[key] = altDistance;
                            previoushop[key] = newlyAddedNode;
                        }
                    }
                });
            };
            
            var getNodeOfMinDistance = function(nonSink) {
                return _.min(nonSink, function(ip){
                    return distance[ip];
                });
            };
            
            initialize();
            
            for(var i = 0; i < _.keys(_store).length - 1; i++) {
                var nonSink = _.difference(_.keys(_store), sink);
                winston.info('nonSink', nonSink);
                if (!_.isEmpty(nonSink)){
                    var m =  getNodeOfMinDistance(nonSink);
                    sink.push(m);
                    updateCost(m);
                }
            }
        },
        getSSSP: function(destination) {
            console.log('Path to', destination, 'has cost', distance[destination], 'through');
            
            console.log(':: ', destination);
            var previous = previoushop[destination];
            console.log(':: ', previous);
            while (previous != rd.emulatedip) {
                previous = previoushop[previous];
                console.log(':: ', previous);
            }
        },
        dump: function() {
            return _store;
        },
        load: function(inputLinks) {
            _.each(inputLinks, function(l) {
                f.add(l[0], l[1], l[2]);
            });
        },
        inspect: function() {
            console.log(util.inspect(_store));
            console.log(util.inspect(distance));
            console.log(util.inspect(previoushop));
        }
    };
    return f;
}();
module.exports = lsdb;