function defineMethods(constructor, methods) {
  methods.map(function(fn) { constructor.prototype[fn.name] = fn; });
}

module.exports = defineMethods;
