const PassThrough = require('stream').PassThrough
const NEWLINE = Buffer.from('\r\n')
const formatHeaders = require('./utils').formatHeaders
const getLength = require('./getLength')

// Rebuilds the original rfc822 text from the MimeTree object (that we get from rfc822parser.js)
// If textOnly true, do not include the message header in the response
/**
 * If there were attachments , then 2 options, options.getAttachment and options.createReadStream must be passed
 * which are methods with the following signature
 *       getAttachment(unique_identifier) => Promise(object | null)
 * what ever getAttachment returns will be passed on to createReadStream 
 *       createReadStream(unique_identifier, <whatever was returned by getAttachment()>, <optional>{<number>start, <number>end}) => RedableStream
 * 
 * This readable stream should stream the attachment data
 * 
 * Returns
 * This method returns a Passthrough stream , that streams the rebuilt rfc822 text
 * 
 */
const rebuild = async function (mimeTree, textOnly, options) {
    options = options || {};

    let output = new PassThrough();
    let aborted = false;

    let skipExternal = options.skipExternal || true
    let startFrom = Math.max(Number(options.startFrom) || 0, 0)
    let maxLength = Math.max(Number(options.maxLength) || 0, 0)

    let getAttachment = options.getAttachment || null
    let createReadStream = options.createReadStream || null

    output.isLimited = !!(options.startFrom || options.maxLength)

    let curWritePos = 0;
    let writeLength = 0;

    let getCurrentBounds = size => {
        if (curWritePos + size < startFrom) {
            curWritePos += size;
            return false;
        }

        if (maxLength && writeLength >= maxLength) {
            writeLength += size;
            return false;
        }

        let startFromBounds = curWritePos < startFrom ? startFrom - curWritePos : 0;

        let maxLengthBounds = maxLength ? maxLength - writeLength : 0;
        maxLengthBounds = Math.min(size - startFromBounds, maxLengthBounds);
        if (maxLengthBounds < 0) {
            maxLengthBounds = 0;
        }

        return {
            startFrom: startFromBounds,
            maxLength: maxLengthBounds
        };
    };

    let write = async chunk => {
        if (!chunk || !chunk.length) {
            return;
        }

        if (curWritePos >= startFrom) {
            // already allowed to write
            curWritePos += chunk.length;
        } else if (curWritePos + chunk.length <= startFrom) {
            // not yet ready to write, skip
            curWritePos += chunk.length;
            return;
        } else {
            // chunk is in the middle
            let useBytes = curWritePos + chunk.length - startFrom;
            curWritePos += chunk.length;
            chunk = chunk.slice(-useBytes);
        }

        if (maxLength) {
            if (writeLength >= maxLength) {
                // can not write anymore
                return;
            } else if (writeLength + chunk.length <= maxLength) {
                // can still write chunks, so do nothing
                writeLength += chunk.length;
            } else {
                // chunk is in the middle
                let allowedBytes = maxLength - writeLength;
                writeLength += chunk.length;
                chunk = chunk.slice(0, allowedBytes);
            }
        }

        if (output.write(chunk) === false) {
            await new Promise(resolve => {
                // If you stop writing, the stream will later emit a drain event to indicate that the system buffer has emptied 
                // and it is appropriate to write again
                // when drain is complete continue writing
                output.once('drain', resolve());
            });
        }
    };

    let processStream = async () => {
        let firstLine = true;
        let isRootNode = true;
        let remainder = false;


        // make sure that mixed body + mime gets rebuilt correctly
        let emit = async (data, force) => {
            if (remainder || data || force) {
                if (!firstLine) {
                    await write(NEWLINE);
                } else {
                    firstLine = false;
                }

                if (remainder && remainder.length) {
                    await write(remainder);
                }

                if (data) {
                    await write(Buffer.isBuffer(data) ? data : Buffer.from(data, 'binary'));
                }
            }
            remainder = false;
        };

        let walk = async node => {
            if (aborted) {
                return;
            }
            if (!textOnly || !isRootNode) {
                await emit(formatHeaders(node.header).join('\r\n') + '\r\n');
            }

            isRootNode = false;
            if (Buffer.isBuffer(node.body)) {
                // node Buffer
                remainder = node.body;
            } else if (node.body && node.body.buffer) {
                // mongodb Binary
                remainder = node.body.buffer;
            } else if (typeof node.body === 'string') {
                // binary string
                remainder = Buffer.from(node.body, 'binary');
            } else {
                // whatever
                remainder = node.body;
            }

            if (node.boundary) {
                // this is a multipart node, so start with initial boundary before continuing
                await emit(`--${node.boundary}`);
            } else if (node.attachmentId && skipExternal) {
                await emit(false, true); // force newline between header and contents

                let attachmentId = node.attachmentId;
                if (mimeTree.attachmentMap && mimeTree.attachmentMap[node.attachmentId]) {
                    attachmentId = mimeTree.attachmentMap[node.attachmentId];
                }
                // If getAttachment method has not been passed but we need to fetch attachment data
                // then throw error
                if (!getAttachment || !createReadStream) {
                    let missing = `${!getAttachment ? 'getAttachment ' : ''}${!createReadStream ? 'createReadStream ' : ''}`
                    throw new Error(`Cant not get attachment data, missing: ${missing} `)
                }
                let attachmentData = await getAttachment(attachmentId)
                // this should return an id that create will take
                // rebuild should not know about any internal working
                // type it accordingly

                let attachmentSize = node.size;

                let readBounds = getCurrentBounds(attachmentSize);
                if (readBounds) {
                    // move write pointer ahead by skipped base64 bytes
                    let bytes = Math.min(readBounds.startFrom, node.size);
                    curWritePos += bytes;

                    // only process attachment if we are reading inside existing bounds
                    if (node.size > readBounds.startFrom) {

                        let attachmentStream = createReadStream(attachmentId, attachmentData, readBounds)

                        await new Promise((resolve, reject) => {
                            attachmentStream.once('error', err => {
                                reject(err);
                            });

                            attachmentStream.once('end', () => {
                                // update read offset counters

                                let bytes = 'outputBytes' in attachmentStream ? attachmentStream.outputBytes : readBounds.maxLength;

                                if (bytes) {
                                    curWritePos += bytes;
                                    if (maxLength) {
                                        writeLength += bytes;
                                    }
                                }
                                resolve();
                            });

                            attachmentStream.pipe(
                                output,
                                {
                                    end: false
                                }
                            );
                        });
                    }
                }
            }

            if (Array.isArray(node.childNodes)) {
                let pos = 0;
                for (let childNode of node.childNodes) {
                    await walk(childNode);

                    if (aborted) {
                        return;
                    }

                    if (pos++ < node.childNodes.length - 1) {
                        // emit boundary unless last item
                        await emit(`--${node.boundary}`);
                    }
                }
            }

            if (node.boundary) {
                await emit(`--${node.boundary}--`);
            }

            await emit();
        };

        await walk(mimeTree);

        if (mimeTree.lineCount > 1) {
            await write(NEWLINE);
        }

        output.end();
    };

    setImmediate(() => {
        processStream()
            .then(() => {
                output.end();
            })
            .catch(err => {
                output.emit('error', err);
            });
    });

    // if called then stops resolving rest of the message
    output.abort = () => {
        aborted = true;
    };

    return {
        type: 'stream',
        value: output,
        expectedLength: getLength(mimeTree, textOnly)
    };
}

module.exports = rebuild