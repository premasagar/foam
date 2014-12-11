/**
 * @license
 * Copyright 2013 Google Inc. All Rights Reserved.
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

// TODO: used in saturnmail/bg.js, see if can be merged with Action keyboard support.
function KeyboardShortcutController(win, view) {
  this.contexts_ = {};
  this.body_ = {};

  this.processView_(view);

  win.addEventListener('keydown', this.processKey_.bind(this));
}

KeyboardShortcutController.prototype.processView_ = function(view) {
  var keyShortcuts = view.shortcuts;
  if (keyShortcuts) {
    keyShortcuts.forEach(function(nav) {
      var key = nav[0];
      var cb = nav[1];
      var context = nav[2];
      this.addAccelerator(key, cb, context);
    }.bind(this));
  }

  try {
    var children = view.children;
    children.forEach(this.processView_.bind(this));
  } catch(e) { console.log(e); }
};

KeyboardShortcutController.prototype.addAccelerator = function(key, callback, context) {
  if (context) {
    if (typeof(context) != 'string')
      throw "Context must be an identifier for a DOM node.";
    if (!(context in this.contexts_))
      this.contexts_[context] = {};

    this.contexts_[context][key] = callback;
  } else {
    this.body_[key] = callback;
  }
};

KeyboardShortcutController.prototype.shouldIgnoreKeyEventsForTarget_ = function(event) {
  var target = event.target;
  return target.isContentEditable || target.tagName == 'INPUT' || target.tagName == 'TEXTAREA';
};

KeyboardShortcutController.prototype.processKey_ = function(event) {
  if (this.shouldIgnoreKeyEventsForTarget_(event))
    return;

  for ( var node = event.target; node && node != document.body; node = node.parentNode ) {
    var id = node.id;
    if ( id && (id in this.contexts_) ) {
      var cbs =  this.contexts_[id];
      if ( event.keyIdentifier in cbs ) {
        var cb = cbs[event.keyIdentifier];
        cb(event);
        event.preventDefault();
        return;
      }
    }
  }
  console.log('Looking for ' + event.keyIdentifier);
  if ( event.keyIdentifier in this.body_ ) {
    var cb = this.body_[event.keyIdentifier];
    cb(event);
    event.preventDefault();
  }
};


var DOM = {
  /** Instantiate FOAM Objects in a document. **/
  init: function(X) {
    if ( ! X.document.FOAM_OBJECTS ) X.document.FOAM_OBJECTS = {};

    var fs = X.document.querySelectorAll('foam');
    for ( var i = 0 ; i < fs.length ; i++ ) {
      var e = fs[i];
      // console.log(e.getAttribute('model'), e.getAttribute('view'));
      FOAM.lookup(e.getAttribute('view'), X);
      FOAM.lookup(e.getAttribute('model'), X);
    }
    var models = [];
    for ( var key in USED_MODELS ) {
      models.push(arequire(key));
    }

    aseq(apar.apply(null, models), function(ret) {
      for ( var i = 0 ; i < fs.length ; i++ ) {
        this.initElement(fs[i], X, X.document);
      }
    }.bind(this))();
  },

  initElementChildren: function(e, X) {
    var a = [];

    for ( var i = 0 ; i < e.children.length ; i++ ) {
      var c = e.children[i];

      if ( c.tagName === 'FOAM' ) {
        a.push(DOM.initElement(c, X));
      }
    }

    return a;
  },

  /** opt_document -- if supplied the object's view will be added to the document. **/
  initElement: function(e, X, opt_document) {
    // If was a sub-object for an object that has already been displayed,
    // then it will no longer be in the DOM and doesn't need to be shown.
    if ( opt_document && ! opt_document.body.contains(e) ) return;

    var args = {};
    var modelName = e.getAttribute('model');
    var model = FOAM.lookup(modelName, X);

    if ( ! model ) {
      console.error('Unknown Model: ', modelName);
      e.outerHTML = 'Unknown Model: ' + modelName;
      return;
    }

    // This is because of a bug that the model.properties isn't populated
    // with the parent model's properties until after the prototype is
    // created.  TODO: remove after FO
    model.getPrototype();

    for ( var i = 0 ; i < e.attributes.length ; i++ ) {
      var a   = e.attributes[i];
      var key = a.name;
      var val = a.value;
      var p   = model.getProperty(key);

      if ( p ) {
        if ( val.startsWith('#') ) {
          val = val.substring(1);
          val = X.$(val);
        }
        args[key] = val;
      } else {
        if ( ! {model:true, view:true, id:true, oninit:true, showactions:true}[key] ) {
          console.log('unknown attribute: ', key);
        }
      }
    }

    function findProperty(name) {
      for ( var j = 0 ; j < model.properties.length ; j++ ) {
        var p = model.properties[j];

        if ( p.name.toUpperCase() == name ) return p;
      }

      return null;
    }

    var obj = model.create(undefined, X);
    obj.fromElement(e);

    var onLoad = e.getAttribute('oninit');
    if ( onLoad ) {
      Function(onLoad).bind(obj)();
    }

    if ( opt_document ) {
      var view;
      if ( View.isInstance(obj) || CView.isInstance(obj) ) {
        view = obj;
      } else {
        var viewName = e.getAttribute('view');
        var viewModel = viewName ? FOAM.lookup(viewName, X) : DetailView;
        view = viewModel.create({model: model, data: obj});
        if ( ! viewName ) {
          // default value is 'true' if 'showActions' isn't specified.
          var a = e.getAttribute('showActions');

          view.showActions = a ?
            a.equalsIC('y') || a.equalsIC('yes') || a.equalsIC('true') || a.equalsIC('t') :
            true ;
        }
      }

      if ( e.id ) opt_document.FOAM_OBJECTS[e.id] = obj;
      obj.view_ = view;
      e.outerHTML = view.toHTML();
      view.initHTML();
    }

    return obj;
  },

  setClass: function(e, className, opt_enabled) {
    var oldClassName = e.className || '';
    var enabled = opt_enabled === undefined ? true : opt_enabled;
    e.className = oldClassName.replace(' ' + className, '').replace(className, '');
    if ( enabled ) e.className = e.className + ' ' + className;
  }
};


window.addEventListener('load', function() { DOM.init(X); }, false);


// TODO: document and make non-global
/** Convert a style size to an Int.  Ex. '10px' to 10. **/
function toNum(p) { return p.replace ? parseInt(p.replace('px','')) : p; };


// View
CLASS({
  name: 'DataProviderTrait',
  package: 'foam.experimental.views',
  
  documentation: function() {/*
    Trait for providers of a data property. It contains a $$DOC{ref:'.data'}
    property and exports it by reference to the context.
  */},
  
  //exports: ['data$ as data$'],
  
  properties: [
    {
      name: 'childData',
      help: 'Child data value provided to consumers.',
      documentation: function() {/* 
        The value provided to consumers child (children) of this provider.
      */},
    },
    {
      name: 'originalContext_',
      hidden: true,
      factory: function() {
        return this.X;
      }
    }
  ],

  methods: {
    init: function() {
      this.SUPER();
      
      // juggle context and export data$
      this.X = this.originalContext_.sub({data$: this.childData$});
    },
       
    destroy: function() {
      /* Called to tear down children. Also let the previous child context
        be garbage collected. */
      this.X = this.originalContext_;
      if (arguments.callee.caller.super_) this.SUPER();
    },
    
    construct: function() {
      /* Called to construct new content and children. Create a new context
         for the children and export our data. */
      if (arguments.callee.caller.super_) this.SUPER();
      this.X = this.originalContext_.sub({data$: this.childData$});
    }
  }
  
});
 
  
CLASS({
  name: 'DataConsumerTrait',
  package: 'foam.experimental.views',
  
  documentation: function() {/*
    Trait for consumers of a data property. It contains 
    an $$DOC{ref:'.data'}
    property and imports it by reference from the context.
  */},
  
  imports: ['data$'],
  
  properties: [
    {
      name: 'data',
      help: 'The incoming data for this view to use.',
    },
  ]

});

CLASS({
  name: 'ChildTreeTrait',
  package: 'foam.experimental.views',
  
  properties: [
    {
      name: 'parent',
      type: 'foam.experimental.views.ChildTreeTrait',
      hidden: true
    },
    {
      name: 'children',
      type: 'Array[foam.experimental.views.ChildTreeTrait]',
      factory: function() { return []; },
      documentation: function() {/*
        $$DOC{ref:'ChildTreeTrait',usePlural:true} children are arranged in a tree.
      */}
    }
  ],
  
  methods: {
    addChild: function(child) {
      /*
        Maintains the tree structure of $$DOC{ref:'View',usePlural:true}. When
        a sub-$$DOC{ref:'View'} is created, add it to the tree with this method.
      */
      if (arguments.callee.caller.super_) this.SUPER(child);

      // Check prevents duplicate addChild() calls,
      // which can happen when you use creatView() to create a sub-view (and it calls addChild)
      // and then you write the View using TemplateOutput (which also calls addChild).
      // That should all be cleaned up and all outputHTML() methods should use TemplateOutput.
      if ( this.children.indexOf(child) != -1 ) return;

      try {
        child.parent = this;
      } catch (x) { console.log(x); }

      var children = this.children;
      children.push(child);
      this.children = children;

      return this;
    },

    removeChild: function(child) {
      /*
        Maintains the tree structure of $$DOC{ref:'View',usePlural:true}. When
        a sub-$$DOC{ref:'View'} is destroyed, remove it from the tree with this method.
      */
      if (arguments.callee.caller.super_) this.SUPER(child);
      
      child.destroy();
      this.children.deleteI(child);
      child.parent = undefined;

      return this;
    },

    addChildren: function() {
      /* Adds multiple children at once. */
      Array.prototype.forEach.call(arguments, this.addChild.bind(this));

      return this;
    },
    
    destroy: function() {
      if (arguments.callee.caller.super_) this.SUPER();
      
      var list = this.children.slice();
      Array.prototype.forEach.call(arguments, this.removeChild.bind(this));

      return this;      
    },
    
    construct: function() {
      /* Template method. After a destroy(), construct() is called to fill in the object again. If
         any special children need to be re-created, do it here. */
      if (arguments.callee.caller.super_) this.SUPER();

      return this;      
    },
    
    deepPublish: function(topic) {
      /*
       Publish an event and cause all children to publish as well.
       */
      var count = this.publish.apply(this, arguments);

      if ( this.children ) {
        for ( var i = 0 ; i < this.children.length ; i++ ) {
          var child = this.children[i];
          count += child.deepPublish.apply(child, arguments);
        }
      }

      return count;
    }

  }
});


CLASS({
  name: 'BaseView',
  label: 'View',
  package: 'foam.experimental.views',
  
  traits: ['foam.experimental.views.DataProviderTrait',
           'foam.experimental.views.ChildTreeTrait'],

  requires: ['SimpleValue'],
           
  documentation: function() {/*
    <p>$$DOC{ref:'View',usePlural:true} render data. This could be a specific
       $$DOC{ref:'Model'} or a $$DOC{ref:'DAO'}. In the case of $$DOC{ref:'DetailView'},
       <em>any</em> $$DOC{ref:'Model'} can be rendered by walking through the
       $$DOC{ref:'Property',usePlural:true} of the data.
    </p>
    <p>$$DOC{ref:'View'} instances are arranged in a tree with parent-child links.
       This represents containment in most cases, where a sub-view appears inside
       its parent.
    </p>
  */},
  
  properties: [
    {
      name: 'selfX',
      help: 'Context with data$ = self',
      documentation: function() {/* 
        The context provided to consumers (children) of this provider when constructed
        from properties of this view.
      */},
    },
  ],

  constants: {
    // TODO?: Model as Topics
    ON_HIDE: ['onHide'], // Indicates that the View has been hidden
    ON_SHOW: ['onShow']  // Indicates that the View is now being reshown
  },

  methods: {
    
    init: function() {
      this.SUPER();
      this.construct();
    },
    
    construct: function() {
      /* Create an additional context for children based on properties of this,
        rather than data. */
      this.SUPER();
      this.selfX = this.originalContext_.sub({data$: this.SimpleValue.create(this)});
    },

    toView_: function() { return this; },

    viewModel: function() {
      /* The $$DOC{ref:'Model'} definition of this $$DOC{ref:'View'}. */
      return this.model_;
    },

    createView: function(prop, opt_args) {
      /* Creates a sub-$$DOC{ref:'View'} from $$DOC{ref:'Property'} info. */
      var X = ( opt_args && opt_args.X ) || this.X;
      var v = X.PropertyView.create({prop: prop, args: opt_args}, X);
      this.addChild(v);
      return v;
    },
    
    createActionView: function(action, opt_args) {
      /* Creates a sub-$$DOC{ref:'View'} from $$DOC{ref:'Property'} info
        specifically for $$DOC{ref:'Action',usePlural:true}. */
      var X = ( opt_args && opt_args.X ) || this.X;
      var modelName = opt_args && opt_args.model_ ?
        opt_args.model_ :
        'ActionButton'  ;
      var v = X[modelName].create({action: action}).copyFrom(opt_args);

      this[action.name + 'View'] = v;

      return v;
    },
    
    createTemplateView: function(name, opt_args) {
      /*
        Used by the $$DOC{ref:'Template',text:'$$propName'} sub-$$DOC{ref:'View'}
        creation tag in $$DOC{ref:'Template',usePlural:true}.
      */
      
      // Can't call viewModel() here, since DetailView overrides it but relies
      // on falling back on view's implementation. TODO(jacksonic): figure it out
      var o = this.model_[name.constantize()];
      
      if ( ! o ) throw 'Unknown View Name: ' + name;

      var args = opt_args; // opt_args ? opt_args.clone() : {};
      // for properties of this view, use our 'self' property as child data
      args.X = this.selfX;

      var v;
      if ( Action.isInstance(o) )
        v = this.createActionView(o, args);
      else
        v = this.createView(o, args);

      return v;
    },

    destroy: function() {
      /* Cleans up the DOM when regenerating content. You should call this before
         creating new HTML in your $$DOC{ref:'.toInnerHTML'} or $$DOC{ref:'.toHTML'}. */
      // TODO: remove listeners
      this.invokeDestructors();
      for ( var i = 0; i < this.children.length; i++ ) {
        this.children[i].destroy();
      }
      delete this.instance_.$;
      
      this.SUPER();
      // TODO(jacksonic): we often call destroy() in templates, but not the new construct()
      this.selfX = this.originalContext_.sub({data$: this.SimpleValue.create(this)});
    },

    close: function() {
      /* Call when permanently closing the $$DOC{ref:'View'}. */
      this.$ && this.$.remove();
      this.destroy();
      this.publish('closed');
    }
  }
});


CLASS({
  name: 'View',
  label: 'HTMLView',
  extendsModel: 'foam.experimental.views.BaseView',
  traits: ['foam.experimental.views.HTMLViewTrait'],

  documentation: function() {/*
    <p>$$DOC{ref:'View',usePlural:true} render data. This could be a specific
       $$DOC{ref:'Model'} or a $$DOC{ref:'DAO'}. In the case of $$DOC{ref:'DetailView'},
       <em>any</em> $$DOC{ref:'Model'} can be rendered by walking through the
       $$DOC{ref:'Property',usePlural:true} of the data.
    </p>
    <p>$$DOC{ref:'View'} instances are arranged in a tree with parent-child links.
       This represents containment in most cases, where a sub-view appears inside
       its parent.
    </p>
    <p>HTML $$DOC{ref:'View',usePlural:true} should provide a $$DOC{ref:'.toInnerHTML'}
       $$DOC{ref:'Method'} or $$DOC{ref:'Template'}. If direct control is required,
       at minimum you must implement $$DOC{ref:'.toHTML'} and $$DOC{ref:'.initHTML'}.
    </p>
  */},
  
});

