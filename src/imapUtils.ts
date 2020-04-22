import {
    FetchQuery,
    BodyPartial
} from './imapv4'

//@ts-ignore
import { getLength, rebuildOriginal, resolveNode, formatHeaders, createIMAPBody } from '../rfc822'

import { IMessageDoc } from './db/messages'


// Imap flags mapped to corresponding parameters in the message document 
export const IMAPFlagsToMessageModel: { [key: string]: string } = {
    // refer message model
    '\\Seen': 'flags.seen',
    '\\Draft': 'draft',
    '\\Flagged': 'flags.important',
    '\\Deleted': 'deleted'
}

interface ContentSelector {
    type: string,
    path: string,
    headers?: string[]
}

interface QueriedContentsOpts {
    getAttachment?: Function | null,
    createReadStream?: Function | null,
}

interface GetContentOpts extends QueriedContentsOpts {
    skipExternal?: boolean,
    startFrom?: number,
    maxLength?: number
}

// Get contents from a given MimeTree
// based on FETCH command arguments
const getContent = (mimeTree: any, selector: ContentSelector, options: GetContentOpts) => {

    let type = selector.type
    let path = selector.path
    let node = mimeTree

    // If path specified , then we need to fetch that particular node from the MimeTree
    // eg 1.2.3 
    if (path) {
        node = resolveNode(mimeTree, path)
    }

    // If node for the given path was not found
    if (!node) {
        return null
    }
    switch (type) {
        case 'CONTENT':
            if (!path) {
                // BODY[]
                node.attachmentMap = mimeTree.attachmentMap
                return rebuildOriginal(node, false, options)
            }
            // BODY[1.2.3]
            node.attachmentMap = mimeTree.attachmentMap
            return rebuildOriginal(node, true, options)

        case 'HEADER':
            if (!path) {
                // BODY[HEADER] mail header
                return formatHeaders(node.header).join('\r\n') + '\r\n\r\n'
            } else if (node.message) {
                // BODY[1.2.3.HEADER] embedded message/rfc822 header
                return (node.message.header || []).join('\r\n') + '\r\n\r\n'
            }
            return ''

        case 'HEADER.FIELDS': {
            // BODY[HEADER.FIELDS (Key1 Key2 KeyN)] only selected header keys
            if (!selector.headers || !selector.headers.length) {
                return '\r\n\r\n';
            }
            let headers = formatHeaders(node.header).filter((line: string) => {
                let key = line.split(':').shift()
                if (!key) {
                    return false
                }
                // Making it upper case because FETCH header arguments are in upper case
                // while in mime format they are in lower case
                key = key.trim().toUpperCase()
                // Check if given header was passed in the arguments
                return selector.headers!.indexOf(key) >= 0;
            })
                .join('\r\n') + '\r\n\r\n'
            return headers
        }
        case 'HEADER.FIELDS.NOT': {
            // BODY[HEADER.FIELDS.NOT (Key1 Key2 KeyN)] all but selected header keys
            if (!selector.headers || !selector.headers.length) {
                return formatHeaders(node.header).join('\r\n') + '\r\n\r\n'
            }
            let headers = formatHeaders(node.header).filter((line: string) => {
                let key = line.split(':').shift()
                if (!key) {
                    return false
                }
                // Making it upper case because FETCH header arguments are in upper case
                // while in mime format they are in lower case
                key = key.trim().toUpperCase()
                // Check if given header was passed in the arguments
                return selector.headers!.indexOf(key) < 0
            })
                .join('\r\n') + '\r\n\r\n'
            return headers
        }

        case 'MIME':
            // BODY[1.2.3.MIME] mime node header
            return formatHeaders(node.header).join('\r\n') + '\r\n\r\n'

        case 'TEXT':
            if (!selector.path) {
                // BODY[TEXT] mail body without headers
                node.attachmentMap = mimeTree.attachmentMap
                return rebuildOriginal(node, true, options)
            } else if (node.message) {
                // BODY[1.2.3.TEXT] embedded message/rfc822 body without headers
                node.attachmentMap = mimeTree.attachmentMap
                return rebuildOriginal(node.message, true, options)
            }
            return ''
        default:
            return ''
    }
}

