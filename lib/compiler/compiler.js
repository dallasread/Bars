var CodeBuffer = require('./code-buffer'),
    Token      = require('./token');

function bufferSlice(code, range) {
    return JSON.stringify(
        code.slice(Math.max(0, code.index-range), code.index)
    ).slice(1, -1) +
    JSON.stringify(code.charAt(code.index) || 'EOF')
    .slice(1, -1).green.underline +
    JSON.stringify(
        code.slice(
            code.index + 1,
            Math.min(code.length, code.index + 1 + range)
        )
    ).slice(1, -1);
}


var SELF_CLOSEING_TAGS = require('./self-closing-tags');
var ENTITIES           = require('./html-entities');


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

/////////
// DOM //
/////////

function HTML_COMMENT(mode, code, tokens, close) {
    var index = code.index,
        length = code.length,
        comment;

    if ( /* <!-- */
        code.codePointAt(index)   === 60 &&
        code.codePointAt(++index) === 33 &&
        code.codePointAt(++index) === 45 &&
        code.codePointAt(++index) === 45
    ) {
        comment = new Token(code, 'HTML-COMMENT');
        index++;

        for (; index < length; index++) {
            if ( /* --> */
                code.codePointAt(index)     === 45 &&
                code.codePointAt(index + 1) === 45 &&
                code.codePointAt(index + 2) === 62
            ) {
                index += 3;
                code.index = index;
                comment.close(code);

                comment.value = comment.source(code);

                return comment;
            }
        }

        throw code.makeError(
            'Unclosed Comment: Expected "-->" to fallow "<!--".',
            4
        );
    }

    return null;
}

function HTML_CLOSE_TAG(mode, code, tokens, close) {
    var index = code.index,
        length = code.length,
        tag;

    if ( /* </ */
        code.codePointAt(index) === 60 &&
        code.codePointAt(++index) === 47
    ) {
        tag = new Token(code, 'HTML-TAG');
        tag.name = '';

        index++;

        for (; index < length; index++) {
            ch = code.codePointAt(index);

            if (HTML_IDENTIFIER(ch)) {
                tag.name += code.charAt(index);
            } else if (ch === 62) { /* > */
                index++;
                code.index = index;
                tag.close(code);

                if (!close || close.type !== tag.type) {
                    code.index = tag.range[0];
                    throw code.makeError(
                        'Unexpected Closing Tag: ' +
                        JSON.stringify(tag.source(code)) +
                        '.',
                        tag.length
                    );
                }

                if (close.name !== tag.name) {
                    code.index = tag.range[0];
                    throw code.makeError(
                        'Mismatch Closing Tag: Expected ' +
                        JSON.stringify('</' + close.name + '>') +
                        ' to fallow ' +
                        JSON.stringify(tag.source(code)) +
                        '.',
                        tag.length
                    );
                }

                close.close(code);
                return null;
            } else {
                code.index = index;
                throw code.makeError(
                    'Unexpected Token: Expected ' +
                    JSON.stringify('>') +
                    ' but found ' +
                    JSON.stringify(code.charAt(index)) +
                    '.'
                );
            }
        }
    }

    return null;
}

function HTML_OPEN_TAG(mode, code, tokens, close) {
    var index = code.index,
        length = code.length,
        tag;
    if ( /* < */
        code.codePointAt(index) === 60
    ) {
        tag = new Token(code, 'HTML-TAG');
        tag.name = '';
        tag.attrs = [];
        tag.nodes = [];

        index++;

        for (; index < length; index++) {
            ch = code.codePointAt(index);

            if (HTML_IDENTIFIER(ch)) {
                tag.name += code.charAt(index);
            } else {
                break;
            }
        }

        code.index = index;

        parseTokens('ATTR', code, tag.attrs, tag);

        if (!tag.closed) {
            throw code.makeError(
                'Unclosed Tag: Expected ' +
                JSON.stringify('>') +
                ' but found ' +
                JSON.stringify(code.charAt(code.index)) +
                '.',
                tag.length
            );
        }

        if (SELF_CLOSEING_TAGS.indexOf(tag.name) !== -1) {
            tag.selfClosing = true;
        }

        if (tag.selfClosing || tag.selfClosed) {
            tag.close(code);

            return tag;
        }

        delete tag.closed;

        parseTokens('DOM', code, tag.nodes, tag);

        if (!tag.closed) {
            code.index = tag.range[0];

            throw code.makeError(
                'Unclosed Tag: Expected ' +
                JSON.stringify('</' + tag.name + '>') +
                ' to fallow ' +
                JSON.stringify(tag.source(code)) +
                '.',
                tag.length
            );
        }

        return tag;
    }

    return null;
}