CLASS({
  name: 'HTMLViewTrait',
  label: 'HTMLViewTrait',
  package: 'foam.experimental.views',
  
  documentation: function() {/*
    The HTML implementation for $$DOC{ref:'View'}.
  */},
  
  
  properties: [
    {
      name:  'id',
      label: 'Element ID',
      type:  'String',
      factory: function() { return this.instance_.id || this.nextID(); },
      documentation: function() {/*
        The DOM element id for the outermost tag of
        this $$DOC{ref:'View'}.
      */}
    },
    {
      name:   'shortcuts',
      type:   'Array[Shortcut]',
      factory: function() { return []; },
      documentation: function() {/*
        Keyboard shortcuts for the view. TODO ???
      */}
    },
    {
      name:   '$',
      hidden: true,
      mode:   "read-only",
      getter: function() {
        return this.instance_.$ ? this.instance_.$ : this.instance_.$ = this.X.document.getElementById(this.id);
      },
      help: 'DOM Element.'
    },
    {
      name: 'tagName',
      defaultValue: 'span',
      documentation: function() {/*
          The HTML tag name to use for HTML $$DOC{ref:'View',usePlural:true}.
      */}
    },
    {
      name: 'className',
      help: 'CSS class name(s), space separated.',
      defaultValue: '',
      documentation: function() {/*
          The CSS class names to use for HTML $$DOC{ref:'View',usePlural:true}.
          Separate class names with spaces. Each instance of a $$DOC{ref:'View'}
          may have different classes specified.
      */}
    },
    {
      name: 'tooltip'
    },
    {
      name: 'extraClassName',
      defaultValue: '',
      documentation: function() {/*
          For custom $$DOC{ref:'View',usePlural:true}, you may wish to add standard
          CSS classes in addition to user-specified ones. Set those here and
          they will be appended to those from $$DOC{ref:'.className'}.
      */}
    },
    {
      model_: 'BooleanProperty',
      name: 'showActions',
      defaultValue: false,
      postSet: function(oldValue, showActions) {
        // TODO: No way to remove the decorator.
        if ( ! oldValue && showActions ) {
          this.addDecorator(this.X.ActionBorder.create());
        }
      },
      documentation: function() {/*
          If $$DOC{ref:'Action',usePlural:true} are set on this $$DOC{ref:'View'},
          this property enables their automatic display in an $$DOC{ref:'ActionBorder'}.
          If you do not want to show $$DOC{ref:'Action',usePlural:true} or want
          to show them in a different way, leave this false.
      */}
    },
    {
      name: 'initializers_',
      factory: function() { return []; },
      documentation: function() {/*
          When creating new HTML content, intializers are run. This corresponds
          to the lifecycle of the HTML (which may be replaced by toHTML() at any
          time), not the lifecycle of this $$DOC{ref:'View'}.
      */}
    },
    {
      name: 'destructors_',
      factory: function() { return []; },
      documentation: function() {/*
          When destroying HTML content, destructors are run. This corresponds
          to the lifecycle of the HTML (which may be replaced by toHTML() at any
          time), not the lifecycle of this $$DOC{ref:'View'}.
      */}
    }
  ],

  listeners: [
    {
      name: 'openTooltip',
      code: function(e) {
        console.assert(! this.tooltip_, 'Tooltip already defined');
        this.tooltip_ = this.X.Tooltip.create({
          text:   this.tooltip,
          target: this.$
        });
      }
    },
    {
      name: 'closeTooltip',
      code: function(e) {
        if ( this.tooltip_ ) {
          this.tooltip_.close();
          this.tooltip_ = null;
        }
      }
    },
    {
      name: 'onKeyboardShortcut',
      code: function(evt) {
        // console.log('***** key: ', this.evtToKeyCode(evt));
        var action = this.keyMap_[this.evtToKeyCode(evt)];
        if ( action ) {
          action();
          evt.preventDefault();
        }
      },
      documentation: function() {/*
          Automatic mapping of keyboard events to $$DOC{ref:'Action'} trigger.
          To handle keyboard shortcuts, create and attach $$DOC{ref:'Action',usePlural:true}
          to your $$DOC{ref:'View'}.
      */}
    }
  ],


  methods: {
    
    toView_: function() { return this; },

    strToHTML: function(str) {
      /*
        Escape the string to make it HTML safe.
        */
      return XMLUtil.escape(str.toString())
    },

    cssClassAttr: function() {
      /*
        Returns the full CSS class to use for the $$DOC{ref:'View'} DOM element.
       */
      if ( ! this.className && ! this.extraClassName ) return '';

      var s = ' class="';
      if ( this.className ) {
        s += this.className
        if ( this.extraClassName ) s += ' ';
      }
      if ( this.extraClassName ) s += this.extraClassName;

      return s + '"';
    },

    dynamicTag: function(tagName, f) {
      /*
        Creates a dynamic HTML tag whose content will be automatically updated.
       */
      var id = this.nextID();

      this.addInitializer(function() {
        this.X.dynamic(function() {
          var html = f();
          var e = this.X.$(id);
          if ( e ) e.innerHTML = html;
        }.bind(this));
      }.bind(this));

      return '<' + tagName + ' id="' + id + '"></' + tagName + '>';
    },


    focus: function() {
      /* Cause the view to take focus. */
      if ( this.$ && this.$.focus ) this.$.focus();
    },


    addShortcut: function(key, callback, context) {
      /* Add a keyboard shortcut. */
      this.shortcuts.push([key, callback, context]);
    },

    // TODO: make use new static_ scope when available
    nextID: function() {
      /* Convenience method to return unique DOM element ids. */
      return "viewNew" + (arguments.callee._nextId = (arguments.callee._nextId || 0) + 1);
    },

    addInitializer: function(f) {
      /* Adds a DOM initializer */
      this.initializers_.push(f);
    },
    addDestructor: function(f) {
      /* Adds a DOM destructor. */
      this.destructors_.push(f);
    },

    tapClick: function() {
    },

    on: function(event, listener, opt_id) {
      /*
        <p>To create DOM event handlers, use this method to set up your listener:</p>
        <p><code>this.on('click', this.myListener);</code></p>
      */
      opt_id = opt_id || this.nextID();
      listener = listener.bind(this);

      if ( event === 'click' && this.X.gestureManager ) {
        var self = this;
        var manager = this.X.gestureManager;
        var target = this.X.GestureTarget.create({
          containerID: opt_id,
          handler: {
            tapClick: function() {
              // Create a fake event.
              return listener({
                preventDefault: function() { },
                stopPropagation: function() { }
              });
            }
          },
          gesture: 'tap'
        });

        manager.install(target);
        this.addDestructor(function() {
          manager.uninstall(target);
        });
        return opt_id;
      }

      this.addInitializer(function() {
        var e = this.X.$(opt_id);
        // if ( ! e ) console.log('Error Missing element for id: ' + opt_id + ' on event ' + event);
        if ( e ) e.addEventListener(event, listener, false);
      }.bind(this));

      return opt_id;
    },

    setAttribute: function(attributeName, valueFn, opt_id) {
      /* Set a dynamic attribute on the DOM element. */
      opt_id = opt_id || this.nextID();
      valueFn = valueFn.bind(this);
      this.addInitializer(function() {
        this.X.dynamic(valueFn, function() {
          var e = this.X.$(opt_id);
          if ( ! e ) throw EventService.UNSUBSCRIBE_EXCEPTION;
          var newValue = valueFn(e.getAttribute(attributeName));
          if ( newValue == undefined ) e.removeAttribute(attributeName);
          else e.setAttribute(attributeName, newValue);
        }.bind(this))
      }.bind(this));
    },

    setClass: function(className, predicate, opt_id) {
      /* Set a dynamic CSS class on the DOM element. */
      opt_id = opt_id || this.nextID();
      predicate = predicate.bind(this);

      this.addInitializer(function() {
        this.X.dynamic(predicate, function() {
          var e = this.X.$(opt_id);
          if ( ! e ) throw EventService.UNSUBSCRIBE_EXCEPTION;
          DOM.setClass(e, className, predicate());
        });
      }.bind(this));

      return opt_id;
    },

    setClasses: function(map, opt_id) {
      /* Set a map of dynamic CSS classes on the DOM element. Mapped as
         className: predicate.*/
      opt_id = opt_id || this.nextID();
      var keys = Objects.keys(map);
      for ( var i = 0 ; i < keys.length ; i++ ) {
        this.setClass(keys[i], map[keys[i]], opt_id);
      }

      return opt_id;
    },

    insertInElement: function(name) {
      /* Insert this View's toHTML into the Element of the supplied name. */
      var e = this.X.$(name);
      e.innerHTML = this.toHTML();
      this.initHTML();
    },

    write: function(document) {
      /*  Write the View's HTML to the provided document and then initialize. */
      document.writeln(this.toHTML());
      this.initHTML();
    },

    updateHTML: function() {
      /* Cause the HTML content to be recreated using a call to
        $$DOC{ref:'.toInnerHTML'}. */
      if ( ! this.$ ) return;

      this.destroy();
      this.$.innerHTML = this.toInnerHTML();
      this.initInnerHTML();
    },

    toInnerHTML: function() {
      /* <p>In most cases you can override this method to provide all of your HTML
        content. Calling $$DOC{ref:'.updateHTML'} will cause this method to
        be called again, regenerating your content. $$DOC{ref:'Template',usePlural:true}
        are usually called from here, or you may create a
        $$DOC{ref:'.toInnerHTML'} $$DOC{ref:'Template'}.</p>
        <p>If you are generating your content here, you may also need to override
        $$DOC{ref:'.initInnerHTML'} to create event handlers such as
        <code>this.on('click')</code>. */
      return '';
    },

    toHTML: function() {
      /* Generates the complete HTML content of this view, including outermost
        element. This element is managed by $$DOC{ref:'View'}, so in most cases
        you should use $$DOC{ref:'.toInnerHTML'} to generate your content. */
      this.invokeDestructors();
      return '<' + this.tagName + ' id="' + this.id + '"' + this.cssClassAttr() + '>' +
        this.toInnerHTML() +
        '</' + this.tagName + '>';
    },

    initHTML: function() {
      /* This must be called once after your HTML content has been inserted into
        the DOM. Calling $$DOC{ref:'.updateHTML'} will automatically call
        $$DOC{ref:'.initHTML'}. */
      this.initInnerHTML();
      this.initKeyboardShortcuts();
      this.maybeInitTooltip();
    },

    maybeInitTooltip: function() {
      if ( ! this.tooltip ) return;
      this.$.addEventListener('mouseenter', this.openTooltip);
      this.$.addEventListener('mouseleave', this.closeTooltip);
    },

    initInnerHTML: function() {
      /* Initialize this View and all of it's children. Usually just call
         $$DOC{ref:'.initHTML'} instead. When implementing a new $$DOC{ref:'View'}
         and adding listeners (including <code>this.on('click')</code>) that
         will be destroyed each time $$DOC{ref:'.toInnerHTML'} is called, you
         will have to override this $$DOC{ref:'Method'} and add them here.
       */
      // This mostly involves attaching listeners.
      // Must be called activate a view after it has been added to the DOM.

      this.invokeInitializers();
      this.initChildren();
    },

    initChildren: function() {
      /* Initialize all of the children. Usually just call
          $$DOC{ref:'.initHTML'} instead. */
      if ( this.children ) {
        // init children
        for ( var i = 0 ; i < this.children.length ; i++ ) {
          // console.log(i, 'init child: ' + this.children[i]);
          try {
            this.children[i].initHTML();
          } catch (x) {
            console.log('Error on View.child.initHTML', x, x.stack);
          }
        }
      }
    },

    invokeInitializers: function() {
      /* Calls all the DOM $$DOC{ref:'.initializers_'}. */
      for ( var i = 0 ; i < this.initializers_.length ; i++ ) this.initializers_[i]();
      this.initializers_ = [];
    },
    invokeDestructors: function() {
      /* Calls all the DOM $$DOC{ref:'.destructors_'}. */
      for ( var i = 0; i < this.destructors_.length; i++ ) this.destructors_[i]();
      this.destructors_ = [];
    },

    evtToKeyCode: function(evt) {
      /* Maps an event keycode to a string */
      var s = '';
      if ( evt.ctrlKey ) s += 'ctrl-';
      if ( evt.shiftKey ) s += 'shift-';
      s += evt.keyCode;
      return s;
    },

    initKeyboardShortcuts: function() {
      /* Initializes keyboard shortcuts. */
      var keyMap = {};
      var found  = false;
      var self   = this;

      function init(actions, opt_value) {
        actions.forEach(function(action) {
          for ( var j = 0 ; j < action.keyboardShortcuts.length ; j++ ) {
            var key = action.keyboardShortcuts[j];
            keyMap[key] = opt_value ?
              function() { action.callIfEnabled(self.X, opt_value.get()); } :
              action.callIfEnabled.bind(action, self.X, self) ;
            found = true;
          }
        });
      }

      init(this.model_.actions);
      if ( DetailView.isInstance(this) &&
          this.model &&
          this.model.actions )
        init(this.model.actions, this.childData$);

      if ( found ) {
        console.assert(this.$, 'View must define outer id when using keyboard shortcuts: ' + this.name_);
        this.keyMap_ = keyMap;
        this.$.parentElement.addEventListener('keydown', this.onKeyboardShortcut);
      }
    },

    construct: function() {
      this.SUPER();
      this.updateHTML();
    },
    
    destroy: function() {
      /* Cleans up the DOM when regenerating content. You should call this before
         creating new HTML in your $$DOC{ref:'.toInnerHTML'} or $$DOC{ref:'.toHTML'}. */
      // TODO: remove listeners   
      this.invokeDestructors();
      delete this.instance_.$;
      this.SUPER();
    },

    close: function() {
      /* Call when permanently closing the $$DOC{ref:'View'}. */
      this.$ && this.$.remove();
      this.destroy();
      this.publish('closed');
    }
  }
});



// PropertyView


CLASS({
  name: 'BasePropertyView',
  package: 'foam.experimental.views',
  extendsModel: 'foam.experimental.views.BaseView',
//   traits: ['foam.experimental.views.DataProviderTrait',
//            'foam.experimental.views.DataConsumerTrait',
//            'foam.experimental.views.ChildTreeTrait'],
  traits: ['foam.experimental.views.DataConsumerTrait'],
  
  documentation: function() {/*
    Apply this trait to a $$DOC{ref:'BaseView'} (such as $$DOC{ref:'HTMLView'}).</p>
    <p>Used by $$DOC{ref:'DetailView'} to generate a sub-$$DOC{ref:'View'} for one
    $$DOC{ref:'Property'}. The $$DOC{ref:'View'} chosen can be based off the
    $$DOC{ref:'Property.view',text:'Property.view'} value, the $$DOC{ref:'.innerView'} value, or
    $$DOC{ref:'.args'}.model_.
  */},

  properties: [
    {
      name: 'data',
      postSet: function(old, nu) {
        this.unbindData(old);
        this.bindData(nu);
      }
    },    
    {
      name: 'prop',
      type: 'Property',
      documentation: function() {/*
          The $$DOC{ref:'Property'} for which to generate a $$DOC{ref:'View'}.
      */},
      postSet: function(old, nu) {
        if (!old) this.bindData(this.data);
      }
    },
    {
      name: 'parent',
      type: 'View',
      postSet: function(_, p) {
        p[this.prop.name + 'View'] = this.view;
        if ( this.view ) this.view.parent = p;
      },
      documentation: function() {/*
        The $$DOC{ref:'View'} to use as the parent container for the new
        sub-$$DOC{ref:'View'}.
      */}
    },
    {
      name: 'innerView',
      help: 'Override for prop.view',
      documentation: function() {/*
        The optional name of the desired sub-$$DOC{ref:'View'}. If not specified,
        prop.$$DOC{ref:'Property.view'} is used.
      */}
    },
    {
      name: 'view',
      type: 'View',
      documentation: function() {/*
        The new sub-$$DOC{ref:'View'} generated for the given $$DOC{ref:'Property'}.
      */}
    },
    {
      name: 'args',
      documentation: function() {/*
        Optional arguments to be used for sub-$$DOC{ref:'View'} creation. args.model_
        in particular specifies the exact $$DOC{ref:'View'} to use.
      */}
    }
  ],

  methods: {
    
    fromElement: function(e) {
      this.view.fromElement(e);
      return this;
    },

    createViewFromProperty: function(prop) {
      /* Helper to determine the $$DOC{ref:'View'} to use. */
      var viewName = this.innerView || prop.view
      if ( ! viewName ) return this.X.TextFieldView.create(prop);
      if ( typeof viewName === 'string' ) return this.X[viewName].create(prop);
      if ( viewName.model_ && typeof viewName.model_ === 'string' ) return FOAM(prop.view);
      if ( viewName.model_ ) { var v = viewName.model_.create(viewName, this.X).copyFrom(prop); v.id = this.nextID(); return v; }
      if ( viewName.factory_ ) {
        var v = FOAM.lookup(viewName.factory_, this.X).create(viewName, this.X).copyFrom(prop);
        v.id = this.nextID();
        return v;
      }
      if ( typeof viewName === 'function' ) return viewName(prop, this);

      return viewName.create(prop);
    },

    unbindData: function(oldData) {
      if (! oldData || !this.prop ) return;
      var pValue = oldData.propertyValue(this.prop.name);
      Events.unlink(pValue, this.childData$);
    },

    bindData: function(data) {
      if (! data || !this.prop) return;
      var pValue = data.propertyValue(this.prop.name);
      Events.link(pValue, this.childData$);
    },


    toString: function() { /* Name info. */ return 'PropertyView(' + this.prop.name + ', ' + this.view + ')'; },

    destroy: function() { /* Passthrough to $$DOC{ref:'.view'} */
      this.view.destroy();
      this.SUPER();
    },
    
    construct: function() {
      this.SUPER();
          
      if ( this.args && this.args.model_ ) {
        var model = FOAM.lookup(this.args.model_, this.X);
        console.assert( model, 'Unknown View: ' + this.args.model_);
        // HACK to make sure model specification makes it into the create
        if ( this.args.model ) this.prop.model = this.args.model;
        var view = model.create(this.prop, this.X);
        delete this.args.model_;
      } else {
        view = this.createViewFromProperty(this.prop);
      }

      view.copyFrom(this.args);
      view.parent = this.parent;
      view.prop = this.prop;

      // TODO(kgr): re-enable when improved
      // if ( this.prop.description || this.prop.help ) view.tooltip = this.prop.description || this.prop.help;

      this.view = view;
      //this.bindData(this.data);
    }
  },
  
});

CLASS({
  name: 'PropertyView',
  extendsModel: 'foam.experimental.views.BasePropertyView',
  traits: ['foam.experimental.views.HTMLViewTrait',
           'foam.experimental.views.HTMLPropertyViewTrait'], 

  documentation: function() {/*
    Used by $$DOC{ref:'DetailView'} to generate a sub-$$DOC{ref:'View'} for one
    $$DOC{ref:'Property'}. The $$DOC{ref:'View'} chosen can be based off the
    $$DOC{ref:'Property.view',text:'Property.view'} value, the $$DOC{ref:'.innerView'} value, or
    $$DOC{ref:'.args'}.model_.
  */},
});

CLASS({
  name: 'HTMLPropertyViewTrait',
  package: 'foam.experimental.views',
  
  methods: {
    toHTML: function() { /* Passthrough to $$DOC{ref:'.view'} */ return this.view.toHTML(); },
    initHTML: function() { /* Passthrough to $$DOC{ref:'.view'} */ this.view.initHTML(); },
  },
  
});






