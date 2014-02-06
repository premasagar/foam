/**
 * @license
 * Copyright 2014 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

MementoMgr.BACK.iconUrl = 'images/back.png';
MementoMgr.FORTH.iconUrl = 'images/forth.png';
MementoMgr.BACK.label = '';
MementoMgr.FORTH.label = '';
MementoMgr.BACK.help = '';
MementoMgr.FORTH.help = '';

var Browser = Model.create({
  name: 'Browser',

  extendsModel: 'AbstractView',

  properties: [
    {
      name: 'project'
    },
    {
      name: 'qbug',
      scope: 'project',
      defaultValueFn: function() { return this.project.qbug; }
    },
    {
      name: 'projectName',
      scope: 'project',
      defaultValueFn: function() { return this.project.projectName; }
    },
    {
      name: 'summary',
      scope: 'project',
      defaultValueFn: function() { return this.project.summary; }
    },
    {
      name: 'url',
      scope: 'project',
      defaultValueFn: function() { return this.project.url; }
    },
    {
      name: 'userView',
      valueFactory: function() {
        var view = TextFieldView.create(QUser.EMAIL);
        view.copyFrom({
          mode: 'read-only',
          escapeHtml: true
        });
        return view;
      },
      postSet: function(newValue, oldValue) {
        // TODO clean this up when scopes are implemented.
        newValue.setValue(this.project.user.propertyValue('email'));
      }
    },
    {
      name: 'IssueDAO',
      scope: 'project',
      defaultValueFn: function() { return this.project.IssueDAO; }
    },
    {
      name: 'syncManager',
      scope: 'project',
      defaultValueFn: function() { return this.project.syncManager; }
    },

    {
      name: 'zoom',
      help: 'Zoom ratio of Browser contents.',
      defaultValue: '1',
      postSet: function() {
        this.updateZoom();
      }
    },
    {
      name: 'rowSelection',
      valueFactory: function() { return SimpleValue.create(); }
    },
    {
      name: 'window'
    },
    {
      name: 'timer',
      valueFactory: function() { return Timer.create(); }
    },
    {
      name: 'countField',
      type: 'TextFieldView',
      valueFactory: function() {
        return TextFieldView.create({
          name: 'count',
          className: 'crbugCount',
          mode: 'read-only',
          displayWidth: 40
        });
      }
    },
    {
      name: 'view',
      memorable: true,
      valueFactory: function() { return createView(this.rowSelection, this); }
    },
    {
      name: 'mementoMgr',
      valueFactory: function() { return this.mementoMgr = MementoMgr.create({memorable: this}); }
    },
    {
      name: 'searchChoice',
      memorable: true,
      valueFactory: function() {
        return ChoiceView.create({
          helpText: 'Search within:',
          choices:[
            ['',                                         '&nbsp;All issues'],
            ['status=New,Accepted,Started',              '&nbsp;Open issues'],
            ['owner=me status=New,Accepted,Started',     '&nbsp;Open and owned by me'],
            ['status=New,Accepted,Started reporter=me',  '&nbsp;Open and reported by me'],
            ['status=New,Accepted,Started is:starred',   '&nbsp;Open and starred by me'],
            ['status=New,Accepted,Started commentby:me', '&nbsp;Open and comment by me'],
            ['status=New',                               '&nbsp;New issues'],
            ['status=Fixed,Done',                        '&nbsp;Issues to verify']
          ]});
      }
    },
    {
      name: 'searchField',
      memorable: true,
      valueFactory: function() { return TextFieldView.create({ name: 'search', displayWidth: 20 }); }
    },
    {
      name: 'refreshImg',
      valueFactory: function() {
        return ImageView.create({value: SimpleValue.create('images/refresh.png')});
      }
    },
    {
      name: 'logo',
      valueFactory: function() {
        return ImageView.create({value: SimpleValue.create(this.url + '/logo')});
      }
    },
    {
      name: 'favouritesLink',
      valueFactory: function() {
        return ActionLink.create({action: this.model_.FAVOURITES, value: SimpleValue.create(this)});
      }
    },
    {
      name: 'favouritesMenu'
    }
  ],

  listeners: [
    {
      model_: 'Method',
      name: 'performQuery',
      animate: true,
      code: function(evt) {
        this.maybeImportCrbugUrl(this.searchField.value.get());

        this.search(AND(
          QueryParser.parseString(this.searchChoice.value.get()) || TRUE,
          QueryParser.parseString(this.searchField.value.get()) || TRUE
        ).partialEval());
      }
    },
    {
      model_: 'Method',
      name: 'layout',
      code: function() {
// TODO: fix
        var H = window.innerHeight;
        this.view.$.style.height = (H-this.view.$.offsetTop-30) + 'px';

        console.log(this.crbugUrl());
      }
    },
    {
      model_: 'Method',
      name: 'keyPress',
      code: function(e) {
        if ( e.ctrlKey && e.shiftKey ) {
          if ( e.keyCode == 189 ) this.zoomOut();
          if ( e.keyCode == 187 ) this.zoomIn();
        }
      }
    }
  ],

  actions: [
    {
      model_: 'Action',
      name:  'zoomIn',
      action: function() {
        this.zoom *= 1.1;
      }
    },
    {
      model_: 'Action',
      name:  'zoomOut',
      action: function() {
        this.zoom *= 0.9;
      }
    },
    {
      model_: 'Action',
      name:  'zoomReset',
      action: function() {
        this.zoom = 1.0;
      }
    },
    {
      model_: 'Action',
      name:  'link',
      label: '',
      iconUrl: 'images/link.svg',
      help:  'Link to code.google.com', // disable until tooltips work better
      action: function() {
        var url = this.crbugUrl();
        console.log(url);
        this.openURL(url);
      }
    },
    {
      model_: 'Action',
      name:  'launchBrowser',
//      iconUrl: 'images/link.svg',
      help:  'Link',
      action: function() {
        this.project.launchBrowser();
      }
    },
    {
      model_: 'Action',
      name:  'launchSync',
      label: 'Sync Status',
      action: function() {
        console.log('launch sync');
        this.project.launchSync();
      }
    },
    {
      model_: 'Action',
      name: 'favourites',
      label: 'My Favourites <small>▼</small>',
      action: function() {
        if ( this.favouritesMenu ) {
          this.favouritesMenu.close();
          return;
        }

        var view = ToolbarView.create({
          horizontal: false,
          value: SimpleValue.create(this),
          document: this.window.document
        });

        view.addChild(
          StaticHTML.create({ content: '<b>Projects</b>' }));
        view.addActions(
          this.project.user.preferredProjects.map(function(p) {
            return Action.create({
              name: p,
              action: function() {
                this.qbug.launchBrowser(p);
              }
            });
          }));

        view.addSeparator();
        view.addAction(this.model_.FIND_PROJECTS);
        view.addAction(this.model_.CREATE_PROJECT);

        view.addSeparator();
        view.addAction(this.model_.CONFIG_PROJECTS);

        view.left = this.favouritesLink.$.offsetLeft;
        view.top = this.favouritesLink.$.offsetTop + this.favouritesLink.$.offsetHeight;
        view.openAsMenu();

        var self = this;
        view.subscribe('close', function() {
          self.favouritesMenu = '';
        });

        this.favouritesMenu = view;
      }
    },
    {
      model_: 'Action',
      name: 'findProjects',
      label: 'Find open source projects...',
      action: function() {
        this.openURL('https://code.google.com/hosting/');
      }
    },
    {
      model_: 'Action',
      name: 'createProject',
      label: 'Create a project...',
      action: function() {
        this.openURL('https://code.google.com/hosting/createProject');
      }
    },
    {
      model_: 'Action',
      name: 'configProjects',
      label: 'Configure projects...',
      action: function() {
        this.project.launchConfigProjects();
      }
    },
    {
      name: 'previewID'
    }
  ],

  methods: {
    initHTML: function() {
      this.SUPER();

      this.window.addEventListener('resize', this.layout, false);

      this.searchChoice.value.addListener(this.performQuery);
      this.searchField.value.addListener(this.performQuery);

      this.syncManager.propertyValue('isSyncing').addListener(function() {
        if ( this.syncManager.isSyncing ) {
          this.timer.step();
          this.timer.start();
        } else {
          this.timer.stop();
          this.view.choice = this.view.choice;
        }
      }.bind(this));

      this.rowSelection.addListener(function(_,_,_,issue) {
        var url = this.url + '/issues/detail?id=' + issue.id;
        this.openURL(url);
      }.bind(this));

      this.refreshImg.$.onclick = this.syncManager.forceSync.bind(this.syncManager);

      var timer = this.timer;
      Events.dynamic(function() {
        this.refreshImg.$.style.webkitTransform = 'rotate(' + timer.i + 'deg)';
      }.bind(this));

      this.window.document.addEventListener('mousemove', function(evt) {
        if ( this.currentPreview && ! this.currentPreview.$.contains(evt.target) && ! this.view.$.contains(evt.target) ) {
          this.preview(null);
        }
      }.bind(this));

      this.layout();

      this.searchChoice.choice = this.searchChoice.choices[1];

      this.window.document.addEventListener('keyup', this.keyPress);
    },

    /** Open a preview window when the user hovers over an issue id. **/
    preview: function(e, id) {
      if ( id === this.previewID ) return;
      if ( this.currentPreview ) this.currentPreview.close();
      this.previewID = id;
      if ( ! id ) {
        this.currentPreview = null;
        return;
      }

      var self = this;
      this.IssueDAO.find(id, {
        put: function(obj) {
          obj = obj.clone();
          var HEIGHT = 400;
          var screenHeight = self.view.$.ownerDocument.defaultView.innerHeight;

          var v = QIssuePreviewView.create({
            value: SimpleValue.create(obj),
            QIssueCommentDAO: self.project.issueCommentDAO(id),
            QIssueDAO: self.IssueDAO,
            url: self.url
          });

          var popup = self.currentPreview = PopupView.create({
            x: e.x + 25,
            y: Math.min(
              screenHeight-15-HEIGHT,
              Math.max(
                100,
                Math.min(screenHeight-HEIGHT-15, e.y - HEIGHT/2))),
            height: HEIGHT,
            view: v
          });

          popup.open(self.view);
        }
      });
    },

    updateZoom: function() {
      this.window.document.body.style.zoom = this.zoom;
      this.layout();
    },

    /** Filter data with the supplied predicate, or select all data if null. **/
    search: function(p) {
      if ( p ) console.log('SEARCH: ', p.toSQL());
      this.view.dao = p ? this.IssueDAO.where(p) : this.IssueDAO;
      var self = this;
      apar(
        this.view.dao.select(COUNT()),
        this.IssueDAO.select(COUNT()))(function(x, y) {
          self.countField.value.value = x.count.toLocaleString() + ' of ' + y.count.toLocaleString() + ' selected';
        }
      );

      console.log(this.crbugUrl());
    },

    // Crbug doesn't order canned-queries sequentially
    idToCrbugCan: [1, 2, 3, 4, 5, 8, 6, 7],
    crbugCanToId: [0, 0, 1, 2, 3, 4, 6, 7, 5],

    /** Import a cr(1)bug URL. **/
    maybeImportCrbugUrl: function(url) {
      var regex = new RegExp("https://code.google.com/p/([^/]+)/issues/list(\\?(.*))?");
      var match = regex.exec(url);

      if ( ! match ) return;

      var project = match[1];

      if ( project == this.projectName ) {
        var params = match[3].split('&');

        var memento = {};
        for ( var i = 0 ; i < params.length ; i++ ) {
          var param = params[i];
          var keyValue = param.split('=');
          memento[decodeURIComponent(keyValue[0])] =
            decodeURIComponent(keyValue[1]).replace(/\+/g, ' ');
        }

        if ( memento.hasOwnProperty('can') ) memento.can = this.crbugCanToId[memento.can];

        this.memento = memento;
      } else {
        this.qbug.launchBrowser(project, url)
      }
    },

    /** Convert current state to a cr(1)bug URL. **/
    crbugUrl: function() {
      var u = this.url + '/issues/list';
      var m = this.memento;
      var d = '?';

      // Replace short-names will fullnames that crbug will understand
      if ( m.q ) m.q = (QueryParser.parseString(this.memento.q) || TRUE).partialEval().toMQL();
      if ( m.hasOwnProperty('can') ) m.can = this.idToCrbugCan[m.can];

      for ( var key in m ) {
        u += d;

        u += key + '=' + encodeURIComponent(m[key]);
        d = '&';
      }

      return u;
    },

    openURL: function(url) {
      document.location = url;
    }
  },

  templates: [
    { name: "toHTML" }
  ]
});


/** A subclass of Browser which works as a Chrome-App. **/
var ChromeAppBrowser = Model.create({
  name: 'ChromeAppBrowser',

  extendsModel: 'Browser',
  
  methods: {
    openURL: function(url) {
      console.log('openURL: ', url);
      window.open(url);
    },
  }
  
});