function HTML_TEXT(mode, code, tokens, close) {
    var ch,
        index = code.index,
        isEntity = false,
        entityStr = '',
        text = new Token(code, 'HTML-TEXT');

    text.value = '';

    for (; index < code.length; index++) {
        ch = code.codePointAt(index);

        if (
            ch === 60 /* < */ ||
            ch === 123 /* { */ &&
            code.codePointAt(index + 1) === 123 /* { */
        ) {
            text.value += entityStr;
            break;
        }

        if (ch === 38 /* & */) {
            isEntity = true;
            entityStr = code.charAt(index);

            continue;
        } else if (isEntity && ch === 59 /* ; */) {
            entityStr += code.charAt(index);

            text.value += getHTMLUnEscape(entityStr);

            isEntity = false;
            entityStr = '';

            continue;
        }

        if (isEntity && HTML_ENTITY(ch)) {
            entityStr += code.charAt(index);
        } else {
            text.value += entityStr;
            isEntity = false;
            entityStr = '';

            text.value += code.charAt(index);
        }
    }

    if (text.value) {
        code.index = index;

        text.close(code);

        return text;
    }

    return null;
}

function HTML_OPEN_TAG_END(mode, code, tokens, close) {
    var ch = code.codePointAt(code.index);
        /* > */
    if (ch === 62) {
        code.index++;
        close.close(code);
    } else if ( /* /> */
        ch === 47 &&
        code.codePointAt(code.index + 1) === 62
    ) {
        code.index += 2;
        close.close(code);
        close.selfClosed = true;
    }

    return null;
}

function HTML_ATTR(mode, code, tokens, close) {

    var index = code.index,
        length = code.length,
        attr = new Token(code, 'HTML-ATTR');
        attr.name = '';
        attr.nodes = [];

    for (; index < length; index++) {

        if (!HTML_IDENTIFIER(code.codePointAt(index))) {
            break;
        }

        attr.name += code.charAt(index);
    }

    if (attr.name) {
        /* = */
        if (code.codePointAt(index) === 61) {
            index++;
            /* " */
            if (code.codePointAt(index) === 34) {
                index++;
                code.index = index;

                parseTokens('VALUE', code, attr.nodes, attr);
            } else {
                code.index = index;
                throw code.makeError(
                    'Unexpected Token: Expected "\"" but found ' +
                    JSON.stringify(code.charAt(index))
                );
            }
        } else {
            code.index = index;
            attr.close(code);
        }

        if (!attr.closed) {
            code.index = attr.range[0] + attr.name.length + 1;
            throw code.makeError(
                'Unclosed String: Expected "\"" to fallow "\""'
            );
        }

        return attr;
    }

    return null;
}


//////////
// ATTR //
//////////

function STRING_END(mode, code, tokens, close) {
    if (code.codePointAt(code.index) === 34 /* " */) {
        code.index++;
        close.close(code);
    }

    return null;
}

function STRING_TEXT(mode, code, tokens, close) {
    var ch,
        index = code.index,
        length = code.length,
        text = new Token(code, 'STRING-TEXT');

        text.value = '';

    for (; index < length; index++) {
        ch = code.codePointAt(index);

        if (ch === 10) {
            return null;
        }

        if ( /* " but not \" */
            ch === 34 &&
            code.codePointAt(index - 1) !== 92
        ) {
            break;
        }

        if ( /* {{ */
            ch === 123 &&
            code.codePointAt(index + 1) === 123
        ) {
            break;
        }
    }

    if (index > code.index) {
        code.index = index;
        text.close(code);
        text.value = text.source(code);
        return text;
    }

    return null;
}

function WHITE_SPACE(mode, code, tokens, close) {
    var index = code.index,
        length = code.length,
        whitespace = 0;

    for (; index < length; index++) {
        if (!WHITESPACE(code.codePointAt(index))) {
            break;
        }
        whitespace++;
    }

    if (whitespace) {
        code.index = index;
        return null;
    }

    return null;
}

//////////
// BARS //
//////////

function BARS_COMMENT(mode, code, tokens, close) {
    var index = code.index,
        length = code.length,
        comment;

    if ( /* {{! */
        code.codePointAt(index)   === 123 &&
        code.codePointAt(++index) === 123 &&
        code.codePointAt(++index) === 33 //&&
        // code.codePointAt(++index) === 45 &&
        // code.codePointAt(++index) === 45
    ) {
        comment = new Token(code, 'HTML-COMMENT');
        index++;

        for (; index < length; index++) {
            if ( /* }} */
                // code.codePointAt(index)     === 45 &&
                // code.codePointAt(index + 1) === 45 &&
                code.codePointAt(index + 2) === 125 &&
                code.codePointAt(index + 2) === 125
            ) {
                index += 3;
                code.index = index;
                comment.close(code);

                comment.value = comment.source(code);

                return comment;
            }
        }

        throw code.makeError(
            'Unclosed Comment: Expected "}}" to fallow "{{!".',
            3
        );
    }

    return null;
}