// http://www.google.com/design/spec/components/tooltips.html#tooltips-usage
CLASS({
  name: 'Tooltip',

  extendsModel: 'View',

  properties: [
    {
      name: 'text',
      help: 'Help text to be shown in tooltip.'
    },
    {
      name: 'target',
      help: 'Target element to provide tooltip for.'
    },
    {
      name: 'className',
      defaultValue: 'tooltip'
    },
    {
      name: 'closed',
      defaultValue: false
    }
  ],

  templates: [
    function CSS() {/*
      .tooltip {
        background: rgba(80,80,80,0.9);
        border-radius: 4px;
        color: white;
        font-size: 10pt;
        left: 0;
        padding: 5px 8px;
        position: absolute;
        top: 0;
        visibility: hidden;
        z-index: 999;
        -webkit-transform: translate3d(0, 0, 2px);
      }
      .tooltip.animated {
        transition: top 0.5s ease-in-out;
        visibility: visible;
      }
      .tooltip.fadeout {
        opacity: 0;
        transition: opacity 0.5s ease-in-out;
      }
    */}
  ],

  methods: {
    init: function() {
      this.SUPER();

      var document = this.X.document;

      document.previousTooltip_ = this;
      this.X.setTimeout(function() {
        if ( this.closed ) return;
        if ( document.previousTooltip_ != this ) return;

        var div = document.createElement('div');

        // Close after 5s
        this.X.setTimeout(this.close.bind(this), 5000);

        div.className = this.className;
        div.id = this.id;
        div.innerHTML = this.toInnerHTML();

        document.body.appendChild(div);

        var s            = this.X.window.getComputedStyle(div);
        var pos          = findViewportXY(this.target);
        var screenHeight = this.X.document.body.clientHeight;
        var scrollY      = this.X.window.scrollY;
        var above        = pos[1] - scrollY > screenHeight / 2;
        var left         = pos[0] + ( this.target.clientWidth - toNum(s.width) ) / 2;
        var maxLeft      = this.X.document.body.clientWidth + this.X.window.scrollX - 15 - div.clientWidth;
        var targetHeight = this.target.clientHeight || this.target.offsetHeight;

        // Start half way to the destination to avoid the user clicking on the tooltip.
        div.style.top  = above ?
            pos[1] - targetHeight/2 - 4 :
            pos[1] + targetHeight/2 + 4 ;

//        div.style.top  = pos[1];
        div.style.left = Math.max(this.X.window.scrollX + 15, Math.min(maxLeft, left));

        DOM.setClass(div, 'animated');

        this.X.setTimeout(function() {
          div.style.top = above ?
            pos[1] - targetHeight - 8 :
            pos[1] + targetHeight + 8 ;
        }, 10);

        this.initHTML();
      }.bind(this), 800);
    },
    toInnerHTML: function() { return this.text; },
    close: function() {
      if ( this.closed ) return;
      this.closed = true;
      // Closing while it is still animating causes it to jump around
      // which looks bad, so wait 500ms to give it time to transition
      // if it is.
      this.X.setTimeout(function() {
        if ( this.$ ) {
          this.X.setTimeout(this.$.remove.bind(this.$), 1000);
          DOM.setClass(this.$, 'fadeout');
        }
      }.bind(this), 500);
    },
    destroy: function() {
      this.SUPER();
      this.close();
    }
  }
});


CLASS({
  name: 'PopupView',

  extendsModel: 'View',

  properties: [
    {
      name: 'view',
      type: 'View',
    },
    {
      name: 'x'
    },
    {
      name: 'y'
    },
    {
      name: 'width',
      defaultValue: undefined
    },
    {
      name: 'maxWidth',
      defaultValue: undefined
    },
    {
      name: 'maxHeight',
      defaultValue: undefined
    },
    {
      name: 'height',
      defaultValue: undefined
    }
  ],

  methods: {
    // TODO: first argument isn't used anymore, find and cleanup all uses
    open: function(_, opt_delay) {
      if ( this.$ ) return;
      var document = this.X.document;
      var div      = document.createElement('div');
      div.style.left = this.x + 'px';
      div.style.top = this.y + 'px';
      if ( this.width )     div.style.width = this.width + 'px';
      if ( this.height )    div.style.height = this.height + 'px';
      if ( this.maxWidth )  div.style.maxWidth = this.maxWidth + 'px';
      if ( this.maxHeight ) div.style.maxHeight = this.maxHeight + 'px';
      div.style.position = 'absolute';
      div.id = this.id;
      div.innerHTML = this.view.toHTML();

      document.body.appendChild(div);
      this.view.initHTML();
    },
    close: function() {
      this.$ && this.$.remove();
    },
    destroy: function() {
      this.SUPER();
      this.close();
      this.view.destroy();
    }
  }
});


CLASS({
  name: 'AutocompleteView',
  extendsModel: 'PopupView',
  help: 'Default autocomplete popup.',

  properties: [
    'closeTimeout',
    'autocompleter',
    'completer',
    'current',
    {
      model_: 'IntProperty',
      name: 'closeTime',
      units: 'ms',
      help: 'Time to delay the actual close on a .close call.',
      defaultValue: 200
    },
    {
      name: 'view',
      postSet: function(prev, v) {
        if ( prev ) {
          prev.data$.removeListener(this.complete);
          prev.choices$.removeListener(this.choicesUpdate);
        }

        v.data$.addListener(this.complete);
        v.choices$.addListener(this.choicesUpdate);
      }
    },
    {
      name: 'target',
      postSet: function(prev, v) {
        prev && prev.unsubscribe(['keydown'], this.onKeyDown);
        v.subscribe(['keydown'], this.onKeyDown);
      }
    },
    {
      name: 'maxHeight',
      defaultValue: 400
    },
    {
      name: 'className',
      defaultValue: 'autocompletePopup'
    }
  ],

  methods: {
    autocomplete: function(partial) {
      if ( ! this.completer ) {
        var proto = FOAM.lookup(this.autocompleter, this.X);
        this.completer = proto.create();
      }
      if ( ! this.view ) {
        this.view = this.makeView();
      }

      this.current = partial;
      this.open(this.target);
      this.completer.autocomplete(partial);
    },

    makeView: function() {
      return this.X.ChoiceListView.create({
        dao: this.completer.autocompleteDao$Proxy,
        extraClassName: 'autocomplete',
        orientation: 'vertical',
        mode: 'final',
        objToChoice: this.completer.f,
        useSelection: true
      });
    },

    init: function(args) {
      this.SUPER(args);
      this.subscribe('blur', (function() {
        this.close();
      }).bind(this));
    },

    open: function(e, opt_delay) {
      if ( this.closeTimeout ) {
        this.X.clearTimeout(this.closeTimeout);
        this.closeTimeout = 0;
      }

      if ( this.$ ) { this.position(this.$.firstElementChild, e.$ || e); return; }

      var parentNode = e.$ || e;
      var document = parentNode.ownerDocument;

      console.assert( this.X.document === document, 'X.document is not global document');

      var div    = document.createElement('div');
      var window = document.defaultView;

      console.assert( this.X.window === window, 'X.window is not global window');

      parentNode.insertAdjacentHTML('afterend', this.toHTML().trim());

      this.position(this.$.firstElementChild, parentNode);
      this.initHTML();
    },

    close: function(opt_now) {
      if ( opt_now ) {
        if ( this.closeTimeout ) {
          this.X.clearTimeout(this.closeTimeout);
          this.closeTimeout = 0;
        }
        this.SUPER();
        return;
      }

      if ( this.closeTimeout ) return;

      var realClose = this.SUPER;
      var self = this;
      this.closeTimeout = this.X.setTimeout(function() {
        self.closeTimeout = 0;
        realClose.call(self);
      }, this.closeTime);
    },

    position: function(div, parentNode) {
      var document = parentNode.ownerDocument;

      var pos = findPageXY(parentNode);
      var pageWH = [document.firstElementChild.offsetWidth, document.firstElementChild.offsetHeight];

      if ( pageWH[1] - (pos[1] + parentNode.offsetHeight) < (this.height || this.maxHeight || 400) ) {
        div.style.bottom = parentNode.offsetHeight;
        document.defaultView.innerHeight - pos[1];
      }

      if ( pos[2].offsetWidth - pos[0] < 600 )
        div.style.left = 600 - pos[2].offsetWidth;
      else
        div.style.left = -parentNode.offsetWidth;

      if ( this.width ) div.style.width = this.width + 'px';
      if ( this.height ) div.style.height = this.height + 'px';
      if ( this.maxWidth ) {
        div.style.maxWidth = this.maxWidth + 'px';
        div.style.overflowX = 'auto';
      }
      if ( this.maxHeight ) {
        div.style.maxHeight = this.maxHeight + 'px';
        div.style.overflowY = 'auto';
      }
    }
  },

  listeners: [
    {
      name: 'onKeyDown',
      code: function(_,_,e) {
        if ( ! this.view ) return;

        if ( e.keyCode === 38 /* arrow up */ ) {
          this.view.index--;
          this.view.scrollToSelection(this.$);
          e.preventDefault();
        } else if ( e.keyCode  === 40 /* arrow down */ ) {
          this.view.index++;
          this.view.scrollToSelection(this.$);
          e.preventDefault();
        } else if ( e.keyCode  === 13 /* enter */ ) {
          this.view.commit();
          e.preventDefault();
        }
      }
    },
    {
      name: 'complete',
      code: function() {
        this.target.onAutocomplete(this.view.data);
        this.view = this.makeView();
        this.close(true);
      }
    },
    {
      name: 'choicesUpdate',
      code: function() {
        if ( this.view &&
             ( this.view.choices.length === 0 ||
               ( this.view.choices.length === 1 &&
                 this.view.choices[0][1] === this.current ) ) ) {
          this.close(true);
        }
      }
    }
  ],

  templates: [
    function toHTML() {/*
  <span id="<%= this.id %>" style="position:relative"><div %%cssClassAttr() style="position:absolute"><%= this.view %></div></span>
    */}
  ]
});


CLASS({
  name: 'StaticHTML',
  extendsModel: 'View',
  properties: [
    {
      model_: 'StringProperty',
      name: 'content'
    },
    {
      model_: 'BooleanProperty',
      name: 'escapeHTML',
      defaultValue: false
    }
  ],

  methods: {
    toHTML: function() {
      if ( this.escapeHTML ) {
        return this.strToHTML(this.content);
      }
      return this.content;
    }
  }
});


CLASS({
  name: 'MenuSeparator',
  extendsModel: 'StaticHTML',
  properties: [
    {
      name: 'content',
      defaultValue: '<hr class="menuSeparator">'
    }
  ]
});


// TODO: Model
var DomValue = {
  DEFAULT_EVENT:    'change',
  DEFAULT_PROPERTY: 'value',

  create: function(element, opt_event, opt_property) {
    if ( ! element ) {
      throw "Missing Element in DomValue";
    }

    return {
      __proto__: this,
      element:   element,
      event:     opt_event    || this.DEFAULT_EVENT,
      property:  opt_property || this.DEFAULT_PROPERTY };
  },

  setElement: function ( element ) { this.element = element; },

  get: function() { return this.element[this.property]; },

  set: function(value) {
    if ( this.element[this.property] !== value )
      this.element[this.property] = value;
  },

  addListener: function(listener) {
    if ( ! this.event ) return;
    try {
      this.element.addEventListener(this.event, listener, false);
    } catch (x) {
    }
  },

  removeListener: function(listener) {
    if ( ! this.event ) return;
    try {
      this.element.removeEventListener(this.event, listener, false);
    } catch (x) {
      // could be that the element has been removed
    }
  },

  toString: function() {
    return "DomValue(" + this.event + ", " + this.property + ")";
  }
};


CLASS({
  name: 'WindowHashValue',

  properties: [
    {
      name: 'window',
      defaultValueFn: function() { return this.X.window; }
    }
  ],

  methods: {
    get: function() { return this.window.location.hash ? this.window.location.hash.substring(1) : ''; },

    set: function(value) { this.window.location.hash = value; },

    addListener: function(listener) {
      this.window.addEventListener('hashchange', listener, false);
    },

    removeListener: function(listener) {
      this.window.removeEventListener('hashchange', listener, false);
    },

    toString: function() { return "WindowHashValue(" + this.get() + ")"; }
  }
});

X.memento = X.WindowHashValue.create();


CLASS({
  name: 'ImageView',

  extendsModel: 'View',

  properties: [
    {
      name: 'data'
    },
    {
      name: 'className',
      defaultValue: 'imageView'
    },
    {
      name: 'backupImage'
    },
    {
      name: 'domValue',
      postSet: function(oldValue, newValue) {
        oldValue && Events.unfollow(this.data$, oldValue);
        newValue && Events.follow(this.data$, newValue);
      }
    },
    {
      name: 'displayWidth',
      postSet: function(_, newValue) {
        if ( this.$ ) {
          this.$.style.width = newValue;
        }
      }
    },
    {
      name: 'displayHeight',
      postSet: function(_, newValue) {
        if ( this.$ ) {
          this.$.style.height = newValue;
        }
      }
    }
  ],

  methods: {
    toHTML: function() {
      var src = window.IS_CHROME_APP ?
        ( this.backupImage ? ' src="' + this.backupImage + '"' : '' ) :
        ' src="' + this.data + '"';

      return '<img ' + this.cssClassAttr() + ' id="' + this.id + '"' + src + '>';
    },
    isSupportedUrl: function(url) {
      url = url.trim().toLowerCase();
      return url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('filesystem:');
    },
    initHTML: function() {
      this.SUPER();

      if ( this.backupImage ) this.$.addEventListener('error', function() {
        this.data = this.backupImage;
      }.bind(this));

      if ( window.IS_CHROME_APP && ! this.isSupportedUrl(this.data) ) {
        var self = this;
        var xhr = new XMLHttpRequest();
        xhr.open("GET", this.data);
        xhr.responseType = 'blob';
        xhr.asend(function(blob) {
          if ( blob ) {
            self.$.src = URL.createObjectURL(blob);
          }
        });
      } else {
        this.domValue = DomValue.create(this.$, undefined, 'src');
        this.displayHeight = this.displayHeight;
        this.displayWidth = this.displayWidth;
      }
    }
  }
});


CLASS({
  name: 'BlobImageView',

  extendsModel: 'View',

  help: 'Image view for rendering a blob as an image.',

  properties: [
    {
      name: 'data',
      postSet: function() { this.onValueChange(); }
    },
    {
      model_: 'IntProperty',
      name: 'displayWidth'
    },
    {
      model_: 'IntProperty',
      name: 'displayHeight'
    }
  ],

  methods: {
    toHTML: function() {
      return '<img id="' + this.id + '">';
    },

    initHTML: function() {
      this.SUPER();
      var self = this;
      this.$.style.width = self.displayWidth;
      this.$.style.height = self.displayHeight;
      this.onValueChange();
    }
  },

  listeners: [
    {
      name: 'onValueChange',
      code: function() {
        if ( this.data && this.$ )
          this.$.src = URL.createObjectURL(this.data);
      }
    }
  ]
});


