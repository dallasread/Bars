(function() {
var LOGGING = false;

var SELF_CLOSEING_TAGS = [
    'area',
    'base',
    'br',
    'col',
    'command',
    'embed',
    'hr',
    'img',
    'input',
    'keygen',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr'
];

var ENTITIES = {
    'quot':      34,
    'amp':       38,
    'lt':        60,
    'gt':        62,
    'nbsp':      160,
    'iexcl':     161,
    'cent':      162,
    'pound':     163,
    'curren':    164,
    'yen':       165,
    'brvbar':    166,
    'sect':      167,
    'uml':       168,
    'copy':      169,
    'ordf':      170,
    'not':       172,
    'shy':       173,
    'reg':       174,
    'macr':      175,
    'deg':       176,
    'plusmn':    177,
    'sup2':      178,
    'sup3':      179,
    'acute':     180,
    'micro':     181,
    'para':      182,
    'middot':    183,
    'cedil':     184,
    'sup1':      185,
    'ordm':      186,
    'raquo':     187,
    'frac14':    188,
    'frac12':    189,
    'frac34':    190,
    'iquest':    191,
    'Agrave':    192,
    'Aacute':    193,
    'Acirc':     194,
    'Atilde':    195,
    'Auml':      196,
    'Aring':     197,
    'AElig':     198,
    'Ccedil':    199,
    'Egrave':    200,
    'Eacute':    201,
    'Ecirc':     202,
    'Euml':      203,
    'Igrave':    204,
    'Iacute':    205,
    'Icirc':     206,
    'Iuml':      207,
    'ETH':       208,
    'Ntilde':    209,
    'Ograve':    210,
    'Oacute':    211,
    'Ocirc':     212,
    'Otilde':    213,
    'Ouml':      214,
    'times':     215,
    'Oslash':    216,
    'Ugrave':    217,
    'Uacute':    218,
    'Ucirc':     219,
    'Uuml':      220,
    'Yacute':    221,
    'THORN':     222,
    'szlig':     223,
    'agrave':    224,
    'aacute':    225,
    'acirc':     226,
    'atilde':    227,
    'auml':      228,
    'aring':     229,
    'aelig':     230,
    'ccedil':    231,
    'egrave':    232,
    'eacute':    233,
    'ecirc':     234,
    'euml':      235,
    'igrave':    236,
    'iacute':    237,
    'icirc':     238,
    'iuml':      239,
    'eth':       240,
    'ntilde':    241,
    'ograve':    242,
    'oacute':    243,
    'ocirc':     244,
    'otilde':    245,
    'ouml':      246,
    'divide':    247,
    'oslash':    248,
    'ugrave':    249,
    'uacute':    250,
    'ucirc':     251,
    'uuml':      252,
    'yacute':    253,
    'thorn':     254,
    'euro':      8364,
};

var MODES = {
    'DOM': [
        parseHTMLComment,
        parseHTMLTagClose,
        parseHTMLTag,
        parseHTMLBarsHelper,
        parseHTMLBarsInsert,
        parseHTMLBarsComment,
        parseBarsComment,
        parseBarsHelper,
        parseBarsPartial,
        parseBarsBlockElse,
        parseBarsBlockClose,
        parseBarsBlock,
        parseBarsInsert,
        parseHTMLText
    ],
    'ATTR': [
        parseHTMLTagEnd,
        parseHTMLTagEnd,
        parseBarsComment,
        parseBarsBlockElse,
        parseBarsBlockClose,
        parseBarsBlock,
        parseWhiteSpace,
        parseAttr
    ],
    'VALUE': [
        parseStringClose,
        parseStringClose,
        parseBarsComment,
        parseBarsHelper,
        parseBarsBlockElse,
        parseBarsBlockClose,
        parseBarsBlock,
        parseBarsInsert,
        parseText
    ],
};

function HTML_IDENTIFIER(ch) {
    /* ^[_A-Za-z0-9-]$ */
    return (ch === 45) ||
           (48 <= ch && ch <= 57) ||
           (65 <= ch && ch <= 90) ||
           (ch === 95) ||
           (97 <= ch && ch <= 122);
}

function WHITESPACE(ch) {
    /* ^\s$ */
    return (9 <= ch && ch <= 13) ||
            ch === 32 ||
            ch === 160 ||
            ch === 5760 ||
            ch === 6158 ||
            ch === 8192 ||
            ch === 8193 ||
            ch === 8194 ||
            ch === 8195 ||
            ch === 8196 ||
            ch === 8197 ||
            ch === 8198 ||
            ch === 8199 ||
            ch === 8200 ||
            ch === 8201 ||
            ch === 8202 ||
            ch === 8232 ||
            ch === 8233 ||
            ch === 8239 ||
            ch === 8287 ||
            ch === 12288 ||
            ch === 65279;
}

function HTML_ENTITY(ch) {
    /* ^[A-Za-z0-9]$ */
    return (48 <= ch && ch <= 57) ||
           (65 <= ch && ch <= 90) ||
           (97 <= ch && ch <= 122);
}

function getHTMLUnEscape(str) {
    var code;

    code = ENTITIES[str.slice(1, -1)];

    if (typeof code !== 'number' && str[1] === '#') {
        code = parseInt( str.slice(2, -1), 10);
    }

    if (typeof code === 'number' && !isNaN(code)){
        return String.fromCharCode(code);
    }

    return str;
}

function throwError(buffer, index, message) {
    var lines = 1,
        columns = 0;

    for (var i = 0; i < index; i++) {
        if (buffer.codePointAt(i) === 10 /*'\n'*/) {
            lines++;
            columns = 1;
        } else {
            columns++;
        }
    }

    throw new SyntaxError(message + ' at ' + lines + ':' + columns);
}

function parseLoop(token, index, length, buffer, startSequence, endSequence, name, noError) {
    var ch,
        i,
        closed = false,
        closeBuffer,
        startSequenceLength = startSequence.length,
        endSequenceLength = endSequence.length;

    for (i = 0; i < startSequenceLength && index < length; i++, index++) {
        if (buffer.codePointAt(index) !== startSequence[i]) {
            return null;
        }
    }

    if (i < startSequenceLength) {
        return null;
    }

    if (name) {
        for (; index < length; index++) {
            ch = buffer.codePointAt(index);

            if (HTML_IDENTIFIER(ch)) {
                token.name += buffer[index];
            } else {
                break;
            }
        }

        if (!token.name) {
            throwError(buffer, index, 'Missing ' + name + ' name.');
        }
    }

    loop: for (; index < length; index++) {
        ch = buffer.codePointAt(index);

        if (ch === endSequence[0]) {
            closeBuffer = '';
            for (i = 0; i < endSequenceLength && index < length; i++, index++) {
                closeBuffer += buffer[index];
                if (buffer.codePointAt(index) !== endSequence[i]) {
                    if (noError){
                        break;
                    } else {
                        throwError(buffer, index, 'Unexpected character: expected \'' + String.fromCharCode(endSequence[i]) + '\' but found \'' + buffer[index] + '\'.');
                    }
                }
            }

            if (i === endSequenceLength) {
                closed = true;
                break loop;
            }
        }

        if (closeBuffer) {
            token.args += closeBuffer;
        } else {
            token.args += buffer[index];
        }
    }

    if (!closed) {
        throwError(buffer, index, 'Unexpected end of input.');
    }

    return index;
}

//////////////
//// HTML ////
//////////////

var HTML_COMMENT_START = [60, 33, 45, 45],  /* <!-- */
    HTML_COMMENT_END = [45, 45, 62],        /* --> */
    HTML_COMMENT_NAME;

function parseHTMLComment(mode, tree, index, length, buffer, indent, close) {
    var token = {
            type: 'COMMENT',
            args: ''
        },
        newIndex;

    newIndex = parseLoop(token, index, length, buffer, HTML_COMMENT_START, HTML_COMMENT_END, HTML_COMMENT_NAME, true);

    if (newIndex === null) {
        return null;
    }

    LOGGING && console.log(indent + 'parseBarsComment');

    // TODO: think about how comments work.
    // token.text = token.args;
    // delete token.args;
    // tree.push(token);

    return newIndex;
}

function parseHTMLTag(mode, tree, index, length, buffer, indent, close) {
    if (buffer.codePointAt(index) !== 60 /*'<'*/) return null;

    LOGGING && console.log(indent + 'parseHTMLTag');

    var ch,
        token = {
            type: 'TAG',
            name: '',
            nodes: [],
            attrs: []
        },
        newIndex;

    index++; // move past <
    /* Get Name */
    for (; index < length; index++) {
        ch = buffer.codePointAt(index);

        if (!HTML_IDENTIFIER(ch)) {
            break;
        }

        token.name += buffer[index];
    }

    if (!token.name) {
        throwError(buffer, index, 'Missing tag name.');
    }

    index = parseMode('ATTR', token.attrs, index, length, buffer, indent, token);

    if (!token.closed && !token.selfClosed) {
        throwError(buffer, index, 'Unexpected end of input.');
    }

    delete token.closed;

    if (token.selfClosed) {
        delete token.selfClosed;
        return index;
    }

    if (token.name === 'script' || token.name === 'style') {
        var textToken = {
            type: 'TEXT',
            text: ''
        };

        for (; index < length; index++) {
            ch = buffer.codePointAt(index);

            if (ch === 60 /*'<'*/) {
                newIndex = parseHTMLTagClose(mode, tree, index, length, buffer, indent, token, true);

                if (newIndex !== null) {
                    index = newIndex;
                }

                if (token.closed) {
                    delete token.closed;
                    break;
                }
            }

            textToken.text += buffer[index];
        }

        if (textToken.text) {
            token.nodes.push(textToken);
        }
    } else if (SELF_CLOSEING_TAGS.indexOf(token.name) === -1) {
        // index++;
        index = parseMode(mode, token.nodes, index, length, buffer, indent, token);
    } else {
        token.closed = true;
    }

    if (token.closed) {
        delete token.closed;
        tree.push(token);
    } else {
        throwError(buffer, index, 'Missing closing tag: expected \'' + token.name + '\'.');
    }

    return index;
}

function parseHTMLTagEnd(mode, tree, index, length, buffer, indent, close) {
    var ch = buffer.codePointAt(index);

    if (ch === 62 /*'>'*/) {
        LOGGING && console.log(indent + 'parseHTMLTagEnd');
        close.closed = true;
        return index;
    }

    if (ch === 47 /*'/'*/ && buffer.codePointAt(index + 1) === 62 /*'>'*/) {
        LOGGING && console.log(indent + 'parseHTMLTagEnd');
        index++;
        close.selfClosed = true;
        return index;
    }

    return null;
}

var HTML_TAG_CLOSE_START = [60, 47],
    HTML_TAG_CLOSE_END = [62],
    HTML_TAG_CLOSE_NAME = 'tag';

function parseHTMLTagClose(mode, tree, index, length, buffer, indent, close, noErrorOnMismatch) {
    var token = {
            type: 'TAG',
            name: ''
        },
        newIndex;

    newIndex = parseLoop(token, index, length, buffer, HTML_TAG_CLOSE_START, HTML_TAG_CLOSE_END, HTML_TAG_CLOSE_NAME);

    if (newIndex === null) {
        return null;
    }

    LOGGING && console.log(indent+'parseHTMLTagClose');

    if (!close) {
        throwError(buffer, index, 'Unexpected closing tag: \'' +token.name+ '\'.');
    }

    if (token.type === close.type && token.name === close.name) {
        close.closed = true;
    } else if (noErrorOnMismatch) {
        /* Canceling Parse */
        return null;
    } else {
        throwError(buffer, index, 'Mismatched closing tag: expected \'' +close.name+ '\' but found \'' +token.name+ '\'.');
    }

    return index;
}

function parseAttr(mode, tree, index, length, buffer, indent, close) {
    if (!HTML_IDENTIFIER(buffer.codePointAt(index))) return null;

    var ch,
        token = {
            type: 'ATTR',
            name: '',
            nodes: []
        };

    for (; index < length; index++) {
        ch = buffer.codePointAt(index);

        if (!HTML_IDENTIFIER(ch)) {
            break;
        }

        token.name += buffer[index];
    }

    if (token.name) {
        LOGGING && console.log(indent + 'parseAttr');

        tree.push(token);
        /* ch === '=' */
        if (ch === 61) {
            // move past =
            index++;

            ch = buffer.codePointAt(index);

            /* ch === '"' || ch === '\'' */
            if (ch === 34 || ch === 39) {
                var stringToken = {
                    type: 'STRING',
                    name: ch
                };

                index++;
                index = parseMode('VALUE', token.nodes, index, length, buffer, indent, stringToken);

                if (!stringToken.closed) {
                    throwError(buffer, index, 'Missing closing quote: expected \'' + stringToken.name + '\'.');
                }
            } else {
                var textValueToken = {
                    type: 'TEXT',
                    text: ''
                };
                for (; index < length; index++) {
                    ch = buffer.codePointAt(index);

                    if (!HTML_IDENTIFIER(ch)) {
                        break;
                    }

                    textValueToken.text += buffer[index];
                }

                if (textValueToken.text) {
                    token.nodes.push(textValueToken);
                    index--;
                } else {
                    throwError(buffer, index, 'Unexpected end of input.');
                }
            }
        } else {
            index--;
        }

        return index;
    }

    return null;
}

function parseWhiteSpace(mode, tree, index, length, buffer, indent, close) {
    var ch,
        whitespace = 0;

    for (; index < length; index++) {
        ch = buffer.codePointAt(index);

        if (!WHITESPACE(ch)) {
            break;
        }
        whitespace++;
    }

    if (whitespace) {
        LOGGING && console.log(indent + 'parseWhiteSpace');
        index--;
        return index;
    }

    return null;
}

function parseStringClose(mode, tree, index, length, buffer, indent, close) {
    var ch = buffer.codePointAt(index);

    if (ch !== 34 && ch !== 39) {
        return null;
    }

    if (close.type === 'STRING' && close.name === ch) {
        close.closed = true;
        return index;
    }

    return null;
}

function parseHTMLText(mode, tree, index, length, buffer, indent, close) {
    var ch,
        isEntity = false,
        entityStr = '',
        token = {
            type: 'TEXT',
            text: ''
        };

    for (; index < length; index++) {
        ch = buffer.codePointAt(index);

        if (ch === 60 /*'<'*/ || ch === 123 /*'{'*/ && buffer.codePointAt(index + 1) === 123 /*'{'*/) {
            token.text += entityStr;
            index--;
            break;
        }

        if (ch === 38 /*'&'*/) {
            isEntity = true;
            entityStr = buffer[index];

            continue;
        } else if (isEntity && ch === 59 /*';'*/) {
            entityStr += buffer[index];

            token.text += getHTMLUnEscape(entityStr);

            isEntity = false;
            entityStr = '';

            continue;
        }

        if (isEntity && HTML_ENTITY(ch)) {
            entityStr += buffer[index];
        } else {
            token.text += entityStr;
            isEntity = false;
            entityStr = '';

            token.text += buffer[index];
        }
    }

    if (token.text) {
        LOGGING && console.log(indent + 'parseHTMLText');
        tree.push(token);
        return index;
    }

    return null;
}

function parseText(mode, tree, index, length, buffer, indent, close) {
    var ch,
        token = {
            type: 'TEXT',
            text: ''
        };

    for (; index < length; index++) {
        ch = buffer.codePointAt(index);

        if ((ch === 123 /*'{'*/ && buffer.codePointAt(index + 1) === 123 /*'{'*/) || (close && ch === close.name && buffer[index - 1] !== '\\')) {
            index--;
            break;
        }

        token.text += buffer[index];
    }

    if (token.text) {
        LOGGING && console.log(indent + 'parseText');
        tree.push(token);
        return index;
    }

    return null;
}

//////////////
//// BARS ////
//////////////

var BARS_COMMENT_START = [123, 123, 33],  /* {{! */
    BARS_COMMENT_END = [125, 125],        /* }} */
    BARS_COMMENT_NAME;

function parseBarsComment(mode, tree, index, length, buffer, indent, close) {
    var token = {
            type: 'COMMENT',
            args: ''
        },
        newIndex;

    newIndex = parseLoop(token, index, length, buffer, BARS_COMMENT_START, BARS_COMMENT_END, BARS_COMMENT_NAME);

    if (newIndex === null) {
        return null;
    }

    LOGGING && console.log(indent + 'parseBarsComment');

    // TODO: think about how comments work.
    // tree.push(token);

    return newIndex;
}

var BARS_HTML_COMMENT_START = [123, 123, 33, 45, 45],  /* {{!-- */
    BARS_HTML_COMMENT_END = [45, 45, 125, 125],        /* --}} */
    BARS_HTML_COMMENT_NAME;

function parseHTMLBarsComment(mode, tree, index, length, buffer, indent, close) {
    var token = {
            type: 'COMMENT',
            args: ''
        },
        newIndex;

    newIndex = parseLoop(token, index, length, buffer, BARS_HTML_COMMENT_START, BARS_HTML_COMMENT_END, BARS_HTML_COMMENT_NAME);

    if (newIndex === null) {
        return null;
    }

    LOGGING && console.log(indent + 'parseHTMLBarsComment');

    // TODO: think about how comments work.
    // tree.push(token);

    return newIndex;
}

var BARS_HELPER_HTML_START = [123, 123, 123, 63], /* {{{? */
    BARS_HELPER_HTML_END = [125, 125, 125],       /* }}} */
    BARS_HELPER_HTML_NAME = 'helper';

function parseHTMLBarsHelper(mode, tree, index, length, buffer, indent, close) {
    var token = {
            type: 'FRAG',
            name: '',
            args: '',
        },
        newIndex;

    newIndex = parseLoop(token, index, length, buffer, BARS_HELPER_HTML_START, BARS_HELPER_HTML_END, BARS_HELPER_HTML_NAME);

    if (newIndex === null) {
        return null;
    }

    LOGGING && console.log(indent + 'parseHTMLBarsHelper');

    tree.push(token);

    return newIndex;
}

var BARS_HELPER_TEXT_START = [123, 123, 63], /* {{? */
    BARS_HELPER_TEXT_END = [125, 125],       /* }} */
    BARS_HELPER_TEXT_NAME = 'helper';

function parseBarsHelper(mode, tree, index, length, buffer, indent, close) {
    var token = {
            type: 'TEXT',
            name: '',
            args: '',
        },
        newIndex;

    newIndex = parseLoop(token, index, length, buffer, BARS_HELPER_TEXT_START, BARS_HELPER_TEXT_END, BARS_HELPER_TEXT_NAME);

    if (newIndex === null) {
        return null;
    }

    LOGGING && console.log(indent + 'parseBarsHelper');

    tree.push(token);

    return newIndex;
}

var BARS_INSERT_HTML_START = [123, 123, 123],  /* {{{ */
    BARS_INSERT_HTML_END = [125, 125, 125],    /* }}} */
    BARS_INSERT_HTML_NAME;

function parseHTMLBarsInsert(mode, tree, index, length, buffer, indent, close) {
    var token = {
            type: 'FRAG',
            args: '',
        },
        newIndex;

    newIndex = parseLoop(token, index, length, buffer, BARS_INSERT_HTML_START, BARS_INSERT_HTML_END, BARS_INSERT_HTML_NAME);

    if (newIndex === null) {
        return null;
    }

    LOGGING && console.log(indent + 'parseHTMLBarsInsert');

    tree.push(token);

    return newIndex;
}

var BARS_INSERT_TEXT_START = [123, 123],  /* {{ */
    BARS_INSERT_TEXT_END = [125, 125],    /* }} */
    BARS_INSERT_TEXT_NAME;

function parseBarsInsert(mode, tree, index, length, buffer, indent, close) {
    var token = {
            type: 'TEXT',
            args: '',
        },
        newIndex;

    newIndex = parseLoop(token, index, length, buffer, BARS_INSERT_TEXT_START, BARS_INSERT_TEXT_END, BARS_INSERT_TEXT_NAME);

    if (newIndex === null) {
        return null;
    }

    LOGGING && console.log(indent + 'parseBarsInsert');

    tree.push(token);

    return newIndex;
}

var BARS_PARTIAL_START = [123, 123, 62], /* {{> */
    BARS_PARTIAL_END = [125, 125],       /* }} */
    BARS_PARTIAL_NAME = 'partial';

function parseBarsPartial(mode, tree, index, length, buffer, indent, close) {
    var token = {
            type: 'PARTIAL',
            name: '',
            args: '',
        },
        newIndex;

    newIndex = parseLoop(token, index, length, buffer, BARS_PARTIAL_START, BARS_PARTIAL_END, BARS_PARTIAL_NAME);

    if (newIndex === null) {
        return null;
    }

    LOGGING && console.log(indent + 'parseBarsPartial');

    tree.push(token);

    return newIndex;
}

var BARS_BLOCK_START = [123, 123, 35],  /* {{# */
    BARS_BLOCK_END = [125, 125],    /* }} */
    BARS_BLOCK_NAME = 'block';

function parseBarsBlock(mode, tree, index, length, buffer, indent, close) {
    var token = {
            type: 'BLOCK',
            name: '',
            args: '',
            conFrag: {
                type: 'FRAG',
                nodes: [],
            },
            altFrag: {
                type: 'FRAG',
                nodes: []
            }
        },
        newIndex;

    newIndex = parseLoop(token, index, length, buffer, BARS_BLOCK_START, BARS_BLOCK_END, BARS_BLOCK_NAME);

    if (newIndex === null) {
        return null;
    }

    index = newIndex;

    LOGGING && console.log(indent + 'parseBarsBlock');

    index = parseMode(mode, token.conFrag.nodes, index, length, buffer, indent, token);

    if (token.elsed && !token.closed) {
        index = parseMode(mode, token.altFrag.nodes, index, length, buffer, indent, token);
    }

    if (token.closed) {
        delete token.closed;
        delete token.elsed;
        tree.push(token);
    } else {
        throwError(buffer, newIndex, 'Missing closing tag: expected \'' + token.name + '\'.');
    }

    return index;
}

var BARS_BLOCK_ELSE_START = [123, 123],  /* {{ */
    BARS_BLOCK_ELSE_END = [125, 125],    /* }} */
    BARS_BLOCK_ELSE_NAME;

function parseBarsBlockElse(mode, tree, index, length, buffer, indent, close) {
    var token = {
            type: 'BLOCK',
            args: '',
        },
        newIndex;

    newIndex = parseLoop(token, index, length, buffer, BARS_BLOCK_ELSE_START, BARS_BLOCK_ELSE_END, BARS_BLOCK_ELSE_NAME);

    if (newIndex === null) {
        return null;
    }

    if (token.args === 'else') {
        if (
            (!close) ||
            (
                close &&
                (
                    close.elsed ||
                    close.type !== 'BLOCK'
                )
            )
        ) {
            throwError(buffer, index, 'Unexpected else token.');
        }

        close.elsed = true;

        LOGGING && console.log(indent + 'parseBarsBlockElse');

        return newIndex;
    }

    return null;
}

var BARS_BLOCK_CLOSE_START = [123, 123, 47],  /* {{/ */
    BARS_BLOCK_CLOSE_END = [125, 125],    /* }} */
    BARS_BLOCK_CLOSE_NAME = 'block';

function parseBarsBlockClose(mode, tree, index, length, buffer, indent, close) {
    var token = {
            type: 'BLOCK',
            name: '',
            args: '',
        },
        newIndex;

    newIndex =  parseLoop(token, index, length, buffer, BARS_BLOCK_CLOSE_START, BARS_BLOCK_CLOSE_END, BARS_BLOCK_CLOSE_NAME);

    if (newIndex === null) {
        return null;
    }

    LOGGING && console.log(indent + 'parseBarsBlockClose');

    if (!close) {
        throwError(buffer, index, 'Unexpected closing tag: \'' +token.name+ '\'.');
    }

    if (token.type === close.type && token.name === close.name) {
        close.closed = true;
    } else {
        throwError(buffer, index, 'Mismatched closing tag: expected \'' + close.name + '\' but found \'' + token.name + '\'.');
    }

    return newIndex;
}

function parseMode(mode, tree, index, length, buffer, indent, close) {
    LOGGING && console.log(indent + 'parseMode - ', mode);

    var ch,
        oldIndex,
        newIndex,
        oldElsed,
        oldIndent = indent,
        parsed,
        parseFunc,
        parseFuncs = MODES[mode],
        parseFuncsLength = parseFuncs.length;

    indent += '  ';

    loop: for (; index < length;) {

        if (index === oldIndex) throw index;
        oldIndex = index;

        ch = buffer.codePointAt(index);
        parsed = false;
        for (var i = 0; i < parseFuncsLength; i++) {
            parseFunc = parseFuncs[i];

            oldElsed = close && close.elsed;

            newIndex = parseFunc(mode, tree, index, length, buffer, indent, close);

            if (newIndex === null) continue;

            index = newIndex;

            if (
                close &&
                (
                    (close.closed) ||
                    (close.elsed && !oldElsed)
                )
            ) {
                break loop;
            }

            parsed = true;

            break;
        }

        if (!parsed) {
            throwError(buffer, index, 'Unexpected token: ' + buffer[index]);
        }
    }

    LOGGING && console.log(oldIndent + '<<<');

    return index;
}

function compile(buffer) {
    var n = Date.now();
    var tree = {
        type: 'FRAG',
        nodes: []
    };

    LOGGING && console.log('compile');

    parseMode('DOM', tree.nodes, 0, buffer.length, buffer, '  ', null);

    console.log('compiled in ' + (Date.now()-n) + 'ms.');

    return tree;
}

module.exports = compile;
}());