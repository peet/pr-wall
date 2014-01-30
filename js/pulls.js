window.showPulls = (function() {
  var qs = location.search.substring(1).split('&').map(function(e) {return e.split('=')}).reduce(function(o, e){o[e[0]] = decodeURI(e[1]); return o}, {});
  var version;
  var config = {};

  var updateConfig = function() {
    return $.ajax('config/config.json', {
      dataType: 'json',
      cache: false
    }).then(function(configJSON) {
      if (version && configJSON.version > version) {
        location.reload();
      }
      version = configJSON.version;
      config = $.extend(configJSON, qs);

      $('#prTitle').text(config.title || '');

      setTimeout(updateConfig, config.refreshConfig);
    }, function() {
      setTimeout(updateConfig, config.refreshConfig);
    });
  };

  function animate(element, property, options) {
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
  }

  function scrollTo(to, duration, callback) {
    animate(document.documentElement, 'scrollTop', {to: to, duration: duration, callback: callback});
  }

  function stripOwner(input, owner) {
    if (~input.indexOf(owner + ':')) {
      return input.replace(owner + ':', '');
    }
    return input;
  }

  var hiliteBranch = (function() {
    var matches = ['(:|^)((develop))$','(:|^)((master))$','(:|^)((release)[/-].+)$'].map(function(s) { return RegExp(s) });
    return function(input) {
      var i = matches.length;
      while (i--) {
        var branch = matches[i];
        if (input.match(branch)) {
          return input.replace(branch, '$1<span class="hi-$3">$2</span>');
        }
      }
      return input;
    }
  })();

  function showPulls() {

    var localConfig = config;

    $.when($.ajax('https://api.github.com/repos/' + localConfig.owner + '/' + localConfig.repo + '/pulls', {
        dataType: 'json',
        data: {access_token: localConfig.accessToken}
      }), $.ajax('https://api.github.com/repos/' + localConfig.owner + '/' + localConfig.repo + '/pulls', {
        dataType: 'json',
        data: {
          access_token: localConfig.accessToken,
          base: localConfig.closedBranch,
          state: 'closed'
        }
      })).then(function(openReq, closedReq) {
        var all = openReq[0].concat(closedReq[0].slice(0, Math.max(0, 6 - openReq[0].length)));
        return $.when.apply($, all.map(function(pullRequest) {
          var open = pullRequest.state == 'open';

          var obj = {
            number: pullRequest.number,
            url: pullRequest.html_url,
            open: open,
            title: pullRequest.title,
            body: pullRequest.body,
            time: moment(pullRequest[(open ? 'created' : 'closed') + '_at']).fromNow(),
            user: pullRequest.user.login,
            avatar: pullRequest.user.avatar_url,
            assignee: pullRequest.assignee,
            from: pullRequest.head.label,
            to: stripOwner(pullRequest.base.label, localConfig.owner)
          };

          if (!open) {
            return obj;
          }

          return $.when($.ajax('https://api.github.com/repos/' + localConfig.owner + '/' + localConfig.repo + '/pulls/' + pullRequest.number, {
              dataType: 'json',
              data: {access_token: localConfig.accessToken}
            }), $.ajax('https://api.github.com/repos/' + localConfig.owner + '/' + localConfig.repo + '/statuses/' + pullRequest.head.sha, {
              dataType: 'json',
              data: {access_token: localConfig.accessToken}
            })).then(function(detail, status) {
              obj.mergeable = detail[0].mergeable != false ;
              obj.build = status[0].length ? status[0][0].state : '';
              return obj;
            });
        }));
      }).then(function() {
        var arr = $.makeArray(arguments);

        var out = $('#out').empty();

        $('#mainTitle, title').text(config.title + ' Pull Requests [' + arr.reduce(function(val, pr) {
          return val + +pr.open;
        }, 0) + ']');

        arr.forEach(function(pr) {

          var buildStatus = pr.open ? pr.mergeable ? pr.build : 'merge-err' : '';

          var pullTo = hiliteBranch(pr.to);
          var pullFrom = hiliteBranch(pr.from);

          var titleSpan = (pr.assignee ? 'span_5_of_8' : 'span_7_of_8') + ' ' + buildStatus;

          var div = $('<div class="section group row ' + (pr.open ? '' : 'pr-closed') + '"></div>');

          div.append('<div class="col span_1_of_8 block img-container"><img src="' + pr.avatar + '"><br>' + pr.user + '</div>');
          div.append('<div class="col span_7_of_8 nowrap block">' +
            '<div class="section group">' +
            '<div class="col ' + titleSpan + ' title">' + (buildStatus == 'pending' ? '<div class="progress" id="prog_' + pr.number + '"></div>' : '' ) + '<a href="' + pr.url + '">' + pr.title + '</a></div>' +
            (pr.assignee ? '<div class="col span_2_of_8 assignee"><img src="' + pr.assignee.avatar_url + '">' + pr.assignee.login + '</div>' : '') +
            '<div class="col span_1_of_8 when">' + pr.time + '</div>' +
            '</div>' +
            (pr.body ?
              '<div class="section group">' +
                '<div class="col span_8_of_8 body">' + pr.body + '</div>' +
                '</div>' : '') +
            '<div class="section group">' +
            '<div class="col span_2_of_8 to">' + pullTo + '</div><div class="col span_5_of_8">&lt;&lt;-- ' + pullFrom + '</div>' +

            '</div>' +
            '</div>');

          out.append(div);

          if (localConfig.ghprb && buildStatus == 'pending') {
            $.ajax(localConfig.ghprb.jenkinsRoot + 'job/' + localConfig.ghprb.jobName + '/api/json', {
              dataType: 'jsonp',
              jsonp: 'jsonp',
              data: {
                tree: 'builds[number,url,actions[parameters[name,value]],timestamp,estimatedDuration,result,building]'
              }
            }).done(function(builder) {
              for (var i = 0; i < builder.builds.length; i++) {
                var build = builder.builds[i];
                if (build.actions[0].parameters[2].value == pr.number) {
                  var timeTaken = new Date().getTime() - build.timestamp;
                  var timeLeft = build.estimatedDuration - timeTaken;
                  var progressBarStyle = document.getElementById('prog_' + pr.number).style;
                  if (build.building && timeLeft > 0) {
                    progressBarStyle.width = (timeTaken / build.estimatedDuration * 100) + '%';
                    animate(progressBarStyle, 'width', {to: 100, unit: '%', duration: timeLeft});
                  }
                  else {
                    progressBarStyle.width = '100%';
                  }
                  return;
                }
              }
            })
          }
        });

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
      }, function() {
        setTimeout(showPulls, 5000);
      });
  }

  $('body').on('click', 'a', function(e) {
    window.open(this.href);
    e.preventDefault();
  });

  return function() {
    updateConfig().then(showPulls);
  };
})();

