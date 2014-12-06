var _ = require('underscore');
var LSA = function(linkStateID, advRouter, lsaAge, lsaSeqNum, links) {
    this.linkStateID = linkStateID;
    this.advRouter = advRouter;
    this.lsaAge = lsaAge || 0; 
    this.lsaSeqNum = lsaSeqNum || 0;
    this.links = links || [];
};

LSA.prototype.addLink = function(linkDescription) {
    this.links.push(linkDescription);
};
LSA.prototype.removeLink = function(linkID) {
    this.links = _.reject(this.links, function(link){
        return link.linkID === linkID;
    });
};
module.exports = LSA;