CLASS({
  name:  'TextFieldView',
  label: 'Text Field',

  extendsModel: 'View',
  traits: ['foam.experimental.views.DataConsumerTrait'],

  documentation: function() { /*
      The default $$DOC{ref:'View'} for a string. Supports autocomplete
      when an autocompleter is installed in $$DOC{ref:'.autocompleter'}.
  */},

  properties: [
    {
      model_: 'StringProperty',
      name: 'name',
      defaultValue: 'field',
      documentation: function() { /* The name of the field. */}
    },
    {
      model_: 'IntProperty',
      name: 'displayWidth',
      defaultValue: 30,
      documentation: function() { /* The width to fix the HTML text box. */}
    },
    {
      model_: 'IntProperty',
      name: 'displayHeight',
      defaultValue: 1,
      documentation: function() { /* The height to fix the HTML text box. */}
    },
    {
      model_: 'StringProperty',
      name: 'type',
      defaultValue: 'text',
      documentation: function() { /* The type of field to create. */}
    },
    {
      model_: 'StringProperty',
      name: 'placeholder',
      defaultValue: undefined,
      documentation: function() { /* Placeholder to use when empty. */}
    },
    {
      model_: 'BooleanProperty',
      name: 'onKeyMode',
      help: 'If true, value is updated on each keystroke.',
      documentation: function() { /* If true, value is updated on each keystroke. */}
    },
    {
      model_: 'BooleanProperty',
      name: 'escapeHTML',
      defaultValue: true,
      // TODO: make the default 'true' for security reasons
      help: 'If true, HTML content is escaped in display mode.',
      documentation: function() { /* If true, HTML content is escaped in display mode. */}
    },
    {
      model_: 'StringProperty',
      name: 'mode',
      defaultValue: 'read-write',
      view: { factory_: 'ChoiceView', choices: ['read-only', 'read-write', 'final'] },
      documentation: function() { /* Can be 'read-only', 'read-write' or 'final'. */}
    },
    {
      model_: 'BooleanProperty',
      name: 'required',
      documentation: 'If value is required.'
    },
    {
      model_: 'StringProperty',
      name: 'pattern',
      documentation: 'Regex pattern for value.'
    },
    {
      name: 'domValue',
      hidden: true
    },
    {
      name: 'data',
      documentation: function() { /* The object to bind to the user's entered text. */}
    },
    {
      model_: 'StringProperty',
      name: 'readWriteTagName',
      defaultValueFn: function() {
        return this.displayHeight === 1 ? 'input' : 'textarea';
      },
      hidden: true
    },
    {
      model_: 'BooleanProperty',
      name: 'autocomplete',
      defaultValue: true,
      documentation: function() { /* Set to true to enable autocomplete. */}
    },
    {
      name: 'autocompleter',
      documentation: function() { /* The autocompleter model to use. */}
    },
    {
      name: 'autocompleteView',
      documentation: function() { /* The autocomplete view created. */}
    }
  ],

  constants: {
    /** Escape topic published when user presses 'escape' key to abort edits. **/
    // TODO: Model as a 'Topic'
    ESCAPE: ['escape']
  },

  methods: {
    toHTML: function() {
      /* Selects read-only versus read-write DOM output */
      return this.mode === 'read-write' ?
        this.toReadWriteHTML() :
        this.toReadOnlyHTML()  ;
    },

    toReadWriteHTML: function() {
      /* Supplies the correct element for read-write mode */
      var str = '<' + this.readWriteTagName + ' id="' + this.id + '"';
      str += ' type="' + this.type + '" ' + this.cssClassAttr();

      this.on('click', this.onClick, this.id);

      str += this.readWriteTagName === 'input' ?
        ' size="' + this.displayWidth + '"' :
        ' rows="' + this.displayHeight + '" cols="' + this.displayWidth + '"';

      if ( this.required ) str += ' required';
      if ( this.pattern  ) str += ' pattern="' + this.pattern + '"';

      str += this.extraAttributes();

      str += ' name="' + this.name + '">';
      str += '</' + this.readWriteTagName + '>';
      return str;
    },

    extraAttributes: function() { return ''; },

    toReadOnlyHTML: function() {
      /* Supplies the correct element for read-only mode */
      var self = this;
      this.setClass('placeholder', function() { return self.data === ''; }, this.id);
      return '<' + this.tagName + ' id="' + this.id + '"' + this.cssClassAttr() + ' name="' + this.name + '"></' + this.tagName + '>';
    },

    setupAutocomplete: function() {
      /* Initializes autocomplete, if $$DOC{ref:'.autocomplete'} and
        $$DOC{ref:'.autocompleter'} are set. */
      if ( ! this.autocomplete || ! this.autocompleter ) return;

      var view = this.autocompleteView = this.X.AutocompleteView.create({
        autocompleter: this.autocompleter,
        target: this
      });

      this.bindAutocompleteEvents(view);
    },

    onAutocomplete: function(data) {
      this.data = data;
    },

    bindAutocompleteEvents: function(view) {
      this.$.addEventListener('blur', function() {
        // Notify the autocomplete view of a blur, it can decide what to do from there.
        view.publish('blur');
      });
      this.$.addEventListener('input', (function() {
        view.autocomplete(this.textToValue(this.$.value));
      }).bind(this));
      this.$.addEventListener('focus', (function() {
        view.autocomplete(this.textToValue(this.$.value));
      }).bind(this));
    },

    initHTML: function() {
      /* Connects key events. */
      if ( ! this.$ ) return;

      this.SUPER();

      if ( this.mode === 'read-write' ) {
        if ( this.placeholder ) this.$.placeholder = this.placeholder;

        this.domValue = DomValue.create(
          this.$,
          this.onKeyMode ? 'input' : 'change');

        // In KeyMode we disable feedback to avoid updating the field
        // while the user is still typing.  Then we update the view
        // once they leave(blur) the field.
        Events.relate(
          this.data$,
          this.domValue,
          this.valueToText.bind(this),
          this.textToValue.bind(this),
          this.onKeyMode);

        if ( this.onKeyMode )
          this.$.addEventListener('blur', this.onBlur);

        this.$.addEventListener('keydown', this.onKeyDown);

        this.setupAutocomplete();
      } else {
        this.domValue = DomValue.create(
          this.$,
          'undefined',
          this.escapeHTML ? 'textContent' : 'innerHTML');

        Events.map(
          this.data$,
          this.domValue,
          this.valueToText.bind(this))
      }
    },

    textToValue: function(text) { /* Passthrough */ return text; },

    valueToText: function(value) { /* Filters for read-only mode */
      if ( this.mode === 'read-only' )
        return (value === '') ? this.placeholder : value;
      return value;
    },

    destroy: function() { /* Unlinks key handler. */
      this.SUPER();
      Events.unlink(this.domValue, this.data$);
    }
  },

  listeners: [
    {
      name: 'onKeyDown',
      code: function(e) {
        if ( e.keyCode == 27 /* ESCAPE KEY */ ) {
          this.domValue.set(this.data);
          this.publish(this.ESCAPE);
        } else {
          this.publish(['keydown'], e);
        }
      }
    },
    {
      name: 'onBlur',
      code: function(e) {
        if ( this.domValue.get() !== this.data )
          this.domValue.set(this.data);
      }
    },
    {
      name: 'onClick',
      code: function(e) {
        this.$ && this.$.focus();
      }
    },
  ]
});


CLASS({
  name:  'DateFieldView',
  label: 'Date Field',

  extendsModel: 'TextFieldView',

  properties: [
    {
      model_: 'StringProperty',
      name: 'type',
      defaultValue: 'date'
    }
  ],

  methods: {
    initHTML: function() {
      this.domValue = DomValue.create(this.$, undefined, 'valueAsDate');
      Events.link(this.data$, this.domValue);
    }
  }
});


CLASS({
  name:  'DateTimeFieldView',
  label: 'Date-Time Field',

  extendsModel: 'View',

  properties: [
    {
      model_: 'StringProperty',
      name: 'name'
    },
    {
      model_: 'StringProperty',
      name: 'mode',
      defaultValue: 'read-write'
    },
    {
      name: 'domValue',
      postSet: function(oldValue) {
        if ( oldValue && this.value ) {
          Events.unlink(oldValue, this.value);
        }
      }
    },
    {
      name: 'data',
    }
  ],

  methods: {
    valueToDom: function(value) { return value ? value.getTime() : 0; },
    domToValue: function(dom) { return new Date(dom); },

    toHTML: function() {
      // TODO: Switch type to just datetime when supported.
      return ( this.mode === 'read-write' ) ?
        '<input id="' + this.id + '" type="datetime-local" name="' + this.name + '"/>' :
        '<span id="' + this.id + '" name="' + this.name + '" ' + this.cssClassAttr() + '></span>' ;
    },

    initHTML: function() {
      this.SUPER();

      this.domValue = DomValue.create(
        this.$,
        this.mode === 'read-write' ? 'input' : undefined,
        this.mode === 'read-write' ? 'valueAsNumber' : 'textContent' );

      Events.relate(
        this.data$,
        this.domValue,
        this.valueToDom.bind(this),
        this.domToValue.bind(this));
    }
  }
});


CLASS({
  name:  'RelativeDateTimeFieldView',
  label: 'Relative Date-Time Field',

  extendsModel: 'DateTimeFieldView',

  properties: [
    { name: 'mode', defaultValue: 'read-only' }
  ],

  methods: {
    valueToDom: function(value) {
      return value ? value.toRelativeDateString() : '';
    }
  }
});


CLASS({
  name:  'HTMLView',
  label: 'HTML Field',

  extendsModel: 'View',

  properties: [
    {
      name: 'name',
      type: 'String',
      defaultValue: ''
    },
    {
      model_: 'StringProperty',
      name: 'tag',
      defaultValue: 'span'
    },
    {
      name: 'data'
    }
  ],

  methods: {
    toHTML: function() {
      var s = '<' + this.tag + ' id="' + this.id + '"';
      if ( this.name ) s+= ' name="' + this.name + '"';
      s += '></' + this.tag + '>';
      return s;
    },

    initHTML: function() {
      var e = this.$;

      if ( ! e ) {
        console.log('stale HTMLView');
        return;
      }
      this.domValue = DomValue.create(e, undefined, 'innerHTML');

      if ( this.mode === 'read-write' ) {
        Events.link(this.data$, this.domValue);
      } else {
        Events.follow(this.data$, this.domValue);
      }
    },

    destroy: function() {
      this.SUPER();
      Events.unlink(this.domValue, this.data$);
    }
  }
});


CLASS({
  name: 'RoleView',

  extendsModel: 'View',

  properties: [
    {
      name: 'data'
    },
    {
      name: 'roleName',
      type: 'String',
      defaultValue: ''
    },
    {
      name: 'models',
      type: 'Array[String]',
      defaultValue: []
    },
    {
      name: 'selection'
    },
    {
      name: 'model',
      type: 'Model'
    }
  ],

  methods: {
    initHTML: function() {
      var e = this.$;
      this.domValue = DomValue.create(e);
      Events.link(this.data$, this.domValue);
    },

    toHTML: function() {
      var str = "";

      str += '<select id="' + this.id + '" name="' + this.name + '" size=' + this.size + '/>';
      for ( var i = 0 ; i < this.choices.length ; i++ ) {
        str += "\t<option>" + this.choices[i].toString() + "</option>";
      }
      str += '</select>';

      return str;
    },

    destroy: function() {
      this.SUPER();
      Events.unlink(this.domValue, this.data$);
    }
  }
});


CLASS({
  name: 'BooleanView',

  extendsModel: 'View',

  properties: [
    {
      name: 'data'
    },
    {
      name:  'name',
      label: 'Name',
      type:  'String',
      defaultValue: 'field'
    }
  ],

  methods: {
    toHTML: function() {
      return '<input type="checkbox" id="' + this.id + '" name="' + this.name + '"' + this.cssClassAttr() + '/>';
    },

    initHTML: function() {
      var e = this.$;

      this.domValue = DomValue.create(e, 'change', 'checked');

      Events.link(this.data$, this.domValue);
    },

    destroy: function() {
      this.SUPER();
      Events.unlink(this.domValue, this.data$);
    }
  }
});


CLASS({
  name: 'ImageBooleanView',

  extendsModel: 'View',

  properties: [
    {
      name:  'name',
      label: 'Name',
      type:  'String',
      defaultValue: ''
    },
    {
      name: 'data',
      postSet: function() { this.updateHTML(); }
    },
    {
      name: 'trueImage'
    },
    {
      name: 'falseImage'
    },
    {
      name: 'trueClass'
    },
    {
      name: 'falseClass'
    }
  ],

  methods: {
    image: function() {
      return this.data ? this.trueImage : this.falseImage;
    },
    toHTML: function() {
      var id = this.id;
 // TODO: next line appears slow, check why
      this.on('click', this.onClick, id);
      return this.name ?
        '<img id="' + id + '" ' + this.cssClassAttr() + '" name="' + this.name + '">' :
        '<img id="' + id + '" ' + this.cssClassAttr() + '>' ;
    },
    initHTML: function() {
      if ( ! this.$ ) return;
      this.SUPER();
      this.updateHTML();
    },
    updateHTML: function() {
      if ( ! this.$ ) return;
      this.$.src = this.image();

      if ( this.data ) {
        this.trueClass  && this.$.classList.add(this.trueClass);
        this.falseClass && this.$.classList.remove(this.falseClass);
      } else {
        this.trueClass  && this.$.classList.remove(this.trueClass);
        this.falseClass && this.$.classList.add(this.falseClass);
      }
    },
  },

  listeners: [
    {
      name: 'onClick',
      code: function(e) {
        e.stopPropagation();
        this.data = ! this.data;
      }
    }
  ]
});


CLASS({
  name: 'CSSImageBooleanView',

  extendsModel: 'View',

  properties: [
    'data',
  ],

  methods: {
    initHTML: function() {
      if ( ! this.$ ) return;
      this.data$.addListener(this.update);
      this.$.addEventListener('click', this.onClick);
    },
    toHTML: function() {
      return '<span id="' + this.id + '" class="' + this.className + ' ' + (this.data ? 'true' : '') + '">&nbsp;&nbsp;&nbsp;</span>';
    }
  },

  listeners: [
    {
      name: 'update',
      code: function() {
        if ( ! this.$ ) return;
        DOM.setClass(this.$, 'true', this.data);
      }
    },
    {
      name: 'onClick',
      code: function(e) {
        e.stopPropagation();
        this.data = ! this.data;
        this.update();
      }
    }
  ]
});


CLASS({
  name: 'TextAreaView',

  extendsModel: 'TextFieldView',

  label: 'Text-Area View',

  properties: [
    {
      model_: 'IntProperty',
      name: 'displayHeight',
      defaultValue: 5
    },
    {
      model_: 'IntProperty',
      name: 'displayWidth',
      defaultValue: 70
    }
  ]
});


CLASS({
  name:  'FunctionView',

  extendsModel: 'TextFieldView',

  properties: [
    {
      name: 'onKeyMode',
      defaultValue: true
    },
    {
      name: 'displayWidth',
      defaultValue: 80
    },
    {
      name: 'displayHeight',
      defaultValue: 8
    },
    {
      name: 'errorView',
      factory: function() { return TextFieldView.create({mode:'read-only'}); }
    }
  ],

  methods: {
    initHTML: function() {
      this.SUPER();

      this.errorView.initHTML();
      this.errorView.$.style.color = 'red';
      this.errorView.$.style.display = 'none';
    },

    toHTML: function() {
      return this.errorView.toHTML() + ' ' + this.SUPER();
    },

    setError: function(err) {
      this.errorView.data = err || "";
      this.errorView.$.style.display = err ? 'block' : 'none';
    },

    textToValue: function(text) {
      if ( ! text ) return null;

      try {
        var ret = eval("(" + text + ")");

        this.setError(undefined);

        return ret;
      } catch (x) {
        console.log("JS Error: ", x, text);
        this.setError(x);

        return text;
      }
    },

    valueToText: function(value) {
      return value ? value.toString() : "";
    }
  }
});


CLASS({
  name: 'JSView',

  extendsModel: 'TextAreaView',

  properties: [
    { name: 'displayWidth',  defaultValue: 100 },
    { name: 'displayHeight', defaultValue: 100 }
  ],

  methods: {
    textToValue: function(text) {
      try {
        return JSONUtil.parse(this.X, text);
      } catch (x) {
        console.log("error");
      }
      return text;
    },

    valueToText: function(val) {
      return JSONUtil.pretty.stringify(val);
    }
  }
});


CLASS({
  name:  'XMLView',
  label: 'XML View',

  extendsModel: 'TextAreaView',

  properties: [
    { name: 'displayWidth',  defaultValue: 100 },
    { name: 'displayHeight', defaultValue: 100 }
  ],

  methods: {
    textToValue: function(text) {
      return this.val_; // Temporary hack until XML parsing is implemented
      // TODO: parse XML
      return text;
    },

    valueToText: function(val) {
      this.val_ = val;  // Temporary hack until XML parsing is implemented
      return XMLUtil.stringify(val);
    }
  }
});


/** A display-only summary view. **/
CLASS({
  name: 'SummaryView',

  extendsModel: 'View',

  properties: [
    {
      name: 'model',
      type: 'Model'
    },
    {
      name: 'data'
    }
  ],

  methods: {
    toHTML: function() {
      return (this.model.getPrototype().toSummaryHTML || this.defaultToHTML).call(this);
    },

    defaultToHTML: function() {
      this.children = [];
      var model = this.model;
      var obj   = this.data;
      var out   = [];

      out.push('<div id="' + this.id + '" class="summaryView">');
      out.push('<table>');

      // TODO: Either make behave like DetailView or else
      // make a mode of DetailView.
      for ( var i = 0 ; i < model.properties.length ; i++ ) {
        var prop = model.properties[i];

        if ( prop.hidden ) continue;

        var value = obj[prop.name];

        if ( ! value ) continue;

        out.push('<tr>');
        out.push('<td class="label">' + prop.label + '</td>');
        out.push('<td class="value">');
        if ( prop.summaryFormatter ) {
          out.push(prop.summaryFormatter(this.strToHTML(value)));
        } else {
          out.push(this.strToHTML(value));
        }
        out.push('</td></tr>');
      }

      out.push('</table>');
      out.push('</div>');

      return out.join('');
    }
  }
});


/** A display-only on-line help view. **/
CLASS({
  name: 'HelpView',

  extendsModel: 'View',

  properties: [
    {
      name: 'model',
      type: 'Model'
    }
  ],

  methods: {
    // TODO: make this a template?
    toHTML: function() {
      var model = this.model;
      var out   = [];

      out.push('<div id="' + this.id + '" class="helpView">');

      out.push('<div class="intro">');
      out.push(model.help);
      out.push('</div>');

      for ( var i = 0 ; i < model.properties.length ; i++ ) {
        var prop = model.properties[i];

        if ( prop.hidden ) continue;

        out.push('<div class="label">');
        out.push(prop.label);
        out.push('</div><div class="text">');
        if ( prop.subType /*&& value instanceof Array*/ && prop.type.indexOf('[') != -1 ) {
          var subModel = this.X[prop.subType];
          var subView  = HelpView.create({model: subModel});
          if ( subModel != model )
            out.push(subView.toHTML());
        } else {
          out.push(prop.help);
        }
        out.push('</div>');
      }

      out.push('</div>');

      return out.join('');
    }
  }
});


