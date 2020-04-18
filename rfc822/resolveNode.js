const formatHeaders = require('./utils').formatHeaders

// used when a mime tree path is passed in commands like FETCH 
// For example A001 FETCH 1 BODY[1.2.3.TEXT]
// An example of what paths represent
//        HEADER     ([RFC-2822] header of the message)
//        TEXT       ([RFC-2822] text body of the message) MULTIPART/MIXED
//        1          TEXT/PLAIN
//        2          APPLICATION/OCTET-STREAM
//        3          MESSAGE/RFC822
//        3.HEADER   ([RFC-2822] header of the message)
//        3.TEXT     ([RFC-2822] text body of the message) MULTIPART/MIXED
//        3.1        TEXT/PLAIN
//        3.2        APPLICATION/OCTET-STREAM
//        4          MULTIPART/MIXED
//        4.1        IMAGE/GIF
//        4.1.MIME   ([MIME-IMB] header for the IMAGE/GIF)
//        4.2        MESSAGE/RFC822
//        4.2.HEADER ([RFC-2822] header of the message)
//        4.2.TEXT   ([RFC-2822] text body of the message) MULTIPART/MIXED
//        4.2.1      TEXT/PLAIN
//        4.2.2      MULTIPART/ALTERNATIVE
//        4.2.2.1    TEXT/PLAIN
//        4.2.2.2    TEXT/RICHTEXT

// so from the above example BODY[1.2.3.TEXT] (path="1.2.3.TEXT") should return `([RFC-2822] text body of the message) MULTIPART/MIXED`

const resolveNode = (mimeTree, path) => {
    if (!mimeTree.childNodes && path === '1') {
        path = ''
    }

    let pathNumbers = (path || '').toString().split('.')
    let contentNode = mimeTree
    let pathNumber

    while ((pathNumber = pathNumbers.shift())) {
        pathNumber = Number(pathNumber) - 1
        // for content type message/rfc822
        if (contentNode.message) {
            contentNode = contentNode.message
        }

        if (contentNode.childNodes && contentNode.childNodes[pathNumber]) {
            contentNode = contentNode.childNodes[pathNumber]
        } else {
            return false;
        }
    }

    return contentNode
}

module.exports = resolveNode
