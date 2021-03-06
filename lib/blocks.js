var Generator = require('generate-js');

var Blocks = Generator.generate(function Blocks() {});

Blocks.definePrototype({
    if: function ifBlock(con) {
        return con;
    },

    with: function withBlock(data) {
        var _ = this;

        if (data && typeof data === 'object') {
            if (!_.nodes[0]) {
                var frag = _.createFragment();

                var newPath = _.path.slice();

                frag.context.path = newPath;
            }
            _.nodes[0].context.data = data;

            return true;
        }

        return false;
    },

    each: function eachBlock(data) {
        var _ = this,
            i;

        if (data && typeof data === 'object') {
            var keys = Object.keys(data);

            if (keys.length) {
                // TODO: This should be smarter.

<<<<<<< HEAD
                for (var i = _.nodes.length - 1; i >= 0; i--) {
                    _.nodes[i].remove();
                }

                for (var i = 0; i < keys.length; i++) {
                    _.createFragment(keys[i]);
                }

                return true;
            }
        }

        return false;
    },

    reverse: function reverseBlock(data) {
        var _ = this,
            i;

        if (data && typeof data === 'object') {
            var keys = Object.keys(data).reverse();

            _.context = _.context.getContext(_.args);

            if (keys.length) {
                // TODO: This should be smarter.

                for (var i = _.nodes.length - 1; i >= 0; i--) {
                    _.nodes[i].remove();
=======
                // remove extra nodes
                for (i = _.nodes.length - 1; i >= keys.length; i--) {
                    _.nodes[i].remove();
                }

                // add needed nodes
                for (i = _.nodes.length; i < keys.length; i++) {
                    _.createFragment(keys[i]);
                }

                // update node paths
                for (i = 0; i < keys.length; i++) {
                    var newPath = _.path.slice();

                    newPath.push(keys[i]);

                    _.nodes[i].context.path = newPath;
                    _.nodes[i].context.data = data[keys[i]];
>>>>>>> Mike96Angelo/master
                }

                for (var i = 0; i < keys.length; i++) {
                    _.createFragment(keys[i]);
                }

                return true;
            }
        }

        return false;
    }
});

module.exports = Blocks;
