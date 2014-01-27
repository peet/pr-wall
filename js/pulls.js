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
    });
  };

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
            to: pullRequest.base.label
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
      }).done(function() {
        var arr = $.makeArray(arguments);

        var out = $('#out').empty();

        $('#mainTitle, title').text(config.title + ' Pull Requests [' + arr.reduce(function(val, pr) {
          return val + +pr.open;
        }, 0) + ']');

        arr.forEach(function(pr) {

          var buildStatus = '';
          if (pr.open){
            if (pr.mergeable){
              buildStatus = pr.build;
            } else {
              buildStatus = 'merge-err';
            };

          }

          var titleSpan = (pr.assignee ? 'span_5_of_8' : 'span_7_of_8') + ' ' + buildStatus;

          var div = $('<div class="section group row ' + (pr.open ? '' : 'pr-closed') + '"></div>');

          div.append('<div class="col span_1_of_8 block img-container"><img src="' + pr.avatar + '"><br>' + pr.user + '</div>');
          div.append('<div class="col span_7_of_8 nowrap block">' +
            '<div class="section group">' +
            '<div class="col ' + titleSpan + ' title"><a href="' + pr.url + '">' + pr.title + '</a></div>' +
            (pr.assignee ? '<div class="col span_2_of_8 assignee"><img src="' + pr.assignee.avatar_url + '">' + pr.assignee.login + '</div>' : '') +
            '<div class="col span_1_of_8 when">' + pr.time + '</div>' +
            '</div>' +
            (pr.body ?
              '<div class="section group">' +
                '<div class="col span_8_of_8 body">' + pr.body + '</div>' +
                '</div>' : '') +
            '<div class="section group">' +
            '<div class="col span_2_of_8 to">' + pr.to + '</div><div class="col span_5_of_8">&lt;&lt;-- ' + pr.from + '</div>' +

              //'</div><div class="col span_1_of_8 build ' + pr.build + '"></div>' +
            '</div>' +
            '</div>');

          out.append(div);
        });

        setTimeout(showPulls, 30000);
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

