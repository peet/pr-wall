window._ = (function() {

  var animate = function(element, property, options) {
    if (options.duration <= 0) {
      options.callback && options.callback();
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
        animate(element, property, $.extend(options, {duration: options.duration - 10}));
      }, options.tick || 10);
    }
  },

  scrollTo = function(to, duration, callback) {
    animate(document.documentElement, 'scrollTop', {to: to, duration: duration, callback: callback});
  },

  scrollDownUp = function() {
    document.documentElement.scrollTop = 9999;
    var bottom = document.documentElement.scrollTop;
    document.documentElement.scrollTop = 0;

    scrollTo(bottom, 5000, function() {
      setTimeout(function() {
        scrollTo(0, 5000, function() {
          setTimeout(showPulls, 15000);
        });
      }, 5000);
    });
  };

  return {
    animate: animate,
    scrollDownUp: scrollDownUp
  }

})();
