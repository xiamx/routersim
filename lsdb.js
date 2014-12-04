/* @flow */
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
            if (!_.has(_store, lsa.linkStateID) ||
               _store[lsa.linkStateID].lsaSeqNum <= lsa.lsaSeqNum){
                _store[lsa.linkStateID] = lsa;
            } else {
                winston.info('Discarded outdated LSA', lsa);
            }
        },
        getLSA: function(emulatedip) {
            return _store[emulatedip];
        },
        getLSAAbstracts: function() {
            return _.map(_store, function(lsa, linkStateID){
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
            return _.filter(reportedLSA, function(rlsa){
                if (_.has(_store, rlsa.linkStateID)){
                    if (_store[rlsa.linkStateID].lsaSeqNum <= rlsa.linkStateSeq) {
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
            return _.compact(_.map(requestedLSAAbstracts, function(lsaa){
                if (_.has(_store, lsaa.linkStateID)){
                    if (_store[lsaa.linkStateID].lsaSeqNum <= lsaa.linkStateSeq) {
                        return _store[lsaa.linkStateID];
                    } else {
                        return null;
                    }
                } else {
                    return _store[lsaa.linkStateID];
                }
            }));
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
            return _store;
        }
    };
    return f;
}();

module.exports = lsdb;