// TODO: add ability to set CSS class and/or id
CLASS({
  name: 'ActionButton',
  traits: ['foam.experimental.views.DataConsumerTrait'],
  extendsModel: 'View',

  properties: [
    {
      name: 'action',
      postSet: function(old, nu) {
        old && old.removeListener(this.render)
        nu.addListener(this.render);
      }
    },
    {
      name: 'className',
      factory: function() { return 'actionButton actionButton-' + this.action.name; }
    },
    {
      name: 'tagName',
      defaultValue: 'button'
    },
    {
      name: 'showLabel',
      defaultValueFn: function() { return this.action.showLabel; }
    },
    {
      name: 'label',
      defaultValueFn: function() {
        return this.data ?
            this.action.labelFn.call(this.data, this.action) :
            this.action.label;
      }
    },
    {
      name: 'iconUrl',
      defaultValueFn: function() { return this.action.iconUrl; }
    },
    {
      name: 'tooltip',
      defaultValueFn: function() { return this.action.help; }
    }
  ],

  listeners: [
    {
      name: 'render',
      isFramed: true,
      code: function() { this.updateHTML(); }
    }
  ],

  methods: {
    toHTML: function() {
      var superResult = this.SUPER(); // get the destructors done before doing our work

      var self = this;

      this.on('click', function() {
        self.action.callIfEnabled(self.X, self.data);
      }, this.id);

      this.setAttribute('disabled', function() {
        self.closeTooltip();
        return self.action.isEnabled.call(self.data, self.action) ? undefined : 'disabled';
      }, this.id);

      this.setClass('available', function() {
        self.closeTooltip();
        return self.action.isAvailable.call(self.data, self.action);
      }, this.id);

      this.X.dynamic(function() { self.action.labelFn.call(self.data, self.action); self.updateHTML(); });

      return superResult;
    },

    toInnerHTML: function() {
      var out = '';

      if ( this.iconUrl ) {
        out += '<img src="' + XMLUtil.escapeAttr(this.iconUrl) + '">';
      }

      if ( this.showLabel ) {
        out += this.label;
      }

      return out;
    }
  }
});


CLASS({
  name: 'ActionLink',

  extendsModel: 'ActionButton',

  properties: [
    {
      // TODO: fix
      name: 'className',
      factory: function() { return 'actionLink actionLink-' + this.action.name; }
    },
    {
      name: 'tagName',
      defaultValue: 'a'
    }
  ],

  methods: {
    toHTML: function() {
      var superResult = this.SUPER(); // get the destructors done before doing our work
      this.setAttribute('href', function() { return '#' }, this.id);
      return superResult;
    },

    toInnerHTML: function() {
      if ( this.action.iconUrl ) {
        return '<img src="' + XMLUtil.escapeAttr(this.action.iconUrl) + '" />';
      }

      if ( this.action.showLabel ) {
        return this.label;
      }
    }
  }
});


// TODO: ActionBorder should use this.
CLASS({
  name:  'ToolbarView',
  label: 'Toolbar',

  extendsModel: 'View',

  properties: [
    {
      model_: 'BooleanProperty',
      name: 'horizontal',
      defaultValue: true
    },
    {
      model_: 'BooleanProperty',
      name: 'icons',
      defaultValueFn: function() {
        return this.horizontal;
      }
    },
    {
      name: 'data'
    },
    {
      name: 'left'
    },
    {
      name: 'top'
    },
    {
      name: 'bottom'
    },
    {
      name: 'right'
    },
    {
      // TODO: This should just come from X instead
      name: 'document'
    },
    {
      model_: 'BooleanPropery',
      name: 'openedAsMenu',
      defaultValue: false
    }
  ],

  methods: {
    preButton: function(button) { return ' '; },
    postButton: function() { return this.horizontal ? ' ' : '<br>'; },

    openAsMenu: function() {
      var div = this.document.createElement('div');
      this.openedAsMenu = true;

      div.id = this.nextID();
      div.className = 'ActionMenuPopup';
      this.top ? div.style.top = this.top : div.style.bottom = this.bottom;
      this.left ? div.style.left = this.left : div.style.right = this.right;
      div.innerHTML = this.toHTML(true);

      var self = this;
      // Close window when clicked
      div.onclick = function() { self.close(); };

      div.onmouseout = function(e) {
        if ( e.toElement.parentNode != div && e.toElement.parentNode.parentNode != div ) {
          self.close();
        }
      };

      this.document.body.appendChild(div);
      this.initHTML();
    },

    close: function() {
      if ( ! this.openedAsMenu ) return this.SUPER();

      this.openedAsMenu = false;
      this.$.parentNode.remove();
      this.destroy();
      this.publish('closed');
    },

    toHTML: function(opt_menuMode) {
      var str = '';
      var cls = opt_menuMode ? 'ActionMenu' : 'ActionToolbar';

      str += '<div id="' + this.id + '" class="' + cls + '">';

      for ( var i = 0 ; i < this.children.length ; i++ ) {
        str += this.preButton(this.children[i]) +
          this.children[i].toHTML() +
          (MenuSeparator.isInstance(this.children[i]) ?
           '' : this.postButton(this.children[i]));
      }

      str += '</div>';

      return str;
    },

    initHTML: function() {
      this.SUPER();

      // When the focus is in the toolbar, left/right arrows should move the
      // focus in the direction.
      this.addShortcut('Right', function(e) {
        var i = 0;
        for ( ; i < this.children.length && e.target != this.children[i].$ ; i++ );
        i = (i + 1) % this.children.length;
        this.children[i].$.focus();
      }.bind(this), this.id);

      this.addShortcut('Left', function(e) {
        var i = 0;
        for ( ; i < this.children.length && e.target != this.children[i].$ ; i++ );
        i = (i + this.children.length - 1) % this.children.length;
        this.children[i].$.focus();
      }.bind(this), this.id);
    },

    addAction: function(a) {
      var view = ActionButton.create({ action: a, data$: this.data$ });
      if ( a.children.length > 0 ) {
        var self = this;
        view.action = a.clone();
        view.action.action = function() {
          var toolbar = ToolbarView.create({
            data$:    self.data$,
            document: self.document,
            left:     view.$.offsetLeft,
            top:      view.$.offsetTop
          });
          toolbar.addActions(a.children);
          toolbar.openAsMenu(view);
        };
      }
      this.addChild(view);
    },
    addActions: function(actions) {
      actions.forEach(this.addAction.bind(this));
    },
    addSeparator: function() {
      this.addChild(MenuSeparator.create());
    }
  }
});

/** Add Action Buttons to a decorated View. **/
/* TODO:
   These are left over Todo's from the previous ActionBorder, not sure which still apply.

   The view needs a standard interface to determine it's Model (getModel())
   listen for changes to Model and change buttons displayed and enabled
   isAvailable
*/
CLASS({
  name: 'ActionBorder',

  methods: {
    toHTML: function(border, delegate, args) {
      var str = "";
      str += delegate.apply(this, args);
      str += '<div class="actionToolbar">';

      // Actions on the View, are bound to the view
      var actions = this.model_.actions;
      for ( var i = 0 ; i < actions.length; i++ ) {
        var v = this.createActionView(actions[i]);
        v.data = this;
        str += ' ' + v.toView_().toHTML() + ' ';
        this.addChild(v);
      }

      // This is poor design, we should defer to the view and polymorphism
      // to make the distinction.
      if ( DetailView.isInstance(this) ) {

        // Actions on the data are bound to the data
        actions = this.model.actions;
        for ( var i = 0 ; i < actions.length; i++ ) {
          var v = this.createActionView(actions[i]);
          v.data$ = this.data$;
          str += ' ' + v.toView_().toHTML() + ' ';
          this.addChild(v);
        }
      }

      str += '</div>';
      return str;
    }
  }
});


CLASS({
  name: 'ProgressView',

  extendsModel: 'View',

  properties: [
    {
      model_: 'FloatProperty',
      name: 'data',
      postSet: function () { this.updateValue(); }
    }
  ],

  methods: {

    toHTML: function() {
      return '<progress value="25" id="' + this.id + '" max="100" >25</progress>';
    },

    updateValue: function() {
      var e = this.$;

      e.value = parseInt(this.data);
    },

    initHTML: function() {
      this.updateValue();
    }
  }
});

/*
var ArrayView = {
  create: function(prop) {
    console.assert(prop.subType, 'Array properties must specify "subType".');
    var view = DAOController.create({
      model: GLOBAL[prop.subType]
    });
    return view;
  }
};
*/

CLASS({
  name: 'Mouse',

  properties: [
    {
      name: 'x',
      type: 'int',
      view: 'IntFieldView',
      defaultValue: 0
    },
    {
      name: 'y',
      type: 'int',
      view: 'IntFieldView',
      defaultValue: 0
    }
  ],
  methods: {
    connect: function(e) {
      e.addEventListener('mousemove', this.onMouseMove);
      return this;
    }
  },

  listeners: [
    {
      name: 'onMouseMove',
      isFramed: true,
      code: function(evt) {
        this.x = evt.offsetX;
        this.y = evt.offsetY;
      }
    }
  ]
});


// TODO: This should be replaced with a generic Choice.
CLASS({
  name: 'ViewChoice',

  tableProperties: [
    'label',
    'view'
  ],

  properties: [
    {
      name: 'label',
      type: 'String',
      displayWidth: 20,
      defaultValue: '',
      help: "View's label."
    },
    {
      model_: 'ViewFactoryProperty',
      name: 'view',
      type: 'view',
      defaultValue: 'DetailView',
      help: 'View factory.'
    }
  ]
});


CLASS({
  name: 'AlternateView',

  extendsModel: 'View',

  properties: [
    'data',
    {
      name: 'dao',
      getter: function() { return this.data; },
      setter: function(dao) { this.data = dao; }
    },
    {
      model_: 'ArrayProperty',
      name: 'views',
      subType: 'ViewChoice',
      help: 'View choices.'
    },
    {
      name: 'choice',
      postSet: function(_, v) {
        this.view = v.view;
      },
      hidden: true
    },
    {
      model_: 'ViewFactoryProperty',
      name: 'view',
      defaultValue: 'View',
      postSet: function(old, v) {
        if ( ! this.$ ) return;
        this.removeChild(old);
        var view = this.view();
        view.data = this.data;
        this.addChild(view);
        this.viewContainer.innerHTML = view.toHTML();
        view.initHTML();
      },
      hidden: true
    },
    {
      name: 'mode',
      getter: function() { return this.choice.label; },
      setter: function(label) {
        for ( var i = 0 ; i < this.views.length ; i++ ) {
          if ( this.views[i].label === label ) {
            var oldValue = this.mode;

            this.choice = this.views[i];

            this.propertyChange('mode', oldValue, label);
            return;
          }
        }
      }
    },
    {
      model_: 'ViewFactoryProperty',
      name: 'headerView',
      defaultValue: 'View'
    },
    {
      model_: 'DOMElementProperty',
      name: 'viewContainer'
    }
  ],

  templates: [
    function choiceButton(_, i, length, choice) {/*<%
        var id = this.on('click', function() { self.choice = choice; });
        this.setClass('mode_button_active', function() { return self.choice === choice; }, id);
      %><a id="<%= id %>" class="buttonify<%= i == 0 ? ' capsule_left' : '' %><%=
                                              i == length - 1 ? ' capsule_right' : '' %>"><%= choice.label %></a>*/},
    function toHTML() {/*
      <div id="<%= this.id %>" class="AltViewOuter column" style="margin-bottom:5px;">
        <div class="altViewButtons rigid">
          <%= this.headerView() %>
          <% for ( var i = 0, choice; choice = this.views[i]; i++ ) {
               this.choiceButton(out, i, this.views.length, choice);
           } %>
        </div>
        <br/>
        <div class="altView column" id="<%= this.viewContainer = this.nextID() %>"><%= this.view({ data$: this.data$ }) %></div>
      </div>
    */}
  ]
});


CLASS({
  name: 'SwipeAltView',
  extendsModel: 'View',

  properties: [
    {
      name: 'views',
      type: 'Array',
      subType: 'ViewChoice',
      view: 'ArrayView',
      factory: function() { return []; },
      help: 'View Choices'
    },
    {
      name: 'index',
      help: 'The index of the currently selected view',
      defaultValue: 0,
      preSet: function(old, nu) {
        if (nu < 0) return 0;
        if (nu >= this.views.length) return this.views.length - 1;
        return nu;
      },
      postSet: function(oldValue, viewChoice) {
        this.views[oldValue].view().deepPublish(this.ON_HIDE);
        // ON_SHOW is called after the animation is done.
        this.snapToCurrent(Math.abs(oldValue - viewChoice));
      },
      hidden: true
    },
    {
      name: 'headerView',
      help: 'Optional View to be displayed in header.',
      factory: function() {
        return this.X.ChoiceListView.create({
          choices: this.views.map(function(x) {
            return x.label;
          }),
          index$: this.index$,
          className: 'swipeAltHeader foamChoiceListView horizontal'
        });
      }
    },
    {
      name: 'data',
      help: 'Generic data field for the views. Proxied to all the child views.',
      postSet: function(old, nu) {
        this.views.forEach(function(c) {
          c.view().data = nu;
        });
      }
    },
    {
      name: 'slider',
      help: 'Internal element which gets translated around',
      hidden: true
    },
    {
      name: 'width',
      help: 'Set when we know the width',
      hidden: true
    },
    {
      name: 'x',
      help: 'X coordinate of the translation',
      hidden: true,
      postSet: function(old, nu) {
        // TODO: Other browsers.
        this.slider.style['-webkit-transform'] = 'translate3d(-' +
            nu + 'px, 0, 0)';
      }
    },
    {
      name: 'swipeGesture',
      hidden: true,
      transient: true,
      factory: function() {
        return this.X.GestureTarget.create({
          containerID: this.id,
          handler: this,
          gesture: 'horizontalScroll'
        });
      }
    }
  ],

  methods: {
    init: function() {
      this.SUPER();
      var self = this;
      this.views.forEach(function(choice, index) {
        if ( index != self.index )
          choice.view().deepPublish(self.ON_HIDE);
      });
      this.views[this.index].view().deepPublish(this.ON_SHOW);
    },

    // The general structure of the carousel is:
    // - An outer div (this.$), with position: relative.
    // - A second div (this.slider) with position: relative.
    //   This is the div that gets translated to and fro.
    // - A set of internal divs (this.slider.children) for the child views.
    //   These are positioned inside the slider right next to each other,
    //   and they have the same width as the outer div.
    //   At most two of these can be visible at a time.
    //
    // If the width is not set yet, this renders a fake carousel. It has the
    // outer, slider and inner divs, but there's only one inner div and it
    // can't slide yet. Shortly thereafter, the slide is expanded and the
    // other views are added. This should be imperceptible to the user.
    toHTML: function() {
      var str  = [];
      var viewChoice = this.views[this.index];

      if ( this.headerView ) {
        str.push(this.headerView.toHTML());
        this.addChild(this.headerView);
      }

      str.push('<div id="' + this.id + '" class="swipeAltOuter">');
      str.push('<div class="swipeAltSlider" style="width: 100%">');
      str.push('<div class="swipeAltInner" style="left: 0px">');

      str.push(viewChoice.view().toHTML());

      str.push('</div>');
      str.push('</div>');
      str.push('</div>');

      return str.join('');
    },

    initHTML: function() {
      if ( ! this.$ ) return;
      this.SUPER();

      // Now is the time to inflate our fake carousel into the real thing.
      // For now we won't worry about re-rendering the current one.
      // TODO: Stop re-rendering if it's slow or causes flicker or whatever.

      this.slider = this.$.children[0];
      this.width  = this.$.clientWidth;

      var str = [];
      for ( var i = 0 ; i < this.views.length ; i++ ) {
        // Hide all views except the first one.  They'll be shown after they're resized.
        // This prevents all views from overlapping on startup.
        str.push('<div class="swipeAltInner"' + ( i ? ' style="visibility:hidden;"' : '' ) + '>');
        str.push(this.views[i].view().toHTML());
        str.push('</div>');
      }

      this.slider.innerHTML = str.join('');

      window.addEventListener('resize', this.resize, false);
      this.X.gestureManager.install(this.swipeGesture);

      // Wait for the new HTML to render first, then init it.
      var self = this;
      window.setTimeout(function() {
        self.resize();
        self.views.forEach(function(choice) {
          choice.view().initHTML();
        });
        var vs = self.slider.querySelectorAll('.swipeAltInner');
        for ( var i = 0 ; i < vs.length ; i++ ) vs[i].style.visibility = '';
      }, 0);
    },

    destroy: function() {
      this.SUPER();
      this.X.gestureManager.uninstall(this.swipeGesture);
      this.views.forEach(function(c) { c.view().destroy(); });
    },

    snapToCurrent: function(sizeOfMove) {
      var self = this;
      var time = 150 + sizeOfMove * 150;
      Movement.animate(time, function(evt) {
        self.x = self.index * self.width;
      }, Movement.ease(150/time, 150/time), function() {
        self.views[self.index].view().deepPublish(self.ON_SHOW);
      })();
    }
  },

  listeners: [
    {
      name: 'resize',
      isMerged: 100,
      code: function() {
        // When the orientation of the screen has changed, update the
        // left and width values of the inner elements and slider.
        if ( ! this.$ ) {
          window.removeEventListener('resize', this.resize, false);
          return;
        }

        this.width = this.$.clientWidth;
        var self = this;
        var frame = window.requestAnimationFrame(function() {
          self.x = self.index * self.width;

          for ( var i = 0 ; i < self.slider.children.length ; i++ ) {
            self.slider.children[i].style.left = (i * 100) + '%';
            self.slider.children[i].style.visibility = '';
          }

          window.cancelAnimationFrame(frame);
        });
      }
    },
    {
      name: 'horizontalScrollMove',
      code: function(dx, tx, x) {
        var x = this.index * this.width - tx;

        // Limit x to be within the scope of the slider: no dragging too far.
        if (x < 0) x = 0;
        var maxWidth = (this.views.length - 1) * this.width;
        if ( x > maxWidth ) x = maxWidth;

        this.x = x;
      }
    },
    {
      name: 'horizontalScrollEnd',
      code: function(dx, tx, x) {
        if ( Math.abs(tx) > this.width / 3 ) {
          // Consider that a move.
          if (tx < 0) {
            this.index++;
          } else {
            this.index--;
          }
        } else {
          this.snapToCurrent(1);
        }
      }
    }
  ],
  templates: [
    function CSS() {/*
      .swipeAltInner {
        position: absolute;
        top: 0px;
        height: 100%;
        width: 100%;
      }

      .swipeAltOuter {
        display: flex;
        overflow: hidden;
        min-width: 240px;
        width: 100%;
      }

      .swipeAltSlider {
        position: relative;
        width: 100%;
        top: 0px;
        -webkit-transform: translate3d(0,0,0);
      }

    */}
  ]
});


