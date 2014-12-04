var LSASeq = function() {
    var _seq = 0;
    return {
        peak: function() {
            return _seq;
        },
        get: function() {
            _seq++;
            return _seq;
        },
        set: function(seq) {
            if(seq > _seq) _seq = seq;
        }
    };
}();

module.exports = LSASeq;