function BARS_CLOSE_BLOCK(mode, code, tokens, close) {
    var index = code.index,
        length = code.length,
        block;

    if ( /* {{/ */
        code.codePointAt(index)   === 123 &&
        code.codePointAt(++index) === 123 &&
        code.codePointAt(++index) === 47
    ) {
        block = new Token(code, 'BARS-BLOCK');
        block.name = '';

        index++;

        for (; index < length; index++) {
            ch = code.codePointAt(index);

            if (HTML_IDENTIFIER(ch)) {
                block.name += code.charAt(index);
            } else if ( /* }} */
                ch === 125 &&
                code.codePointAt(index + 1) === 125
            ) {
                index+=2;
                code.index = index;
                block.close(code);

                if (!close || close.type !== block.type) {
                    code.index = block.range[0];
                    throw code.makeError(
                        'Unexpected Closing Block: ' +
                        JSON.stringify(block.source(code)) +
                        '.',
                        block.length
                    );
                }

                if (close.name !== block.name) {
                    code.index = block.range[0];
                    throw code.makeError(
                        'Mismatch Closing Block: Expected ' +
                        JSON.stringify('{{/' + close.name + '}}') +
                        ' to fallow ' +
                        JSON.stringify(block.source(code)) +
                        '.',
                        block.length
                    );
                }

                close.close(code);
                return null;
            } else {
                code.index = index;
                throw code.makeError(
                    'Unexpected Token: Expected ' +
                    JSON.stringify('}}') +
                    ' but found ' +
                    JSON.stringify(code.charAt(index)) +
                    '.'
                );
            }
        }
    }

    return null;
}

function BARS_ELSE_BLOCK(mode, code, tokens, close) {
    var index = code.index,
        length = code.length,
        block;

    if ( /* {{else}} */
        code.codePointAt(index)   === 123 &&
        code.codePointAt(++index) === 123 &&
        code.codePointAt(++index) === 101 &&
        code.codePointAt(++index) === 108 &&
        code.codePointAt(++index) === 115 &&
        code.codePointAt(++index) === 101 &&
        code.codePointAt(++index) === 125 &&
        code.codePointAt(++index) === 125
    ) {
        block = new Token(code, 'BARS-ELSE');
        index++;
        code.index = index;
        block.close(code);

        if (!close) {
            code.index = block.range[0];
            throw code.makeError(
                'Unexpected Token: ' +
                JSON.stringify(block.source(code)) +
                '.',
                block.length
            );
        }

        close.elsed = block;

        close.close(code);
    }

    return null;
}

function BARS_OPEN_BLOCK(mode, code, tokens, close) {
    var index = code.index,
        length = code.length,
        block;
    if ( /* {{# */
        code.codePointAt(index) === 123 &&
        code.codePointAt(++index) === 123 &&
        code.codePointAt(++index) === 35
    ) {
        block = new Token(code, 'BARS-BLOCK');
        block.name = '';
        block.logic = [];
        block.consequent = [];
        block.alternate = [];

        index++;

        for (; index < length; index++) {
            ch = code.codePointAt(index);

            if (HTML_IDENTIFIER(ch)) {
                block.name += code.charAt(index);
            } else {
                break;
            }
        }

        code.index = index;

        parseTokens('LOGIC', code, block.logic, block);

        if (!block.closed) {
            throw code.makeError(
                'Unclosed Block: Expected ' +
                JSON.stringify('}}') +
                ' but found ' +
                JSON.stringify(code.charAt(code.index)) +
                '.',
                block.length
            );
        }

        delete block.closed;

        parseTokens(mode, code, block.consequent, block);

        if (block.elsed) {

            delete block.elsed;
            delete block.closed;

            parseTokens(mode, code, block.alternate, block);

            if (block.elsed) {
                code.index = block.elsed.range[0];
                throw code.makeError(
                    'Unexpected Token: ' +
                    JSON.stringify(block.elsed.source(code)),
                    block.elsed.length
                );
            }
        }

        if (!block.closed) {
            code.index = block.range[0];

            throw code.makeError(
                'Unclosed Block: Expected ' +
                JSON.stringify('{{/' + block.name + '}}') +
                ' to fallow ' +
                JSON.stringify(block.source(code)) +
                '.',
                block.length
            );
        }

        return block;
    }

    return null;
}