CLASS({
  name: 'GalleryView',
  extendsModel: 'SwipeAltView',

  properties: [
    {
      name: 'images',
      required: true,
      help: 'List of image URLs for the gallery',
      postSet: function(old, nu) {
        this.views = nu.map(function(src) {
          return ViewChoice.create({
            view: GalleryImageView.create({ source: src })
          });
        });
      }
    },
    {
      name: 'height',
      help: 'Optionally set the height'
    },
    {
      name: 'headerView',
      factory: function() { return null; }
    }
  ],

  methods: {
    initHTML: function() {
      this.SUPER();

      // Add an extra div to the outer one.
      // It's absolutely positioned at the bottom, and contains the circles.
      var circlesDiv = document.createElement('div');
      circlesDiv.classList.add('galleryCirclesOuter');
      for ( var i = 0 ; i < this.views.length ; i++ ) {
        var circle = document.createElement('div');
        //circle.appendChild(document.createTextNode('*'));
        circle.classList.add('galleryCircle');
        if ( this.index == i ) circle.classList.add('selected');
        circlesDiv.appendChild(circle);
      }

      this.$.appendChild(circlesDiv);
      this.$.classList.add('galleryView');
      this.$.style.height = this.height;

      this.index$.addListener(function(obj, prop, old, nu) {
        circlesDiv.children[old].classList.remove('selected');
        circlesDiv.children[nu].classList.add('selected');
      });
    }
  }
});


CLASS({
  name: 'GalleryImageView',
  extendsModel: 'View',

  properties: [ 'source' ],

  methods: {
    toHTML: function() {
      return '<img class="galleryImage" src="' + this.source + '" />';
    }
  }
});


CLASS({
  name: 'ModelAlternateView',
  extendsModel: 'AlternateView',
  methods: {
    init: function() {
      // TODO: super.init
      this.views = FOAM([
        {
          model_: 'ViewChoice',
          label:  'GUI',
          view:   'DetailView'
        },
        {
          model_: 'ViewChoice',
          label:  'JS',
          view:   'JSView'
        },
        {
          model_: 'ViewChoice',
          label:  'XML',
          view:   'XMLView'
        },
        {
          model_: 'ViewChoice',
          label:  'UML',
          view:   'XMLView'
        },
        {
          model_: 'ViewChoice',
          label:  'Split',
          view:   'SplitView'
        }
      ]);
    }
  }
});


CLASS({
  name: 'AbstractNumberFieldView',

  extendsModel: 'TextFieldView',
  abstractModel: true,

  properties: [
    { name: 'type', defaultValue: 'number' },
    { name: 'step' }
  ],

  methods: {
    extraAttributes: function() {
      return this.step ? ' step="' + this.step + '"' : '';
    }
  }
});


CLASS({
  name: 'FloatFieldView',

  extendsModel: 'AbstractNumberFieldView',

  properties: [
    { name: 'precision', defaultValue: undefined }
  ],

  methods: {
    formatNumber: function(val) {
      if ( ! val ) return '0';
      val = val.toFixed(this.precision);
      var i = val.length-1;
      for ( ; i > 0 && val.charAt(i) === '0' ; i-- );
      return val.substring(0, val.charAt(i) === '.' ? i : i+1);
    },
    valueToText: function(val) {
      return this.hasOwnProperty('precision') ?
        this.formatNumber(val) :
        '' + val ;
    },
    textToValue: function(text) { return parseFloat(text) || 0; }
  }
});


CLASS({
  name: 'IntFieldView',

  extendsModel: 'AbstractNumberFieldView',

  methods: {
    textToValue: function(text) { return parseInt(text) || '0'; },
    valueToText: function(value) { return value ? value : '0'; }
  }
});


CLASS({
  name: 'StringArrayView',

  extendsModel: 'TextFieldView',

  methods: {
    findCurrentValues: function() {
      var start = this.$.selectionStart;
      var value = this.$.value;

      var values = value.split(',');
      var i = 0;
      var sum = 0;

      while ( sum + values[i].length < start ) {
        sum += values[i].length + 1;
        i++;
      }

      return { values: values, i: i };
    },
    setValues: function(values, index) {
      this.domValue.set(this.valueToText(values) + ',');
      this.data = this.textToValue(this.domValue.get());

      var isLast = values.length - 1 === index;
      var selection = 0;
      for ( var i = 0; i <= index; i++ ) {
        selection += values[i].length + 1;
      }
      this.$.setSelectionRange(selection, selection);
      isLast && this.X.setTimeout((function() {
        this.autocompleteView.autocomplete('');
      }).bind(this), 0);
    },
    onAutocomplete: function(data) {
      var current = this.findCurrentValues();
      current.values[current.i] = data;
      this.setValues(current.values, current.i);
    },
    bindAutocompleteEvents: function(view) {
      // TODO: Refactor this.
      var self = this;
      function onInput() {
        var values = self.findCurrentValues();
        view.autocomplete(values.values[values.i]);
      }
      this.$.addEventListener('input', onInput);
      this.$.addEventListener('focus', onInput);
      this.$.addEventListener('blur', function() {
        // Notify the autocomplete view of a blur, it can decide what to do from there.
        view.publish('blur');
      });
    },
    textToValue: function(text) { return text === "" ? [] : text.replace(/\s/g,'').split(','); },
    valueToText: function(value) { return value ? value.toString() : ""; }
  }
});


CLASS({
  name: 'MultiLineStringArrayView',
  extendsModel: 'View',

  properties: [
    {
      model_: 'StringProperty',
      name: 'name'
    },
    {
      model_: 'StringProperty',
      name: 'type',
      defaultValue: 'text'
    },
    {
      model_: 'IntProperty',
      name: 'displayWidth',
      defaultValue: 30
    },
    {
      model_: 'BooleanProperty',
      name: 'onKeyMode',
      defaultValue: true
    },
    {
      model_: 'BooleanProperty',
      name: 'autocomplete',
      defaultValue: true
    },
    {
      name: 'data'
    },
    'autocompleter',
    {
      model_: 'ArrayProperty',
      subType: 'MultiLineStringArrayView.RowView',
      name: 'inputs'
    }
  ],

  models: [
    {
      model_: 'Model',
      name: 'RowView',
      extendsModel: 'View',
      properties: [
        'field',
        {
          name: 'tagName',
          defaultValue: 'div'
        }
      ],
      methods: {
        toInnerHTML: function() {
          this.children = [this.field];
          return this.field.toHTML() + '<input type="button" id="' +
            this.on('click', (function(){ this.publish('remove'); }).bind(this)) +
            '" class="multiLineStringRemove" value="X">';
        }
      }
    }
  ],

  methods: {
    toHTML: function() {
      var toolbar = ToolbarView.create({
        data: this
      });
      toolbar.addActions([this.model_.ADD]);
      this.children = [toolbar];

      return '<div id="' + this.id + '"><div></div>' +
        toolbar.toHTML() +
        '</div>';
    },
    initHTML: function() {
      this.SUPER();
      this.data$.addListener(this.update);
      this.update();
    },
    row: function() {
      // TODO: Find a better way to copy relevant values as this is unsustainable.
      var view = this.model_.RowView.create({
        field: this.X.TextFieldView.create({
          name: this.name,
          type: this.type,
          displayWidth: this.displayWidth,
          onKeyMode: this.onKeyMode,
          autocomplete: this.autocomplete,
          autocompleter: this.autocompleter
        })
      });
      return view;
    },
    setValue: function(value) {
      this.value = value;
    }
  },

  listeners: [
    {
      name: 'update',
      code: function() {
        if ( ! this.$ ) return;

        var inputs = this.inputs;
        var inputElement = this.$.firstElementChild;
        var newViews = [];
        var data = this.data;

        // Add/remove rows as necessary.
        if ( inputs.length > data.length ) {
          for ( var i = data.length; i < inputs.length; i++ ) {
            inputs[i].$.remove();
            this.removeChild(inputs[i]);
          }
          inputs.length = data.length;
        } else {
          var extra = "";

          for ( i = inputs.length; i < data.length; i++ ) {
            var view = this.row();

            // TODO: This seems ridiculous.
            this.addChild(view);
            newViews.push(view);
            inputs.push(view);

            view.subscribe('remove', this.onRemove);
            view.field.data$.addListener(this.onInput);
            extra += view.toHTML();
          }

          if ( extra ) inputElement.insertAdjacentHTML('beforeend', extra);
        }

        // Only update the value for a row if it does not match.
        for ( i = 0; i < data.length; i++ ) {
          if ( inputs[i].field.data !== data[i] )
            inputs[i].field.data = data[i];
        }

        this.inputs = inputs;

        for ( i = 0; i < newViews.length; i++ )
          newViews[i].initHTML();
      }
    },
    {
      name: 'onRemove',
      code: function(src) {
        var inputs = this.inputs;
        for ( var i = 0; i < inputs.length; i++ ) {
          if ( inputs[i] === src ) {
            this.data = this.data.slice(0, i).concat(this.data.slice(i+1));
            break;
          }
        }
      }
    },
    {
      name: 'onInput',
      code: function(e) {
        if ( ! this.$ ) return;

        var inputs = this.inputs;
        var newdata = [];

        for ( var i = 0; i < inputs.length; i++ ) {
          newdata.push(inputs[i].field.data);
        }
        this.data = newdata;
      }
    }
  ],

  actions: [
    {
      name: 'add',
      label: 'Add',
      action: function() {
        this.data = this.data.pushF('');
      }
    }
  ]
});


CLASS({
  extendsModel: 'View',

  name: 'SplitView',

  properties: [
    {
      name: 'data'
    },
    {
      name:  'view1',
      label: 'View 1'
    },
    {
      name:  'view2',
      label: 'View 2'
    }
  ],

  methods: {
    init: function() {
      this.SUPER();

      this.view1 = DetailView.create({data$: this.data$});
      this.view2 = JSView.create({data$: this.data$});
    },

    toHTML: function() {
      var str  = [];
      str.push('<table width=80%><tr><td width=40%>');
      str.push(this.view1.toHTML());
      str.push('</td><td>');
      str.push(this.view2.toHTML());
      str.push('</td></tr></table><tr><td width=40%>');
      return str.join('');
    },

    initHTML: function() {
      this.view1.initHTML();
      this.view2.initHTML();
    }
  }
});


CLASS({
  name: 'ListValueView',
  help: 'Combines an input view with a value view for the edited value.',

  extendsModel: 'View',

  properties: [
    {
      name: 'valueView'
    },
    {
      name: 'inputView'
    },
    {
      name: 'placeholder',
      postSet: function(_, newValue) {
        this.inputView.placeholder = newValue;
      }
    },
    {
      name: 'data',
      factory: function() { return []; }
    }
  ],

  methods: {
    focus: function() { this.inputView.focus(); },
    toHTML: function() {
      this.valueView.lastView = this.inputView;
      return this.valueView.toHTML();
    },
    initHTML: function() {
      this.SUPER();
      this.valueView.data$ = this.data$;
      this.inputView.data$ = this.data$;
      this.valueView.initHTML();
    }
  }
});

CLASS({
  name: 'ArrayListView',
  extendsModel: 'View',

  properties: [
    {
      name: 'data',
      postSet: function(oldValue, newValue) {
        this.update();
      }
    },
    {
      model_: 'ModelProperty',
      name: 'listView'
    },
    {
      model_: 'ModelProperty',
      name: 'subType'
    }
  ],

  methods: {
    toHTML: function() {
      return '<div id="' + this.id + '"></div>';
    },
    initHTML: function() {
      this.SUPER();
      this.update();
    }
  },

  listeners: [
    {
      name: 'update',
      isFramed: true,
      code: function() {
        if ( ! this.$ ) return;
        this.$.innerHTML = '';

        var objs = this.data;
        var children = new Array(objs.length);

        for ( var i = 0; i < objs.length; i++ ) {
          var view = this.listView.create();
          children[i] = view;
          view.data = objs[i];
        }

        this.$.innerHTML = children.map(function(c) { return c.toHTML(); }).join('');
        children.forEach(function(c) { c.initHTML(); });
      }
    }
  ]
});


CLASS({
  name: 'KeyView',
  extendsModel: 'View',

  properties: [
    {
      name: 'dao',
      factory: function() { return this.X[this.subType + 'DAO']; }
    },
    { name: 'mode' },
    {
      name: 'data',
      postSet: function(_, value) {
        var self = this;
        var subKey = FOAM.lookup(this.subKey, this.X);
        this.dao.where(EQ(subKey, value)).limit(1).select({
          put: function(o) {
            self.innerData = o;
          }
        });
      }
    },
    {
      name: 'innerData',
    },
    { name: 'subType' },
    {
      name: 'model',
      defaultValueFn: function() { return this.X[this.subType]; }
    },
    { name: 'subKey' },
    {
      name: 'innerView',
      defaultValue: 'DetailView'
    },
  ],

  methods: {
    toHTML: function() {
      this.children = [];
      var view = FOAM.lookup(this.innerView).create({ model: this.model, mode: this.mode, data$: this.innerData$ });
      this.addChild(view);
      return view.toHTML();
    }
  }
});


CLASS({
  name: 'DAOKeyView',
  extendsModel: 'View',

  properties: [
    {
      name: 'dao',
      factory: function() { return this.X[this.subType + 'DAO']; }
    },
    { name: 'mode' },
    {
      name: 'data',
      postSet: function(_, value) {
        var self = this;
        var subKey = FOAM.lookup(this.subKey, this.X);
        this.innerData = this.dao.where(IN(subKey, value));
      }
    },
    {
      name: 'innerData',
    },
    { name: 'subType' },
    {
      name: 'model',
      defaultValueFn: function() { return this.X[this.subType]; }
    },
    { name: 'subKey' },
    {
      name: 'innerView',
      defaultValue: 'DAOListView'
    },
    'dataView'
  ],

  methods: {
    toHTML: function() {
      this.children = [];
      var view = FOAM.lookup(this.innerView).create({ model: this.model, mode: this.mode, data$: this.innerData$ });
      this.addChild(view);
      return view.toHTML();
    }
  }
});

CLASS({
  name: 'AutocompleteListView',

  extendsModel: 'View',

  properties: [
    {
      name: 'dao',
      postSet: function(oldValue, newValue) {
        oldValue && oldValue.unlisten(this.paint);
        newValue.listen(this.paint);
        this.data = '';
        this.paint();
      },
      hidden: true
    },
    {
      name: 'data',
      hidden: true
    },
    {
      name: 'model',
      hidden: true
    },
    {
      name: 'innerView',
      type: 'View',
      preSet: function(_, value) {
        if ( typeof value === "string" ) value = GLOBAL[value];
        return value;
      },
      defaultValueFn: function() {
        return this.model.listView;
      }
    },
    {
      model_: 'ArrayProperty',
      name: 'objs'
    },
    {
      model_: 'IntProperty',
      name: 'selection',
      defaultValue: 0,
      postSet: function(oldValue, newValue) {
        this.data = this.objs[newValue];
        if ( this.$ ) {
          if ( this.$.children[oldValue] )
            this.$.children[oldValue].className = 'autocompleteListItem';
          this.$.children[newValue].className += ' autocompleteSelectedItem';
        }
      }
    },
    {
      model_: 'IntProperty',
      name: 'count',
      defaultValue: 20
    },
    {
      model_: 'IntProperty',
      name: 'left'
    },
    {
      model_: 'IntProperty',
      name: 'top'
    },
  ],

  methods: {
    initHTML: function() {
      this.SUPER();
      this.$.style.display = 'none';
      var self = this;
      this.propertyValue('left').addListener(function(v) {
        self.$.left = v;
      });
      this.propertyValue('top').addListener(function(v) {
        self.$.top = v;
      });
    },

    nextSelection: function() {
      if ( this.objs.length === 0 ) return;
      var next = this.selection + 1;
      if ( next >= this.objs.length )
        next = 0;
      this.selection = next;
    },

    prevSelection: function() {
      if ( this.objs.length === 0 ) return;
      var next = this.selection - 1;
      if ( next < 0 )
        next = this.objs.length - 1;
      this.selection = next;
    }
  },

  templates: [
    {
      name: 'toHTML',
      template: '<ul class="autocompleteListView" id="<%= this.id %>"></ul>'
    }
  ],

  listeners: [
    {
      name: 'paint',
      isFramed: true,
      code: function() {
        if ( ! this.$ ) return;

        // TODO Determine if its worth double buffering the dom.
        var objs = [];
        var newSelection = 0;
        var value = this.data;
        var self = this;

        this.dao.limit(this.count).select({
          put: function(obj) {
            objs.push(obj);
            if ( obj.id === value.id )
              newSelection = objs.length - 1;
          },
          eof: function() {
            // Clear old list
            self.$.innerHTML = '';
            self.objs = objs;

            if ( objs.length === 0 ) {
              self.$.style.display = 'none';
              return;
            }

            for ( var i = 0; i < objs.length; i++ ) {
              var obj = objs[i];
              var view = self.innerView.create({});
              var container = document.createElement('li');
              container.onclick = (function(index) {
                return function(e) {
                  self.selection = index;
                  self.publish('selected');
                };
              })(i);
              container.className = 'autocompleteListItem';
              self.$.appendChild(container);
              view.data = obj;
              container.innerHTML = view.toHTML();
              view.initHTML();
            }

            self.selection = newSelection;
            self.$.style.display = '';
          }
        });
      }
    }
  ]
});


