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

      setTimeout(updateConfig, config.refreshConfig);
    }, function() {
      setTimeout(updateConfig, config.refreshConfig);
    });
  };

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

  function github(url, data) {
    data || (data = {});

    return $.ajax(url, {
      dataType: 'json',
      data: $.extend({
        access_token: config.accessToken
      }, data)
    })
  }

  function trustedUser(pullRequest) {
    return $.inArray(pullRequest.user.login, config.trustedUsers) > -1;
  }

  function formatPull(pr) {
    return tim('pullrequest', {
      titleSpan: (pr.assignee ? 'span_5_of_8' : 'span_7_of_8') + ' ' + pr.buildStatus,
      pullTo: hiliteBranch(pr.to),
      pullFrom: hiliteBranch(pr.from),
      isClosed: !pr.open,
      isPending: pr.buildStatus == 'pending',
      isAssigned: !!pr.assignee,
      hasBody: !!pr.body,
      pr: pr
    });
  }

  function update() {

    var localConfig = config;

    var pullsUrl = 'https://api.github.com/repos/' + localConfig.owner + '/' + localConfig.repo + '/pulls';

    $.when(github(pullsUrl), github(pullsUrl, {
      base: localConfig.closedBranch,
      state: 'closed'
    }))
      .then(function(openReq, closedReq) {
        var all = openReq[0].concat(closedReq[0].slice(0, 6));
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

          return $.when(github(pullRequest.url), github(pullRequest.statuses_url), !!localConfig.showall || trustedUser(pullRequest) || github(pullRequest.comments_url))
            .then(function(detail, status, comments) {
              obj.mergeable = detail[0].mergeable != false ;
              obj.build = status[0].length ? status[0][0].state : '';

              obj.show = comments === true || comments[0].some(function(comment){
                return ~comment.body.indexOf("core review");
              });
              return obj;
            });
        }));
      }).then(function() {
        var arr = $.makeArray(arguments);

        var out = $('#out').empty();

        $('#mainTitle, title').text(config.title + ' Pull Requests [' + arr.reduce(function(val, pr) {
          return val + +(pr.open && pr.show);
        }, 0) + ']');

        var count = 0;

        arr.every(function(pr) {
          pr.buildStatus =  pr.open ? pr.mergeable ? pr.build : 'merge-err' : '';

          if (!pr.open || pr.show) {
            out.append(formatPull(pr));
            count++;
          }

          if (pr.show && localConfig.ghprb && pr.buildStatus == 'pending') {
            $.ajax(localConfig.ghprb.jenkinsRoot + 'job/' + localConfig.ghprb.jobName + '/api/json', {
              dataType: 'jsonp',
              jsonp: 'jsonp',
              data: {
                tree: 'builds[number,url,actions[parameters[name,value]],timestamp,estimatedDuration,result,building]'
              }
            }).done(function (builder) {
              var found = false;
              builder.builds.every(function(build) {
                if (build.actions[0].parameters[2].value == pr.number) {
                  var timeTaken = new Date().getTime() - build.timestamp;
                  var timeLeft = build.estimatedDuration - timeTaken;

                  var progressBarStyle = $('<div/>').addClass('progress').prependTo($('[data-pr="' + pr.number + '"] .title'))[0].style;
                  if (build.building && timeLeft > 0) {
                    progressBarStyle.width = (timeTaken / build.estimatedDuration * 100) + '%';
                    _.animate(progressBarStyle, 'width', {to: 100, unit: '%', duration: timeLeft});
                  }
                  else {
                    progressBarStyle.width = '100%';
                  }
                  found = true;
                }
                return !found; //continue if not found
              });
            })
          }

          return count < 6; //continue if we've done less than 6
        });

        _.scrollDownUp(5000, 5000, 5000).then(function() {
          return _.wait(15000);
        }).then(update);
      }, function() {
        _.wait(5000).then(update);
      });
  }

  $('body').on('click', 'a', function(e) {
    window.open(this.href);
    e.preventDefault();
  });

  return function() {
    tim.dom({attr:"data-tim"});
    updateConfig().then(update);
  };
})();

