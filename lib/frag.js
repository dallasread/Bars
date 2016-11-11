var Generator = require('generate-js'),
    execute = require('./runtime/execute'),
    utils = require('./runtime/utils'),
    Context = require('./runtime/context'),

    pathSpliter = utils.pathSpliter,
    findPath = utils.findPath,

    Nodes = {},

    ARRAY = [],
    MAP = {
        'fragment': 'FRAG',
        'tag': 'TAG',
        'text': 'TEXT',
        'attr': 'ATTR',
        'block': 'BLOCK',
        'insert': 'TEXT',
        'partial': 'PARTIAL'
    };

/**
 * [BarsNode description]
 * @param {[type]} bars     [description]
 * @param {[type]} struct   [description]
 */
var BarsNode = Generator.generate(function BarsNode(frag, bars, struct) {
    var _ = this;

    _.defineProperties({
        fragment: frag || null,
        bars: bars,
        nodes: [],
        parentTag: {
            get: _.getParentTag
        },
        prevDom: {
            get: _.getPrevDom
        },
        type: struct.type,
        name: struct.name,
        value: struct.value,
        arg: struct.expression,
        conFrag: struct.consequent,
        altFrag: struct.alternate,
    });
});

BarsNode.definePrototype({
    update: function update(context) {
        var _ = this;

        _.previousDom = null;

        _._update(context);

        if (_.isDOM) {
            _._elementAppendTo();
            _.parentTag.previousDom = _;
        }

        _.previousDom = null;
    },

    _update: function _update() {
        console.warn('_update method not implemented.');
    },

    appendChild: function appendChild(child) {
        var _ = this;

        _.nodes.push(child);
        child.parent = _;
    },

    appendTo: function appendTo(parent) {
        var _ = this;

        if (parent instanceof Element) {
            _._elementAppendTo(parent);
        }

        if (BarsNode.isCreation(parent)) {
            parent.appendChild(_);
        }
    },

    remove: function remove() {
        var _ = this,
            index = _.parent.nodes.indexOf(_);

        if (index >= 0) {
            _.parent.nodes.splice(index, 1);
        }

        _._elementRemove();
    },

    getParentTag: function getParentTag() {
        var _ = this,
            parent = _.parent,
            oldParent = parent;

        while (parent && !parent.isDOM) {
            oldParent = parent;
            parent = parent.parent;
        }

        return parent || oldParent || null;
    },

    getPrevDom: function getPrevDom() {
        var _ = this;

        return (_.parentTag && _.parentTag.previousDom) || null;
    },

    _elementAppendTo: function _elementAppendTo(parent) {
        var _ = this;

        if (!_.parentTag) return;

        parent = parent || _.parentTag.$el || _.parentTag.$parent;

        if (!parent) return;
        if (_.$el.parentElement) return;

        var prev = _.prevDom;

        if (prev) {
            parent.insertBefore(_.$el, prev.$el.nextSibling);
        } else {
            parent.appendChild(_.$el);
        }
    },

    _elementRemove: function _elementRemove() {
        var _ = this;

        if (_.isDOM && _.$el.parentNode instanceof Element) {
            _.$el.parentNode.removeChild(_.$el);
        }
    },
});


/**
 * [TextNode description]
 * @param {[type]} bars    [description]
 * @param {[type]} struct  [description]
 */
Nodes.TEXT = BarsNode.generate(function TextNode(frag, bars, struct) {
    var _ = this;

    BarsNode.call(this, frag, bars, struct);

    _.defineProperties({
        $el: document.createTextNode(struct.value)
    });
});

Nodes.TEXT.definePrototype({
    isDOM: true,

    appendChild: function appendChild(child) {
        console.warn('appendChild CANNOT be called on TextNodes.');
    },

    _update: function _update(context) {
        var _ = this;

        if (_.arg) {
            _.$el.textContent = execute(_.arg, _.bars.transforms,
                context);
        }
    },
});


/**
 * [TagNode description]
 * @param {[type]} bars    [description]
 * @param {[type]} struct  [description]
 */
Nodes.TAG = BarsNode.generate(function TagNode(frag, bars, struct) {
    var _ = this,
        nodes = struct.nodes || ARRAY,
        attrs = struct.attrs || ARRAY,
        i;

    BarsNode.call(this, frag, bars, struct);

    _.defineProperties({
        $el: document.createElement(struct.name),
        attrs: []
    });

    for (i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        _.appendChild(new Nodes[MAP[node.type]](frag, bars, node));
    }

    for (i = 0; i < attrs.length; i++) {
        var attr = attrs[i];
        _.addAttr(new Nodes[MAP[attr.type]](frag, bars, attr));
    }

});

Nodes.TAG.definePrototype({
    isDOM: true,

    _update: function _update(context) {
        var _ = this,
            i;

        for (i = 0; i < _.attrs.length; i++) {
            _.attrs[i].update(context);
        }

        for (i = 0; i < _.nodes.length; i++) {
            _.nodes[i].update(context);
        }
    },

    addAttr: function addAttr(child) {
        var _ = this;

        _.attrs.push(child);
        child.parent = _;
    },
});

