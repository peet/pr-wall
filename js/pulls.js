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
      }, data),
      cache: false
    }).then(function(data) {
      return data;
    });
  }

  function update() {

    var localConfig = config;

    var repos = Object.keys(localConfig.repos);

    var multiRepo = repos.length > 1;

    var pullsUrl = function(repo) {
      return 'https://api.github.com/repos/' + localConfig.owner + '/' + repo + '/pulls';
    };

    var requests = $.map(repos, function(repo) {
      return [github(pullsUrl(repo)), github(pullsUrl(repo), {
        base: localConfig.repos[repo].closedBranch || 'develop',
        state: 'closed'
      })]
    });

    $.when.apply($, requests)
      .then(function() {
        var all = $.makeArray(arguments)
        .reduce(function(prev, curr) {
          return prev.concat(curr);
        }, [])
        .map(function(pull) {
          var open = pull.state === 'open';

          return {
            number: pull.number,
            url: pull.html_url,
            open: open,
            title: pull.title,
            body: pull.body,
            time: moment(pull[(open ? 'updated' : 'closed') + '_at']),
            user: pull.user.login,
            avatar: pull.user.avatar_url,
            assignee: pull.assignee,
            from: pull.head.label,
            to: stripOwner(pull.base.label, localConfig.owner),
            repo: pull.base.repo.name,
            urls: {
              detail: pull.url,
              status: pull.statuses_url,
              comments: pull.comments_url
            }
          };
        })
        .sort(function(a, b) {
          if (a.open && !b.open) { return -1 }
          if (!a.open && b.open) { return 1 }
          return a.time.isAfter(b.time) ? -1 : 1;
        })
        .reduce(function(arr, pull) {
          return pull.open || arr.length < 6 ? arr.concat(pull) : arr;
        }, [])
        .map(function(pull) {
          if (!pull.open) {
            return pull;
          }

          var requests = [github(pull.urls.detail).then(function(detail) {
            pull.mergeable = !!detail.mergeable;
          }), github(pull.urls.status).then(function(status) {
            pull.build = status.length ? status[0].state : '';
          })];

          if (localConfig.repos[pull.repo].trustComment
            && $.isArray(localConfig.trustedUsers)
            && localConfig.trustedUsers.length > 0
            && !~localConfig.trustedUsers.indexOf(pull.user)) {
            requests.push(github(pull.urls.comments).then(function(comments) {
              pull.trusted = comments.some(function(comment) {
                return ~comment.body.toLowerCase().indexOf(localConfig.repos[pull.repo].trustComment.toLowerCase());
              });
            }))
          }
          else {
            pull.trusted = true;
          }

          return $.when.apply($, requests).then(function() { return pull });
        });

        return $.when.apply($, all);
      }).then(function() {
        var arr = $.makeArray(arguments);

        var out = $('#out').empty();

        $('#mainTitle, title').text(config.title + ' Pull Requests [' + arr.reduce(function(val, pull) {
          return val + pull.open;
        }, 0) + ']');

        function formatPull(pull) {
          return tim('pullrequest', {
            titleSpan: (pull.assignee ? 'span_5_of_8' : 'span_7_of_8') + ' ' + pull.buildStatus,
            pullTo: hiliteBranch(pull.to),
            pullFrom: hiliteBranch(pull.from),
            isClosed: !pull.open,
            isPending: pull.buildStatus == 'pending',
            isAssigned: !!pull.assignee,
            isUntrusted: pull.open && !pull.trusted,
            hasBody: !!pull.body,
            fromNow: pull.time.fromNow(),
            multiRepo: Object.keys(localConfig.repos).length > 1,
            pr: pull
          });
        }

        arr.forEach(function(pull) {
          pull.buildStatus =  pull.open ? pull.mergeable ? pull.build : 'merge-err' : '';

          out.append(formatPull(pull));

          if (pull.open && localConfig.jenkinsRoot && localConfig.repos[pull.repo].pullRequestJob && pull.buildStatus === 'pending') {
            $.ajax(localConfig.jenkinsRoot + 'job/' + localConfig.repos[pull.repo].pullRequestJob + '/api/json', {
              dataType: 'jsonp',
              jsonp: 'jsonp',
              data: {
                tree: 'builds[number,url,actions[parameters[name,value]],timestamp,estimatedDuration,result,building]'
              },
              cache: false
            }).done(function (builder) {
              var found = false;
              builder.builds.every(function(build) {
                if (build.actions.some(function(action) {
                  return action.parameters != null && action.parameters.length && action.parameters.some(function(param) {
                    return param.name == 'ghprbPullId' && param.value == pull.number;
                  });
                })) {
                  var timeTaken = new Date().getTime() - build.timestamp;
                  var timeLeft = build.estimatedDuration - timeTaken;

                  var progressBarStyle = $('#prog_' + pull.number)[0].style;
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
    tim.dom({attr:'data-tim'});
    updateConfig().then(update);
  };
})();