function BARS_OPEN_INSERT(mode, code, tokens, close) {
    var index = code.index,
        length = code.length,
        block;
    if ( /* {{ */
        code.codePointAt(index) === 123 &&
        code.codePointAt(++index) === 123
    ) {
        block = new Token(code, 'BARS-INSERT');
        block.logic = [];

        index++;

        code.index = index;

        parseTokens('LOGIC', code, block.logic, block);

        if (!block.closed) {
            throw code.makeError(
                'Unclosed Block: Expected ' +
                JSON.stringify('}}') +
                ' but found ' +
                JSON.stringify(code.charAt(code.index)) +
                '.',
                block.length
            );
        }

        return block;
    }

    return null;
}

function BARS_OPEN_PARTIAL(mode, code, tokens, close) {
    var index = code.index,
        length = code.length,
        block;
    if ( /* {{> */
        code.codePointAt(index) === 123 &&
        code.codePointAt(++index) === 123 &&
        code.codePointAt(++index) === 62
    ) {
        block = new Token(code, 'BARS-INSERT');
        block.name = '';
        block.logic = [];

        index++;

        for (; index < length; index++) {
            ch = code.codePointAt(index);

            if (HTML_IDENTIFIER(ch)) {
                block.name += code.charAt(index);
            } else {
                break;
            }
        }

        code.index = index;

        parseTokens('LOGIC', code, block.logic, block);

        if (!block.closed) {
            throw code.makeError(
                'Unclosed Block: Expected ' +
                JSON.stringify('}}') +
                ' but found ' +
                JSON.stringify(code.charAt(code.index)) +
                '.',
                block.length
            );
        }

        return block;
    }

    return null;
}

function BARS_LOGIC_END(mode, code, tokens, close) {
    if ( /* }} */
        code.codePointAt(code.index) === 125 &&
        code.codePointAt(code.index + 1) === 125
    ) {
        code.index += 2;
        close.close(code);
    }

    return null;
}

/* Parse Modes */

var parseTokenFuncs = {
    'DOM': [
        HTML_COMMENT,
        HTML_CLOSE_TAG,
        HTML_OPEN_TAG,
        BARS_COMMENT,
        BARS_CLOSE_BLOCK,
        BARS_ELSE_BLOCK,
        BARS_OPEN_BLOCK,
        BARS_OPEN_PARTIAL,
        BARS_OPEN_INSERT,
        HTML_TEXT
    ],
    'ATTR': [
        HTML_OPEN_TAG_END,
        BARS_COMMENT,
        BARS_CLOSE_BLOCK,
        BARS_ELSE_BLOCK,
        BARS_OPEN_BLOCK,
        WHITE_SPACE,
        HTML_ATTR,
    ],
    'VALUE': [
        STRING_END,
        BARS_COMMENT,
        BARS_CLOSE_BLOCK,
        BARS_ELSE_BLOCK,
        BARS_OPEN_BLOCK,
        BARS_OPEN_INSERT,
        STRING_TEXT
    ],
    'LOGIC': [
        BARS_LOGIC_END
        // STRING,
        // NUMBER,
        // OPPERATOR,
        // INSERT_VAL,
        // TRANSFORM
    ],
};
function repeat(a, b) {
    var c = '';
    for (var i = 0; i < b; i++) {
        c+=a;
    }
    return c;
}
function parseTokens(mode, code, tokens, close) {
    var token,
        index = code.index;

    parseTokens.level++;

    loop: while (code.left) {

        for (var i = 0; i < parseTokenFuncs[mode].length; i++) {
            console.log(
                repeat(' ', parseTokens.level) + mode.green + ' '+
                parseTokenFuncs[mode][i].name + '\n' +
                repeat(' ', parseTokens.level + 1) + bufferSlice(code, 5)
            );
            token = parseTokenFuncs[mode][i](mode, code, tokens, close);


            if (close && close.closed) {
                break loop;
            }

            if (token) {
                tokens.push(token);
            }
        }

        if (index === code.index) {
            token = new Token(code, 'ILLEGAL');
            code.next();
            token.close(code);
            token.value = token.source(code);
            code.index = token.range[0];
            throw code.makeError(
                'ILLEGAL Token: ' +
                JSON.stringify(token.source(code))
            );
            // tokens.push(token);
        }

        index = code.index;
    }

    // if (close && !close.closed) {
    //     throw code.makeError(
    //         'Unexpected End Of Input.'
    //     );
    // }

    parseTokens.level--;
}
parseTokens.level = -1;

function compile (str, file) {
    var code = new CodeBuffer(str, file),
        frag = new Token(code, 'FRAGMENT');
        frag.nodes = [];

    parseTokens('DOM', code, frag.nodes);

    frag.close(code);

    return frag;
}

module.exports = compile;