/**
 * [HTMLNode description]
 * @param {[type]} bars    [description]
 * @param {[type]} struct  [description]
 */
Nodes.HTML = BarsNode.generate(function HTMLNode(bars, struct) {
    var _ = this;

    _.supercreate(bars, struct);

    _.defineProperties({
        $el: document.createElement('div'),
        path: struct.args
    });
});

Nodes.HTML.definePrototype({
    isDOM: true,

    _update: function _update(context) {
        var _ = this,
            $parent = _.parentTag.$el || _.parentTag.$parent;

        $parent.innerHTML = context(_.path);
    },

    _elementAppendTo: function _elementAppendTo() {},
    _elementRemove: function _elementRemove() {
        var _ = this,
            $parent = _.parentTag.$el || _.parentTag.$parent;

        while ($parent.firstChild) {
            $parent.removeChild($parent.firstChild);
        }
    }
});


/**
 * [AttrNode description]
 * @param {[type]} bars    [description]
 * @param {[type]} struct  [description]
 */
Nodes.ATTR = BarsNode.generate(function AttrNode(frag, bars, struct) {
    var _ = this,
        nodes = struct.nodes || ARRAY;

    BarsNode.call(this, frag, bars, struct);

    _.defineProperties({
        $el: document.createElement('div'),
    });

    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        _.appendChild(new Nodes[MAP[node.type]](frag, bars, node));
    }
});

Nodes.ATTR.definePrototype({
    isDOM: true,
    type: 'ATTR',
    _update: function _update(context) {
        var _ = this,
            i;

        for (i = 0; i < _.nodes.length; i++) {
            _.nodes[i].update(context);
        }
    },
    _elementAppendTo: function _elementAppendTo() {
        var _ = this,
            parent = _.parentTag.$el;

        if (parent instanceof Element) {
            parent.setAttribute(_.name, _.$el.textContent);
        }
    },
    _elementRemove: function _elementRemove() {
        var _ = this,
            parent = _.parentTag.$el;

        if (parent instanceof Element) {
            parent.removeAttribute(_.name);
        }
    }
});


/**
 * [BlockNode description]
 * @param {[type]} bars    [description]
 * @param {[type]} struct  [description]
 */
Nodes.BLOCK = BarsNode.generate(function BlockNode(frag, bars, struct) {
    var _ = this;

<<<<<<< HEAD
    _.supercreate(bars, struct);
    _.path = _.args;
=======
    BarsNode.call(this, frag, bars, struct);

    _.path = pathSpliter(findPath(_.arg));
>>>>>>> Mike96Angelo/master
});

Nodes.BLOCK.definePrototype({
    type: 'BLOCK',

    createFragment: function createFragment(path) {
        var _ = this,
<<<<<<< HEAD
            frag = Nodes.FRAG.create(_.bars, _.conFrag);

        frag.setPath(path);
=======
            frag = new Nodes.FRAG(_.fragment, _.bars, _.conFrag);

>>>>>>> Mike96Angelo/master
        _.appendChild(frag);

        return frag;
    },

    _update: function _update(context) {
        var _ = this,
            con,
            arg,
            i;

        if (typeof _.bars.blocks[_.name] === 'function') {
            arg = execute(_.arg, _.bars.transforms, context);
            con = _.bars.blocks[_.name].call(_, arg);
        } else {
            throw new Error('Block helper not found: ' + _.name);
        }

        if (con) {
            if (!_.nodes.length) {
                _.createFragment();
            }

            for (i = 0; i < _.nodes.length; i++) {
                _.nodes[i].update(context);
            }

            if (_.alternate) {
                _.alternate._elementRemove();
            }
        } else {
            for (i = 0; i < _.nodes.length; i++) {
                _.nodes[i]._elementRemove();
            }

<<<<<<< HEAD
            if (!_.alternate) {
                _.alternate = Nodes.FRAG.create(_.bars, _.altFrag);
=======
            if (!_.alternate && _.altFrag) {
                _.alternate = new Nodes[MAP[_.altFrag.type]](
                    _.fragment,
                    _.bars,
                    _.altFrag
                );
>>>>>>> Mike96Angelo/master
                _.alternate.parent = _;
            }

            _.alternate.update(context);
        }
    },
    _elementAppendTo: function _elementAppendTo() {},
    _elementRemove: function _elementRemove() {
        var _ = this,
            i;

        for (i = 0; i < _.nodes.length; i++) {
            _.nodes[i]._elementRemove();
        }

        if (_.alternate) {
            _.alternate._elementRemove();
        }
    }
});


/**
 * [PartialNode description]
 * @param {[type]} bars    [description]
 * @param {[type]} struct  [description]
 */
Nodes.PARTIAL = BarsNode.generate(function PartialNode(frag, bars, struct) {
    var _ = this;

    BarsNode.call(this, frag, bars, struct);

    _.path = pathSpliter(findPath(_.arg));
});

function parentPath(_) {
    var parent = _,
        path = [];

    while (parent = parent.parent) {
        if (parent.path) path.unshift(parent.path);
    }

    return path.join('/');
}

Nodes.PARTIAL.definePrototype({
    _update: function _update(context) {
        var _ = this;

        if (!_.partial) {
            var partial = _.bars.partials[_.name];

            if (partial && typeof partial === 'object') {
                _.partial = new Nodes.FRAG(_.fragment, _.bars,
                    partial.struct);
                _.partial.parent = _;
<<<<<<< HEAD
                _.partial.setPath('');
=======
                if (
                    (
                        _.path.length === 1 &&
                        _.path[0] !== 'this' &&
                        _.path[0] !== '.' &&
                        _.path[0] !== ''
                    ) ||
                    _.path.length > 1
                ) {
                    _.partial.context.path = _.path;
                }
>>>>>>> Mike96Angelo/master
            } else {
                throw new Error('Partial not found: ' + _.name);
            }
        }

<<<<<<< HEAD
        context = context.getContext('');

        var newData = {},
            path;

        for (var key in _.args) {
            path = _.args[key];

            if (!path) continue;
            if (path[0] !== '/') path = parentPath(_) + '/' + path;

            newData[key] = context(path);
        }

        _.partial.update(newData);
=======
        var arg = execute(_.arg, _.bars.transforms, context);
        _.partial.context.data = arg;
        _.partial.update(context);
>>>>>>> Mike96Angelo/master
    },

    _elementRemove: function _elementRemove() {
        var _ = this;

        if (_.partial) {
            _.partial._elementRemove();
        }
    }
});


/**
 * [FragNode description]
 * @param {[type]} bars    [description]
 * @param {[type]} struct  [description]
 */
Nodes.FRAG = BarsNode.generate(function FragNode(frag, bars, struct) {
    // console.log('>>>>>', struct);
    var _ = this,
        nodes = struct.nodes || ARRAY;

    BarsNode.call(this, frag, bars, struct);

    _.context = new Context(null, _, '');

    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (MAP[node.type])
            _.appendChild(new Nodes[MAP[node.type]](_, bars, node));
    }
});