CLASS({
  name: 'ViewSwitcher',
  extendsModel: 'View',

  help: 'A view which cycles between an array of views.',

  properties: [
    {
      name: 'views',
      factory: function() { return []; },
      postSet: function() {
        this.viewIndex = this.viewIndex;
      },
    },
    {
      name: 'data',
      postSet: function(_, data) { this.activeView.data = data; }
    },
    {
      name: 'activeView',
      postSet: function(old, view) {
        if ( old ) {
          old.unsubscribe('nextview', this.onNextView);
          old.unsubscribe('prevview', this.onPrevView);
        }
        view.subscribe('nextview', this.onNextView);
        view.subscribe('prevview', this.onPrevView);
        view.data = this.data;
      }
    },
    {
      model_: 'IntProperty',
      name: 'viewIndex',
      preSet: function(_, value) {
        if ( value >= this.views.length ) return 0;
        if ( value < 0 ) return this.views.length - 1;
        return value;
      },
      postSet: function() {
        this.activeView = this.views[this.viewIndex];
      }
    }
  ],

  methods: {
    toHTML: function() {
      return '<div id="' + this.id + '" style="display:none"></div>' + this.toInnerHTML();
    },

    updateHTML: function() {
      if ( ! this.$ ) return;
      this.$.nextElementSibling.outerHTML = this.toInnerHTML();
      this.initInnerHTML();
    },

    toInnerHTML: function() {
      return this.activeView.toHTML();
    },

    initInnerHTML: function() {
      this.activeView.initInnerHTML();
    }
  },

  listeners: [
    {
      name: 'onNextView',
      code: function() {
        this.viewIndex = this.viewIndex + 1;
        this.updateHTML();
      }
    },
    {
      name: 'onPrevView',
      code: function() {
        this.viewIndex = this.viewIndex - 1;
        this.updateHTML();
      }
    }
  ]
});


CLASS({
  name: 'ListInputView',

  extendsModel: 'AbstractDAOView',

  properties: [
    {
      name: 'name'
    },
    {
      name: 'dao',
      help: 'The DAO to fetch autocomplete objects from.',
    },
    {
      name: 'property',
      help: 'The property model to map autocomplete objecst to values with.'
    },
    {
      model_: 'ArrayProperty',
      name: 'searchProperties',
      help: 'The properties with which to construct the autocomplete query with.'
    },
    {
      name: 'autocompleteView',
      postSet: function(oldValue, newValue) {
        oldValue && oldValue.unsubscribe('selected', this.selected);
        newValue.subscribe('selected', this.selected);
      }
    },
    {
      name: 'placeholder',
      postSet: function(oldValue, newValue) {
        if ( this.$ && this.usePlaceholer ) this.$.placeholder = newValue;
      }
    },
    {
      model_: 'BooleanValue',
      name: 'usePlaceholder',
      defaultValue: true,
      postSet: function(_, newValue) {
        if ( this.$ ) this.$.placeholder = newValue ?
          this.placeholder : '';
      }
    },
    {
      name: 'data',
      help: 'The array value we are editing.',
      factory: function() { return []; }
    },
    {
      name: 'domInputValue'
    }
  ],

  methods: {
    toHTML: function() {
      this.on('keydown', this.onKeyDown, this.id);
      this.on('blur',    this.framed(this.delay(200, this.framed(this.framed(this.onBlur)))), this.id);
      this.on('focus',   this.onInput, this.id);

      return '<input name="' + this.name + '" type="text" id="' + this.id + '" class="listInputView">' + this.autocompleteView.toHTML();
    },
    initHTML: function() {
      this.SUPER();

      if ( this.usePlaceholder && this.placeholder )
        this.$.placeholder = this.placeholder;

      this.autocompleteView.initHTML();
      this.domInputValue = DomValue.create(this.$, 'input');
      this.domInputValue.addListener(this.onInput);
    },
    pushValue: function(v) {
      this.data = this.data.concat(v);
      this.domInputValue.set('');
      // Previous line doesn't trigger listeners.
      this.onInput();
    },
    popValue: function() {
      var a = this.data.slice();
      a.pop();
      this.data = a;
    }
  },

  listeners: [
    {
      name: 'selected',
      code: function() {
        if ( this.autocompleteView.data ) {
          this.pushValue(
            this.property.f(this.autocompleteView.data));
        }
        this.scrollContainer = e || window;
        this.scrollContainer.addEventListener('scroll', this.onScroll, false);
      }
    },
    {
      name: 'onInput',
      code: function() {
        var value = this.domInputValue.get();

        if ( value.charAt(value.length - 1) === ',' ) {
          if ( value.length > 1 ) this.pushValue(value.substring(0, value.length - 1));
          else this.domInputValue.set('');
          return;
        }

        if ( value === '' ) {
          this.autocompleteView.dao = [];
          return;
        }

        var predicate = OR();
        value = this.domInputValue.get();
        for ( var i = 0; i < this.searchProperties.length; i++ ) {
          predicate.args.push(STARTS_WITH(this.searchProperties[i], value));
        }
        value = this.data;
        if ( value.length > 0 ) {
          predicate = AND(NOT(IN(this.property, value)), predicate);
        }
        this.autocompleteView.dao = this.dao.where(predicate);
      }
    },
    {
      name: 'onKeyDown',
      code: function(e) {
        if ( e.keyCode === 40 /* down */) {
          this.autocompleteView.nextSelection();
          e.preventDefault();
        } else if ( e.keyCode === 38 /* up */ ) {
          this.autocompleteView.prevSelection();
          e.preventDefault();
        } else if ( e.keyCode === 13 /* RET */ || e.keyCode === 9 /* TAB */ ) {
          if ( this.autocompleteView.data ) {
            this.pushValue(
              this.property.f(this.autocompleteView.data));
            e.preventDefault();
          }
        } else if ( e.keyCode === 8 && this.domInputValue.get() === '' ) {
          this.popValue();
        }
      }
    },
    {
      name: 'onBlur',
      code: function(e) {
        var value = this.domInputValue.get();
        if ( value.length > 0 ) {
          this.pushValue(value);
        } else {
          this.domInputValue.set('');
        }
        this.autocompleteView.dao = [];
      }
    },
    {
      name: 'onValueChange',
      code: function() {
        this.usePlaceholder = this.data.length == 0;
      }
    }
  ]
});


/**
 * The default vertical scrollbar view for a ScrollView. It appears during
 * scrolling and fades out after scrolling stops.
 *
 * TODO: create a version that can respond to mouse input.
 * TODO: a horizontal scrollbar. Either a separate view, or a generalization of
 * this one.
 */
CLASS({
  name: 'VerticalScrollbarView',
  extendsModel: 'View',

  properties: [
    {
      name: 'scrollTop',
      model_: 'IntProperty',
      postSet: function(old, nu) {
        this.show();
        if (this.timeoutID)
          clearTimeout(this.timeoutID);
        if (!this.mouseOver) {
          this.timeoutID = setTimeout(function() {
            this.timeoutID = 0;
            this.hide();
          }.bind(this), 200);
        }
        var maxScrollTop = this.scrollHeight - this.height;
        if (maxScrollTop <= 0)
          return 0;
        var ratio = this.scrollTop / maxScrollTop;
        this.thumbPosition = ratio * (this.height - this.thumbHeight);
      }
    },
    {
      name: 'scrollHeight',
      model_: 'IntProperty'
    },
    {
      name: 'mouseOver',
      model_: 'BooleanProperty',
      defaultValue: false
    },
    {
      name: 'height',
      model_: 'IntProperty',
      postSet: function(old, nu) {
        if ( this.$ ) {
          this.$.style.height = nu + 'px';
        }
      }
    },
    {
      name: 'width',
      model_: 'IntProperty',
      defaultValue: 12,
      postSet: function(old, nu) {
        if (this.$) {
          this.$.style.width = nu + 'px';
        }
        var thumb = this.thumb();
        if (thumb) {
          thumb.style.width = nu + 'px';
        }
      }
    },
    {
      name: 'thumbID',
      factory: function() {
        return this.nextID();
      }
    },
    {
      name: 'thumbHeight',
      dynamicValue: function() {
        var id = this.thumbID;
        var height = this.height;
        if (!this.scrollHeight)
          return 0;
        return height * height / this.scrollHeight;
      },
      postSet: function(old, nu) {
        var thumb = this.thumb();
        if (thumb) {
          thumb.style.height = nu + 'px';
        }
      }
    },
    {
      name: 'thumbPosition',
      defaultValue: 0,
      postSet: function(old, nu) {
        var old = this.oldThumbPosition_ || old;

        // Don't bother moving less than 2px
        if ( Math.abs(old-nu) < 2.0 ) return;

        var thumb = this.thumb();
        if ( thumb ) {
          this.oldThumbPosition_ = nu;
          // TODO: need to generalize this transform stuff.
          thumb.style.webkitTransform = 'translate3d(0px, ' + nu + 'px, 0px)';
        }
      }
    },
    {
      name: 'lastDragY',
      model_: 'IntProperty'
    }
  ],

  methods: {
    thumb: function() { return this.X.$(this.thumbID); },
    initHTML: function() {
      this.SUPER();

      if ( ! this.$ ) return;
      this.$.addEventListener('mouseover', this.onMouseEnter);
      this.$.addEventListener('mouseout',  this.onMouseOut);
      this.$.addEventListener('click', this.onTrackClick);
      this.thumb().addEventListener('mousedown', this.onStartThumbDrag);
      this.thumb().addEventListener('click', function(e) { e.stopPropagation(); });

      this.shown_ = false;
    },
    show: function() {
      if ( this.shown_ ) return;
      this.shown_ = true;

      var thumb = this.thumb();
      if (thumb) {
        thumb.style.webkitTransition = '';
        thumb.style.opacity = '0.3';
      }
    },
    hide: function() {
      if ( ! this.shown_ ) return;
      this.shown_ = false;

      var thumb = this.thumb();
      if (thumb) {
        thumb.style.webkitTransition = '200ms opacity';
        thumb.style.opacity = '0';
      }
    },
    maxScrollTop: function() {
      return this.scrollHeight - this.height;
    }
  },

  listeners: [
    {
      name: 'onMouseEnter',
      code: function(e) {
        this.mouseOver = true;
        this.show();
      }
    },
    {
      name: 'onMouseOut',
      code: function(e) {
        this.mouseOver = false;
        this.hide();
      }
    },
    {
      name: 'onStartThumbDrag',
      code: function(e) {
        this.lastDragY = e.screenY;
        document.body.addEventListener('mousemove', this.onThumbDrag);
        document.body.addEventListener('mouseup', this.onStopThumbDrag);
        e.preventDefault();
      }
    },
    {
      name: 'onThumbDrag',
      code: function(e) {
        if (this.maxScrollTop() <= 0)
          return;

        var dy = e.screenY - this.lastDragY;
        var newScrollTop = this.scrollTop + (this.maxScrollTop() * dy) / (this.height - this.thumbHeight);
        this.scrollTop = Math.min(this.maxScrollTop(), Math.max(0, newScrollTop));
        this.lastDragY = e.screenY;
        e.preventDefault();
      }
    },
    {
      name: 'onStopThumbDrag',
      code: function(e) {
        document.body.removeEventListener('mousemove', this.onThumbDrag);
        document.body.removeEventListener('mouseup', this.onStopThumbDrag, true);
        e.preventDefault();
      }
    },
    {
      name: 'onTrackClick',
      code: function(e) {
        if (this.maxScrollTop() <= 0)
          return;
        var delta = this.height;
        if (e.clientY < this.thumbPosition)
          delta *= -1;
        var newScrollTop = this.scrollTop + delta;
        this.scrollTop = Math.min(this.maxScrollTop(), Math.max(0, newScrollTop));
      }
    }
  ],

  templates: [
    function toHTML() {/*
      <div id="%%id" style="position: absolute;
                            width: <%= this.width %>px;
                            height: <%= this.height %>px;
                            right: 0px;
                            background: rgba(0, 0, 0, 0.1);
                            z-index: 2;">
        <div id="%%thumbID" style="
            opacity: 0;
            position: absolute;
            width: <%= this.width %>px;
            background:#333;">
        </div>
      </div>
    */}
  ]
});


CLASS({
  name: 'UnitTestResultView',
  extendsModel: 'View',

  properties: [
    {
      name: 'data'
    },
    {
      name: 'test',
      defaultValueFn: function() { return this.parent.data; }
    }
  ],

  templates: [
    function toHTML() {/*
      <br>
      <div>Output:</div>
      <pre>
        <div class="output" id="<%= this.setClass('error', function() { return this.parent.data.failed; }, this.id) %>">
        </div>
      </pre>
    */},
   function toInnerHTML() {/*
     <%= TextFieldView.create({ data: this.data, mode: 'read-only', escapeHTML: false }) %>
   */}
  ],
  methods: {
    initHTML: function() {
      this.SUPER();
      var self = this;
      this.preTest();
      this.test.atest()(function() {
        self.postTest();
        self.X.asyncCallback && self.X.asyncCallback();
      });
    },
    preTest: function() {
      // Override me to insert logic at the start of initHTML, before running the test.
    },
    postTest: function() {
      this.updateHTML();
      // Override me to insert logic after running this test.
      // Called asynchronously, after atest() is really finished.
    }
  }
});

CLASS({
  name: 'RegressionTestValueView',
  extendsModel: 'TextFieldView',
  properties: [
    {
      name: 'mode',
      defaultValue: 'read-only'
    },
    {
      name: 'escapeHTML',
      defaultValue: false
    }
  ]
});

CLASS({
  name: 'RegressionTestResultView',
  label: 'Regression Test Result View',
  documentation: 'Displays the output of a $$DOC{.ref:"RegressionTest"}, either master or live.',

  extendsModel: 'UnitTestResultView',

  properties: [
    {
      name: 'masterView',
      defaultValue: 'RegressionTestValueView'
    },
    {
      name: 'liveView',
      defaultValue: 'RegressionTestValueView'
    },
    {
      name: 'masterID',
      factory: function() { return this.nextID(); }
    },
    {
      name: 'liveID',
      factory: function() { return this.nextID(); }
    }
  ],

  actions: [
    {
      name: 'update',
      label: 'Update Master',
      documentation: 'Overwrite the old master output with the new. Be careful that the new result is legit!',
      isEnabled: function() { return this.test.regression; },
      action: function() {
        this.test.master = this.test.results;
        this.test.regression = false;
        if ( this.X.testUpdateListener ) this.X.testUpdateListener();
      }
    }
  ],

  templates: [
    function toHTML() {/*
      <br>
      <div>Output:</div>
      <table id="<%= this.setClass('error', function() { return this.test.regression; }) %>">
        <tbody>
          <tr>
            <th>Master</th>
            <th>Live</th>
          </tr>
          <tr>
            <td class="output" id="<%= this.setClass('error', function() { return this.test.regression; }, this.masterID) %>">
              <% this.masterView = FOAM.lookup(this.masterView, this.X).create({ data$: this.test.master$ }); out(this.masterView); %>
            </td>
            <td class="output" id="<%= this.setClass('error', function() { return this.test.regression; }, this.liveID) %>">
              <% this.liveView = FOAM.lookup(this.liveView, this.X).create({ data$: this.test.results$ }); out(this.liveView); %>
            </td>
          </tr>
        </tbody>
      </table>
      $$update
    */}
  ]
});

CLASS({
  name: 'UITestResultView',
  label: 'UI Test Result View',
  help: 'Overrides the inner masterView and liveView for UITests.',

  extendsModel: 'UnitTestResultView',

  properties: [
    {
      name: 'liveView',
      getter: function() { return this.X.$(this.liveID); }
    },
    {
      name: 'liveID',
      factory: function() { return this.nextID(); }
    }
  ],

  methods: {
    preTest: function() {
      var test = this.test;
      var $ = this.liveView;
      test.append = function(s) { $.insertAdjacentHTML('beforeend', s); };
      test.X.render = function(v) {
        test.append(v.toHTML());
        v.initHTML();
      };
    }
  },

  templates: [
    function toHTML() {/*
      <br>
      <div>Output:</div>
        <div class="output" id="<%= this.setClass('error', function() { return this.test.failed > 0; }, this.liveID) %>">
        </div>
      </div>
    */}
  ]
});


