//curry, steal from "JavaScript: The Good Parts" --Douglas Crockford
exports.init = function(){
    if (!Function.prototype.curry ) {
        Function.prototype.curry = function () {
            var slice = Array.prototype.slice;
            //copy arguments
            var args = slice.apply(arguments);
            var that = this;
            return function () {
                return that.apply(null, args.concat(slice.apply(arguments)))
            };
        };
    }
}