const formatHeaders = require('./utils').formatHeaders

const getLength = function (mimeTree, textOnly) {
    let size = 0;
    let first = true;
    let root = true;

    // make sure that mixed body + mime gets rebuilt correctly
    let append = (data, force) => {
        if (Array.isArray(data)) {
            data = data.join('\r\n');
        }
        if (data || force) {
            size += Buffer.byteLength((first ? '' : '\r\n') + (data || ''), 'binary');
            first = false;
        }
    };

    let walk = (node, next) => {
        if (!textOnly || !root) {
            append(formatHeaders(node.header).join('\r\n') + '\r\n');
        }

        let finalize = () => {
            if (node.boundary) {
                append(`--${node.boundary}--\r\n`);
            }

            append();
            next();
        };

        root = false;
        if (node.size || node.attachmentId) {
            if (!node.boundary) {
                append(false, true); // force newline
            }
            size += node.size;
        }

        if (node.boundary) {
            append(`--${node.boundary}`);
        }

        if (Array.isArray(node.childNodes)) {
            let pos = 0;
            let processChildNodes = () => {
                if (pos >= node.childNodes.length) {
                    return finalize();
                }
                let childNode = node.childNodes[pos++];
                walk(childNode, () => {
                    if (pos < node.childNodes.length) {
                        append(`--${node.boundary}`);
                    }
                    return processChildNodes();
                });
            };
            processChildNodes();
        } else {
            finalize();
        }
    };

    walk(mimeTree, () => false);

    return size;
}

module.exports = getLength