CLASS({
  name: 'SlidePanelView',
  extendsModel: 'View',

  requires: [
    'GestureTarget'
  ],
  imports: [
    'gestureManager'
  ],

  help: 'A controller that shows a main view with a small strip of the ' +
      'secondary view visible at the right edge. This "panel" can be dragged ' +
      'by a finger or mouse pointer to any position from its small strip to ' +
      'fully exposed. If the containing view is wide enough, both panels ' +
      'will always be visible.',

  properties: [
    { model_: 'ViewFactoryProperty', name: 'mainView' },
    { model_: 'ViewFactoryProperty', name: 'panelView' },
    {
      model_: 'IntProperty',
      name: 'minWidth',
      defaultValueFn: function() {
        var e = this.main$();
        return e ? toNum(this.X.window.getComputedStyle(e).width) : 300;
      }
    },
    {
      model_: 'IntProperty',
      name: 'width',
      model_: 'IntProperty',
      hidden: true,
      help: 'Set internally by the resize handler',
      postSet: function(_, x) {
        this.main$().style.width = x + 'px';
      }
    },
    {
      model_: 'IntProperty',
      name: 'minPanelWidth',
      defaultValueFn: function() {
        if ( this.panelView && this.panelView.minWidth )
          return this.panelView.minWidth + (this.panelView.stripWidth || 0);

        var e = this.panel$();
        return e ? toNum(this.X.window.getComputedStyle(e).width) : 250;
      }
    },
    {
      model_: 'IntProperty',
      name: 'panelWidth',
      hidden: true,
      help: 'Set internally by the resize handler',
      postSet: function(_, x) { this.panel$().style.width = x + 'px'; }
    },
    {
      model_: 'IntProperty',
      name: 'parentWidth',
      help: 'A pseudoproperty that returns the current width (CSS pixels) of the containing element',
      getter: function() { return toNum(this.X.window.getComputedStyle(this.$.parentNode).width); }
    },
    {
      model_: 'IntProperty',
      name: 'stripWidth',
      help: 'The width in (CSS) pixels of the minimal visible strip of panel',
      defaultValue: 30
    },
    {
      model_: 'FloatProperty',
      name: 'panelRatio',
      help: 'The ratio (0-1) of the total width occupied by the panel, when ' +
          'the containing element is wide enough for expanded view.',
      defaultValue: 0.5
    },
    {
      model_: 'IntProperty',
      name: 'panelX',
      //defaultValueFn: function() { this.width - this.stripWidth; },
      preSet: function(oldX, x) {
        if ( oldX !== x ) this.dir_ = oldX.compareTo(x);

        // Bound it between its left and right limits: full open and just the
        // strip.
        if ( x <= this.parentWidth - this.panelWidth )
          return this.parentWidth - this.panelWidth;

        if ( x >= this.parentWidth - this.stripWidth )
          return this.parentWidth - this.stripWidth;

        return x;
      },
      postSet: function(_, x) {
        this.panel$().style.webkitTransform = 'translate3d(' + x + 'px, 0,0)';
      }
    },
    {
      name: 'dragGesture',
      hidden: true,
      transient: true,
      lazyFactory: function() {
        return this.GestureTarget.create({
          containerID: this.id + '-panel',
          handler: this,
          gesture: 'drag'
        });
      }
    },
    'expanded'
  ],

  templates: [
    function CSS() {/*
      .SliderPanel .shadow {
        background: linear-gradient(to left, rgba(0,0,0,0.3) 0%,
                                             rgba(0,0,0,0) 100%);
        height: 100%;
        left: -8px;
        position: absolute;
        width: 8px;
        }
    */},
    function toHTML() {/*
      <div id="%%id" style="display: inline-block;position: relative;" class="SliderPanel">
        <div id="%%id-main">
          <div style="width:0;position:absolute;"></div>
          <%= this.mainView() %>
        </div>
        <div id="%%id-panel" style="position: absolute; top: 0; left: 0">
          <div id="%%id-shadow" class="shadow"></div>
          <%= this.panelView() %>
        </div>
      </div>
    */}
  ],

  methods: {
    initHTML: function() {
      this.gestureManager.install(this.dragGesture);

      // Resize first, then init the outer view, and finally the panel view.
      this.X.window.addEventListener('resize', this.onResize);
      this.onResize();
      this.initChildren(); // We didn't call SUPER(), so we have to do this here.
    },
    snap: function() {
      // TODO: Calculate the animation time based on how far the panel has to move
      Movement.animate(500, function() {
        this.panelX = this.dir_ > 0 ? 0 : 1000;
      }.bind(this))();
    },
    main$: function() { return this.X.$(this.id + '-main'); },
    panel$: function() { return this.X.$(this.id + '-panel'); },
    shadow$: function() { return this.X.$(this.id + '-shadow'); }
  },

  listeners: [
    {
      name: 'onResize',
      isFramed: true,
      code: function(e) {
        if ( ! this.$ ) return;
        if ( this.parentWidth >= this.minWidth + this.minPanelWidth ) {
          this.shadow$().style.display = 'none';
          // Expaded mode. Show the two side by side, setting their widths
          // based on the panelRatio.
          this.panelWidth = Math.max(this.panelRatio * this.parentWidth, this.minPanelWidth);
          this.width = this.parentWidth - this.panelWidth;
          this.panelX = this.width;
          this.expanded = true;
        } else {
          this.shadow$().style.display = 'inline';
          this.width = Math.max(this.parentWidth - this.stripWidth, this.minWidth);
          this.panelWidth = this.minPanelWidth;
          this.panelX = this.width;
          this.expanded = false;
        }
      }
    },
    {
      name: 'dragStart',
      code: function(point) {
        if ( this.expanded ) return;
        // Otherwise, bind panelX to the absolute X.
        var self = this;
        var originalX = this.panelX;
        Events.map(point.x$, this.panelX$, function(x) {
          return originalX + point.totalX;
        });
      }
    },
    {
      name: 'dragEnd',
      code: function(point) {
        if ( this.expanded ) return;
        Events.unfollow(point.x$, this.panelX$);
        this.snap();
      }
    }
  ]
});


CLASS({
  name: 'ActionSheetView',
  extendsModel: 'View',
  traits: ['PositionedDOMViewTrait'],

  properties: [
    'actions',
    'data',
    { name: 'className', defaultValue: 'actionSheet' },
    { name: 'preferredWidth', defaultValue: 200 },
  ],

  help: 'A controller that shows a list of actions.',

  templates: [
    function toInnerHTML() {/*
      <% for( var i = 0, action; action = this.actions[i]; i++ ) {
        var view = this.createActionView(action);
        view.data$ = this.data$;
        out(view);
      } %>
    */},
    function CSS() {/*
      .actionSheet {
        background: white;
      }
    */}
  ]
});


CLASS({
  extendsModel: 'View',
  traits: ['foam.experimental.views.DataConsumerTrait'],

  name: 'CollapsibleView',

  properties: [
    {
      name: 'data'
    },
    {
      name:  'fullView',
      preSet: function(old, nu) {
        if (old) {
            this.removeChild(old);
            Events.unlink(old.data$, this.data$);
        }
        return nu;
      },
      postSet: function() {
        if (this.fullView.data$)
        {
          this.addChild(this.fullView);
          this.fullView.data$ = this.data$;
        }
        this.updateHTML();
      }
    },
    {
      name:  'collapsedView',
      preSet: function(old, nu) {
        if (old) {
            this.removeChild(old);
            Events.unlink(old.data$, this.data$);
        }
        return nu;
      },
      postSet: function() {
        if (this.collapsedView.data$)
        {
          this.addChild(this.collapsedView);
          this.collapsedView.data$ = this.data$;
        }
        this.updateHTML();
      }
    },
    {
      name: 'collapsed',
      defaultValue: true,
      postSet: function() {
        if (this.collapsed) {
          this.collapsedView.$.style.height = "";
          this.fullView.$.style.height = "0";

        } else {
          this.collapsedView.$.style.height = "0";
          this.fullView.$.style.height = "";
        }
      }
    }

  ],

  methods: {
    toInnerHTML: function() {
      // TODO: don't render full view until expanded for the first time?
      var retStr = this.collapsedView.toHTML() + this.fullView.toHTML();
      return retStr;
    },

    initHTML: function() {
      this.SUPER();

      // to ensure we can hide by setting the height
      this.collapsedView.$.style.display = "block";
      this.fullView.$.style.display = "block";
      this.collapsedView.$.style.overflow = "hidden";
      this.fullView.$.style.overflow = "hidden";

      this.collapsed = true;
    }
  },

  actions: [
    {
      name:  'toggle',
      help:  'Toggle collapsed state.',

      labelFn: function() {
        return this.collapsed? 'Expand' : 'Hide';
      },
      isAvailable: function() {
        return true;
      },
      isEnabled: function() {
        return true;//this.collapsedView.toHTML && this.fullView.toHTML;
      },
      action: function() {
        this.collapsed = !this.collapsed;
      }
    },
  ]
});

CLASS({
  name: 'SimpleDynamicViewTrait',
  properties: [
    { name: 'data', postSet: function() { this.updateHTML(); } }
  ],
  methods: {
    updateHTML: function() {
      if ( ! this.$ ) return;
      this.$.outerHTML = this.toHTML();
      this.initHTML();
    }
  }
});

CLASS({
  name: 'ControllerOption',
  properties: [
    { model_: 'ViewFactoryProperty', name: 'controller' },
    { model_: 'IntProperty', name: 'minWidth' }
  ]
});

CLASS({
  name: 'ResponsiveController',
  extendsModel: 'View',
  imports: ['window'],
  properties: [
    {
      model_: 'ArrayProperty',
      subType: 'ControllerOption',
      name: 'options',
      preSet: function(_, v) {
        return v.slice().sort(toCompare(ControllerOption.MIN_WIDTH));
      }
    },
    {
      name: 'current',
      type: 'ControllerOption',
      postSet: function(old, v) {
        if ( old !== v ) this.updateHTML();
      }
    },
    {
      name: 'tagName',
      defaultValue: 'div'
    }
  ],
  methods: {
    initHTML: function() {
      this.SUPER();
      this.window.addEventListener('resize', this.onResize);
      this.onResize_();
    },
    destory: function() {
      this.window.removeEventListener('resize', this.onResize);
    },
    onResize_: function() {
      if (!this.$) return;

      var width = this.$.clientWidth;

      for (var i = 0; i < this.options.length; i++) {
        var option = this.options[i];
        if ( option.minWidth > width ) break;
      }
      i = Math.max(i - 1, 0);

      this.current = this.options[i];
    }
  },
  listeners: [
    {
      name: 'onResize',
      isMerged: 100,
      code: function() {
        this.onResize_();
      }
    }
  ],
  templates: [
    function toInnerHTML() {/*<%= this.current ? this.current.controller() : '' %>*/}
  ]
});

CLASS({
  name: 'SpinnerView',
  extendsModel: 'View',
  documentation: 'Renders a spinner in the Material Design style. Has a ' +
      '$$DOC{ref:".data"} property and acts like a $$DOC{ref:"BooleanView"}, ' +
      'that creates and destroys and the spinner when the value changes.',
  // TODO(braden): This spinner doesn't render on Firefox.
  properties: [
    {
      name: 'data',
      documentation: 'Defaults to true, so that the spinner will show itself ' +
          'by default, if data is not set.',
      defaultValue: true,
      postSet: function(old, nu) {
        if ( ! this.$ ) return;
        if ( old && ! nu ) this.$.innerHTML = '';
        else if ( ! old && nu ) {
          this.$.innerHTML = this.toInnerHTML();
          this.initInnerHTML();
        }
      }
    },
    {
      name: 'color',
      documentation: 'The color to use for the spinner.',
      defaultValue: '#4285F4'
    },
    {
      name: 'extraClassName',
      defaultValue: 'spinner-container'
    }
  ],

  constants: {
    DURATION: '1333'
  },

  templates: [
    function CSS() {/*
      <% var prefixes = ['-webkit-', '-moz-', '']; %>
      <% var bezier = 'cubic-bezier(0.4, 0.0, 0.2, 1)'; %>
      .spinner-container {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        width: 100%;
      }
      .spinner-fixed-box {
        position: relative;
        height: 64px;
        width: 64px;
        <% for (var i = 0; i < prefixes.length; i++) { %>
          <%= prefixes[i] %>transform: translate3d(0px, 0px, 0px);
        <% } %>
      }

      .spinner-turning-box {
        <% for (var i = 0; i < prefixes.length; i++) { %>
          <%= prefixes[i] %>animation: container-rotate 1568ms linear infinite;
        <% } %>
        width: 100%;
        height: 100%;
      }

      .spinner-layer {
        position: absolute;
        height: 100%;
        width: 100%;
        <% for (var j = 0; j < prefixes.length; j++) { %>
          <%= prefixes[j] %>animation: fill-unfill-rotate <%= 4*this.DURATION %>ms <%= bezier %> infinite both;
        <% } %>
      }

      .spinner-circle-clipper {
        overflow: hidden;
        border-color: inherit;
        display: inline-block;
        height: 100%;
        position: relative;
        width: 50%;
      }

      .spinner-circle-clipper.spinner-clipper-left .spinner-circle {
        <% for (var i = 0; i < prefixes.length; i++) { %>
          <%= prefixes[i] %>animation: left-spin <%= this.DURATION %>ms <%= bezier %> infinite;
          <%= prefixes[i] %>transform: rotate(129deg);
        <% } %>
        border-right-color: transparent !important;
      }

      .spinner-circle-clipper.spinner-clipper-right .spinner-circle {
        <% for (var i = 0; i < prefixes.length; i++) { %>
          <%= prefixes[i] %>animation: right-spin <%= this.DURATION %>ms <%= bezier %> infinite;
          <%= prefixes[i] %>transform: rotate(-129deg);
        <% } %>
        border-left-color: transparent !important;
        left: -100%
      }

      .spinner-circle-clipper .spinner-circle {
        width: 200%;
      }

      .spinner-circle {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
        box-sizing: border-box;
        height: 100%;
        border-width: 4px;
        border-style: solid;
        border-color: inherit;
        border-bottom-color: transparent !important;
        border-radius: 50%;
        <% for (var i = 0; i < prefixes.length; i++) { %>
          <%= prefixes[i] %>animation: none;
        <% } %>
      }

      .spinner-gap-patch {
        position: absolute;
        box-sizing: border-box;
        top: 0;
        left: 45%;
        width: 10%;
        height: 100%;
        overflow: hidden;
        border-color: inherit;
      }

      .spinner-gap-patch .spinner-circle {
        width: 1000%;
        left: -450%;
      }

      <% for (var i = 0; i < prefixes.length; i++) { %>
        @<%= prefixes[i] %>keyframes fill-unfill-rotate {
          12.5% { <%= prefixes[i] %>transform: rotate(135deg); }
          25%   { <%= prefixes[i] %>transform: rotate(270deg); }
          37.5% { <%= prefixes[i] %>transform: rotate(405deg); }
          50%   { <%= prefixes[i] %>transform: rotate(540deg); }
          62.5% { <%= prefixes[i] %>transform: rotate(675deg); }
          75%   { <%= prefixes[i] %>transform: rotate(810deg); }
          87.5% { <%= prefixes[i] %>transform: rotate(945deg); }
          to    { <%= prefixes[i] %>transform: rotate(1080deg); }
        }

        @<%= prefixes[i] %>keyframes left-spin {
          from { <%= prefixes[i] %>transform: rotate(130deg); }
          50%  { <%= prefixes[i] %>transform: rotate(-5deg); }
          to   { <%= prefixes[i] %>transform: rotate(130deg); }
        }

        @<%= prefixes[i] %>keyframes right-spin {
          from { <%= prefixes[i] %>transform: rotate(-130deg); }
          50%  { <%= prefixes[i] %>transform: rotate(5deg); }
          to   { <%= prefixes[i] %>transform: rotate(-130deg); }
        }

        @<%= prefixes[i] %>keyframes container-rotate {
          to { <%= prefixes[i] %>transform: rotate(360deg);
        }
      <% } %>
    */},
    function toInnerHTML() {/*
      <div class="spinner-fixed-box">
        <div class="spinner-turning-box">
          <div class="spinner-layer" style="border-color: <%= this.color %>">
            <div class="spinner-circle-clipper spinner-clipper-left"><div class="spinner-circle"></div></div><div class="spinner-gap-patch"><div class="spinner-circle"></div></div><div class="spinner-circle-clipper spinner-clipper-right"><div class="spinner-circle"></div></div>
          </div>
        </div>
      </div>
    */}
  ]
});

CLASS({
  name: 'FutureView',
  extendsModel: 'View',
  // Works as follows: when it starts up, it will create a 10ms timer.
  // When the future is set, it begins listening to it.
  // In general, the 10ms timer expires before the future does, and then it
  // renders a spinner.
  // When the future resolves, it destroys the spinner and renders the view
  // passed by the future.
  // If the future resolves within the 10ms, then the spinner is never rendered.

  documentation: 'Expects a Future for a $$DOC{ref:"View"}. Shows a ' +
      '$$DOC{ref:"SpinnerView"} until the future resolves.',

  imports: [
    'clearTimeout',
    'setTimeout'
  ],

  properties: [
    {
      model_: 'ViewFactoryProperty',
      name: 'spinnerView',
      documentation: 'The view to use for the spinner. Defaults to SpinnerView.',
      defaultValue: 'SpinnerView'
    },
    {
      name: 'future',
      required: true,
      documentation: 'The Future for this View. Returns a View.'
    },
    {
      name: 'timer',
      hidden: true,
      factory: function() {
        return this.setTimeout(this.onTimer, 500);
      }
    },
    {
      name: 'spinner',
      documentation: 'The View instance for the spinner.'
    },
    {
      name: 'childView',
      documentation: 'The real child view passed in the Future.'
    }
  ],

  listeners: [
    {
      name: 'onTimer',
      documentation: 'If the future resolves before the timer fires, the ' +
          'timer gets canceled. Since it fired, we know to render the spinner.',
      code: function() {
        this.timer = '';
        this.spinner = this.spinnerView();
        if ( this.$ ) {
          this.$.outerHTML = this.spinner.toHTML();
          this.spinner.initHTML();
        }
      }
    },
    {
      name: 'onFuture',
      code: function(view) {
        if ( this.timer ) this.clearTimeout(this.timer);

        var el;
        if ( this.spinner ) {
          el = this.spinner.$;
          this.spinner.destroy();
          this.spinner = '';
        } else {
          el = this.$;
        }
        this.childView = view;
        el.outerHTML = view.toHTML();
        view.initHTML();
      }
    }
  ],

  methods: {
    toHTML: function() {
      if ( this.childView ) return this.childView.toHTML();
      if ( this.spinner ) return this.spinner.toHTML();
      return this.SUPER();
    },
    initHTML: function() {
      if ( this.childView ) this.childView.initHTML();
      if ( this.spinner ) this.spinner.initHTML();
      this.SUPER();
      (this.future.get || this.future)(this.onFuture);
    },
    destroy: function() {
      if ( this.spinner ) this.spinner.destroy();
      if ( this.childView ) this.childView.destroy();
    }
  }
});
