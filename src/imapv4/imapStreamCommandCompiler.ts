import { imapFormalSyntax } from './imapFormalSyntax'
import { PassThrough, Transform, TransformCallback } from 'stream'
import { IMAPDataResponse } from './types'

// const LengthLimiter = require('../length-limiter');

const SINGLE_SPACE = Buffer.from(' ');
const LEFT_PARENTHESIS = Buffer.from('(');
const RIGHT_PARENTHESIS = Buffer.from(')');
const NIL = Buffer.from('NIL');
const LEFT_SQUARE_BRACKET = Buffer.from('[');
const RIGHT_SQUARE_BRACKET = Buffer.from(']');

let START_CHAR_LIST = [0x28, 0x3c, 0x5b]; // ['(', '<', '[']

/**
 * Compiles an input object into a streamed IMAP response
 */
export const imapStreamCommandCompiler = (response: IMAPDataResponse, isLogging: boolean = false): PassThrough => {
    let output = new PassThrough();

    let processStream = async () => {
        let start: string = (response.tag || '') + (response.command ? ' ' + response.command : '');
        let resp: Buffer[] = []
        resp = resp.concat(start ? Buffer.from(start) : [])

        let lr = resp.length && resp[resp.length - 1]; // this value is going to store last known `resp` state for later usage

        let val: string
        let lastType: string

        // emits data to socket or pushes to queue if previous write is still being processed
        let emit = async (stream?: any, isLimited?: boolean, expectedLength?: number, startFrom?: number, maxLength?: number) => {
            if (resp.length) {
                // emit queued response
                output.write(Buffer.concat(resp));
                lr = resp[resp.length - 1];
                resp = [];
            }

            if (!stream || !expectedLength) {
                return;
            }

            return new Promise((resolve, reject) => {
                // Reduce the expected length if maxLength is specified
                // if max length is not specified , it means partial starts from a particular 
                // byte to the end of the literal
                expectedLength = maxLength ? Math.min(expectedLength!, startFrom! + maxLength) : expectedLength;
                startFrom = startFrom || 0
                maxLength = maxLength || 0

                // stream is already limited
                // backend service sets this flag
                if (isLimited) {
                    let limiter = new LengthLimiter(expectedLength! - startFrom, ' ', 0, 0)
                    stream.pipe(limiter).pipe(
                        output,
                        {
                            end: false
                        }
                    );
                    limiter.once('end', () => resolve());
                } else {
                    // Otherwise we need to cut out the extra bits
                    let limiter = new LengthLimiter(expectedLength!, ' ', startFrom, 0)
                    stream.pipe(limiter).pipe(
                        output,
                        {
                            end: false
                        }
                    );
                    limiter.once('end', () => resolve());
                }

                // pass errors to output
                stream.once('error', reject);
            });
        };

        // TODO: Type node arg
        let walk = async (node: any, options: any) => {
            options = options || {};

            let last = (resp.length && resp[resp.length - 1]) || lr;
            let lastCharOrd = last && last.length && last[last.length - 1]; // ord value of last char

            if (lastType === 'LITERAL' || (lastCharOrd && !START_CHAR_LIST.includes(lastCharOrd))) {
                if (options.isSubArray) {
                    // ignore separator
                } else {
                    resp.push(SINGLE_SPACE);
                }
            }

            if (!node && typeof node !== 'string' && typeof node !== 'number') {
                // null or false or undefined
                return resp.push(NIL);
            }

            if (Array.isArray(node)) {
                lastType = 'LIST'

                // (...)
                resp.push(LEFT_PARENTHESIS)

                // Check if we need to skip separtor WS between two arrays
                let isSubArray = node.length > 1 && Array.isArray(node[0])

                for (let child of node) {
                    if (isSubArray && !Array.isArray(child)) {
                        isSubArray = false;
                    }
                    await walk(child, { isSubArray })
                }

                resp.push(RIGHT_PARENTHESIS)
                return;
            }

            if (node && node.buffer && !Buffer.isBuffer(node)) {
                // mongodb binary data
                node = node.buffer
            }

            if (typeof node === 'string' || Buffer.isBuffer(node)) {
                node = {
                    type: 'STRING',
                    value: node
                };
            }

            if (typeof node === 'number') {
                node = {
                    type: 'NUMBER',
                    value: node
                };
            }

            lastType = node.type;

            if (isLogging && node.sensitive) {
                resp.push(Buffer.from('"(* value hidden *)"'))
                return;
            }

            switch (node.type.toUpperCase()) {
                case 'LITERAL': {
                    let nodeValue = node.value;

                    if (typeof nodeValue === 'number') {
                        nodeValue = nodeValue.toString()
                    }

                    let len;

                    // Figure out correct byte length
                    if (nodeValue && typeof nodeValue.pipe === 'function') {
                        len = node.expectedLength || 0
                        if (node.startFrom) {
                            len -= node.startFrom
                        }
                        if (node.maxLength) {
                            len = Math.min(len, node.maxLength)
                        }
                    } else {
                        len = (nodeValue || '').toString().length
                    }

                    if (isLogging) {
                        resp.push(Buffer.from('"(* ' + len + 'B literal *)"'))
                    } else {
                        resp.push(Buffer.from('{' + Math.max(len, 0) + '}\r\n'))

                        if (nodeValue && typeof nodeValue.pipe === 'function') {
                            //value is a stream object
                            // emit existing string before passing the stream
                            await emit(nodeValue, node.isLimited, node.expectedLength, node.startFrom, node.maxLength)
                        } else if (Buffer.isBuffer(nodeValue)) {
                            resp.push(nodeValue)
                        } else {
                            resp.push(Buffer.from((nodeValue || '').toString('binary'), 'binary'))
                        }
                    }
                    break
                }
                case 'STRING':
                    if (isLogging && node.value.length > 20) {
                        resp.push(Buffer.from('"(* ' + node.value.length + 'B string *)"'))
                    } else {
                        // JSON.stringify conveniently adds enclosing quotes and escapes any "\ occurences
                        resp.push(Buffer.from(JSON.stringify((node.value || '').toString('binary')), 'binary'))
                    }
                    break;

                case 'TEXT':
                case 'SEQUENCE':
                    if (Buffer.isBuffer(node.value)) {
                        resp.push(node.value);
                    } else {
                        resp.push(Buffer.from((node.value || '').toString('binary'), 'binary'));
                    }
                    break;

                case 'NUMBER':
                    resp.push(Buffer.from((node.value || 0).toString()));
                    break;

                case 'ATOM':
                case 'SECTION': {
                    val = (node.value || '').toString();

                    if (imapFormalSyntax.verify(val.charAt(0) === '\\' ? val.substr(1) : val, imapFormalSyntax['ATOM-CHAR']()) >= 0) {
                        val = JSON.stringify(val);
                    }

                    resp.push(Buffer.from(val))

                    if (node.section) {
                        resp.push(LEFT_SQUARE_BRACKET);
                        for (let child of node.section) {
                            await walk(child, {});
                        }
                        resp.push(RIGHT_SQUARE_BRACKET);
                    }

                    if (node.partial) {
                        resp.push(Buffer.from('<' + node.partial[0] + '>'));
                    }
                }
            }
        };

        for (let attrib of [].concat(response.attributes || [])) {
            await walk(attrib, {});
        }

        // push the remaining stuff 
        await emit()
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

    return output;
};


// A stream transform that takes an literal and cuts it down to 
// a particualr size
class LengthLimiter extends Transform {
    expectedLength: number
    padding: string
    startFrom: number
    byteCounter: number
    finished: boolean
    constructor(expectedLength: number, padding: string, startFrom: number, byteCounter: number) {
        super()
        this.expectedLength = expectedLength
        this.padding = padding || ' '
        this.byteCounter = byteCounter || 0
        this.startFrom = startFrom || 0
        this.finished = false
        Transform.call(this)
    }

    _transform(chunk: any, encoding: string, done: TransformCallback) {
        if (encoding !== 'buffer') {
            //@ts-ignore
            chunk = Buffer.from(chunk, encoding)
        }

        if (!chunk || !chunk.length || this.finished) {
            return done();
        }

        // not yet at allowed position
        if (chunk.length + this.byteCounter <= this.startFrom) {
            // ignore
            this.byteCounter += chunk.length;
            return done();
        }

        // start emitting at middle of chunk
        if (this.byteCounter < this.startFrom) {
            // split the chunk and ignore the first part
            chunk = chunk.slice(this.startFrom - this.byteCounter);
            this.byteCounter += this.startFrom - this.byteCounter;
        }

        // can emit full chunk
        if (chunk.length + this.byteCounter <= this.expectedLength) {
            this.byteCounter += chunk.length;
            this.push(chunk);
            if (this.byteCounter >= this.expectedLength) {
                this.finished = true;
                this.emit('done', false);
            }
            return setImmediate(done);
        }

        // stop emitting in the middle of chunk
        let buf = chunk.slice(0, this.expectedLength - this.byteCounter)
        let remaining = chunk.slice(this.expectedLength - this.byteCounter)
        this.push(buf)
        this.finished = true
        this.emit('done', remaining)
        return setImmediate(done)
    }

    _flush(done: TransformCallback) {
        if (!this.finished) {
            // add padding if incoming stream stopped too early
            if (this.expectedLength > this.byteCounter) {
                let buf = Buffer.from(this.padding.repeat(this.expectedLength - this.byteCounter))
                this.push(buf)
            }
            this.finished = true
        }
        done()
    }
}