// This method 
export const getQueriedContents = async (queries: FetchQuery[], message: IMessageDoc, options: QueriedContentsOpts): Promise<any[]> => {

    let mimeTree: any = message.body
    let opts: GetContentOpts = {
        getAttachment: options.getAttachment || null,
        createReadStream: options.createReadStream || null
    }
    // generate response object
    // Values can be of many types , depending on the query 
    // so not possible to type it
    let values: any[] = [];
    for (let i = 0; i < queries.length; i++) {
        let q = queries[i]
        let value: any
        let flags: string[] = []
        switch (q.item) {
            case 'UID':
                value = message.uid;
                break;

            case 'MODSEQ':
                value = message.modseq;
                break;

            case 'FLAGS':
                Object.keys(IMAPFlagsToMessageModel).forEach((f: string) => {
                    let msgObjPath = IMAPFlagsToMessageModel[f].split('.')
                    let flagStatus: any = message
                    msgObjPath.forEach((p: string) => {
                        flagStatus = flagStatus && flagStatus[p]
                    })
                    if (flagStatus) flags.push(f)
                })
                value = flags
                break;

            case 'INTERNALDATE':
                if (!message.idate) {
                    message.idate = new Date()
                }
                value = message.idate;
                break

            case 'BODYSTRUCTURE': {
                if (message.imapBodyStructure) {
                    value = message.imapBodyStructure
                }
                break;
            }
            case 'ENVELOPE':
                if (message.imapEnvelope) {
                    value = message.imapEnvelope
                }
                break;

            case 'RFC822':
                value = await getContent(mimeTree,
                    {
                        type: 'CONTENT',
                        path: ''
                    },
                    options)
                break;

            case 'RFC822.SIZE':
                if (message.size) {
                    value = message.size;
                }
                break;

            case 'RFC822.HEADER':
                // Equivalent to BODY[HEADER]
                value = [].concat(mimeTree.header || []).join('\r\n') + '\r\n\r\n';
                break;

            case 'RFC822.TEXT':
                // Equivalent to BODY[TEXT]
                value = await getContent(mimeTree, {
                    path: '',
                    type: 'TEXT'
                }, options)
                break

            case 'BODY':
                if (q.partial && q.partial.startFrom) {
                    opts.startFrom = q.partial.startFrom
                }
                if (q.partial && q.partial.maxLength) {
                    opts.maxLength = q.partial.maxLength
                }
                if (!q.hasOwnProperty('type')) {
                    // BODY
                    value = createIMAPBody(mimeTree)
                } else if (q.path === '' && q.type === '') {
                    // BODY[]
                    value = await getContent(mimeTree, {
                        type: 'CONTENT',
                        path: ''
                    }, opts);
                } else {
                    // BODY[SELECTOR]
                    value = await getContent(mimeTree, {
                        type: q.type!,
                        path: q.path || '',
                        headers: q.headers
                    }, opts);
                }

                if (q.partial) {
                    let len;
                    // Values whcih have rebult mime (returned by rebuildOriginal method) 
                    // have a a property type: 'stream'
                    // checking for that
                    if (value && value.type === 'stream') {
                        value.startFrom = q.partial.startFrom;
                        value.maxLength = q.partial.maxLength;
                        len = value.expectedLength
                    } else {
                        value = value.toString('binary').substr(q.partial.startFrom, q.partial.maxLength);
                        len = value.length;
                    }

                    // If start+length is larger than available value length, then do not return the length value
                    // Instead of BODY[]<10.20> return BODY[]<10> which means that the response is from offset 10 to the end
                    if (q.original.partial.length === 2 && q.partial.maxLength - q.partial.startFrom > len) {
                        q.original.partial.pop();
                    }
                }

                break;
        }
        values.push(value);
    }

    return values;
};