Nodes.FRAG.definePrototype({
    _update: function _update(data) {
        var _ = this;

        if (!Context.isCreation(data)) {
            _.context.data = data;
        }

        for (var i = 0; i < _.nodes.length; i++) {
            _.nodes[i].update(_.context);
        }
        _.context.data = null;
    },

    _elementAppendTo: function _elementAppendTo(parent) {
        var _ = this;

        _.$parent = parent;
    },
    _elementRemove: function _elementRemove() {
        var _ = this;

        for (var i = 0; i < _.nodes.length; i++) {
            _.nodes[i]._elementRemove();
        }

        _.$parent = null;
<<<<<<< HEAD
    },

    getValue: function getValue(value, splitPath) {
        var _ = this;

        for (var i = 0; i < splitPath.length; i++) {
            if (splitPath[i] === '@key' || splitPath[i] === '@index') {
                value = splitPath[i - 1];
            } else if (value !== null && value !== void(0)) {
                value = value[splitPath[i]];
            } else {
                value = undefined;
            }
        }

        return typeof value === 'undefined' ? '' : value;
    },

    getContext: function getContext(basepath, obj) {
        var _ = this;

        function context(path) {
            if (obj) {
                var newObj = {};

                for (var key in obj) {
                    newObj[key] = _.getValue(_.data, _.resolve(basepath, obj[key]));
                }

                return _.resolveObj(newObj, path) || '';
            }

            return _.getValue(_.data, _.resolve(basepath, path));
        }

        context.getContext = function getContext(path, obj) {
            return _.getContext(_.resolve(basepath, path).join('/'), obj);
        };

        return context;
    },

    setPath: function setPath(path) {
        var _ = this;

        if (path) {
            _.defineProperties({
                path: path.toString()
            });
        }
    },

    resolve: function resolve(basepath, path) {
        if (!path) return [];

        var newSplitpath;

        if (path[0] === '~') path = path.replace(/^~/, '/');
        if (path[0] === '/') {
            newSplitpath = path.split('/');
        } else {
            newSplitpath = basepath.split('/').concat(path.split('/'));
        }

        for (var i = 0; i < newSplitpath.length; i++) {
            if (newSplitpath[i] === '.' || newSplitpath[i] === '') {
                newSplitpath.splice(i, 1);
                i--;
            } else if (newSplitpath[i] === '..') {
                newSplitpath.splice(i - 1, 2);
                i -= 2;
            }
        }

        return newSplitpath;
    },

    resolveObj: function resolveObj(obj, path) {
        var _ = this,
            splat = path.split('/');

        for (var i = 0; i < splat.length; i++) {
            obj = obj[splat[i]];
            if (!obj) return;
        }

        return obj;
    },
=======
    }
>>>>>>> Mike96Angelo/master
});

module.exports = Nodes.FRAG;
