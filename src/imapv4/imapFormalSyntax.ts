// Refer https://tools.ietf.org/html/rfc3501#section-9
// Refer https://en.wikipedia.org/wiki/Augmented_Backus%E2%80%93Naur_form

'use strict'

// Takes ASCII hex values 
function expandRange(start: number, end: number): string {
    let chars = [];
    for (let i = start; i <= end; i++) {
        chars.push(i)
    }
    return String.fromCharCode(...chars)
}

function excludeChars(source: string, exclude: string): string {
    let sourceArr = Array.prototype.slice.call(source)
    for (let i = sourceArr.length - 1; i >= 0; i--) {
        if (exclude.indexOf(sourceArr[i]) >= 0) {
            sourceArr.splice(i, 1)
        }
    }
    return sourceArr.join('')
}

export const imapFormalSyntax = {
    // Any ASCII character, excluding NUL, %x00-FF
    CHAR: function () {
        let value = expandRange(0x01, 0x7f)
        this.CHAR = function () {
            return value
        }
        return value
    },

    // any OCTET except NUL (%x00) , %x01-ff
    CHAR8: function () {
        let value = expandRange(0x01, 0xff)
        this.CHAR8 = function () {
            return value
        }
        return value
    },

    // Empty space
    SP: function () {
        return ' '
    },

    // Control charecters, %x00-1F / %x7F
    CTL: function () {
        let value = expandRange(0x00, 0x1f) + '\x7F'
        this.CTL = function () {
            return value
        }
        return value
    },


    DQUOTE: function () {
        return '"'
    },

    // Upper- and lower-case ASCII letters (A–Z, a–z)
    ALPHA: function () {
        let value = expandRange(0x41, 0x5a) + expandRange(0x61, 0x7a)
        this.ALPHA = function () {
            return value
        }
        return value
    },

    // Decimal digits (0–9)
    DIGIT: function () {
        let value = expandRange(0x30, 0x39) + expandRange(0x61, 0x7a)
        this.DIGIT = function () {
            return value
        }
        return value
    },

    // Any CHAR except atom-specials
    'ATOM-CHAR': function () {
        let value = excludeChars(this.CHAR(), this['atom-specials']())
        this['ATOM-CHAR'] = function () {
            return value
        }
        return value
    },

    'ASTRING-CHAR': function () {
        let value = this['ATOM-CHAR']() + this['resp-specials']()
        this['ASTRING-CHAR'] = function () {
            return value
        }
        return value
    },

    'TEXT-CHAR': function () {
        let value = excludeChars(this.CHAR(), '\r\n')
        this['TEXT-CHAR'] = function () {
            return value
        }
        return value
    },

    'atom-specials': function () {
        let value = '(' + ')' + '{' + this.SP() + this.CTL() + this['list-wildcards']() + this['quoted-specials']() + this['resp-specials']()
        this['atom-specials'] = function () {
            return value
        }
        return value
    },

    'list-wildcards': function () {
        return '%' + '*'
    },

    'quoted-specials': function () {
        let value = this.DQUOTE() + '\\'
        this['quoted-specials'] = function () {
            return value
        }
        return value
    },

    'resp-specials': function () {
        return ']'
    },

    tag: function () {
        let value = excludeChars(this['ASTRING-CHAR'](), '+')
        this.tag = function () {
            return value
        }
        return value
    },

    command: function () {
        let value = this.ALPHA() + this.DIGIT() + '-'
        this.command = function () {
            return value
        }
        return value
    },

    verify: function (str: string, allowedChars: string): number {
        for (let i = 0, len = str.length; i < len; i++) {
            if (allowedChars.indexOf(str.charAt(i)) < 0) {
                return i
            }
        }
        return -1
    }
}
