window._ = (function() {

  var wait = function(time) {
    var d = $.Deferred();

    setTimeout(d.resolve, time);

    return d.promise();
  },

  animate = function(element, property, options, deferred) {
    if (deferred == null) {
      deferred = $.Deferred();
    }
    if (options.duration <= 0) {
      deferred.resolve();
    }
    else {
      var currentVal = +(/[\d\.]+/.exec(element[property] + '')) || 0;
      var difference = options.to - currentVal;
      var perTick = difference / options.duration * (options.tick || 10);

      setTimeout(function() {
        var newVal = currentVal + perTick;
        if (options.unit) {
          newVal += options.unit;
        }
        element[property] = newVal;
        animate(element, property, $.extend(options, {duration: options.duration - 10}), deferred);
      }, options.tick || 10);
    }
    return deferred;
  },

  scrollTo = function(to, duration) {
    return animate(document.documentElement, 'scrollTop', {to: to, duration: duration});
  },

  scrollDownUp = function(down, pause, up) {
    document.documentElement.scrollTop = 9999;
    var bottom = document.documentElement.scrollTop;
    document.documentElement.scrollTop = 0;

    return scrollTo(bottom, down).then(function() {
      return wait(pause);
    }).then(function() {
      return scrollTo(0, up);
    });
  };

  return {
    wait: wait,
    animate: animate,
    scrollDownUp: scrollDownUp
  }

})();
