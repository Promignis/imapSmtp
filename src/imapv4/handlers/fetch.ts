import {
    CommandHandler,
    ParsedCommand,
    IMAPStatusResponse,
    FetchQuery,
    onFetchOptions,
    IMAPDataResponse
} from '../types'
import { IMAPResponseStatus } from '../constants'
import { IMAPConnection } from '../imapConnection'
import { to, getMessages } from '../utils'
import { imapCommandCompiler } from '../imapCommandCompiler'
import { imapStreamCommandCompiler } from '../imapStreamCommandCompiler'
import { PassThrough } from 'stream'

const messageDataItems: any = {
    //BODY.PEEK is treated same as BODY 
    // so its not specified here
    // BODY can take more option
    "BODY": {
        type: /^(\d+\.)*(CONTENT|HEADER|HEADER\.FIELDS|HEADER\.FIELDS\.NOT|TEXT|MIME|\d+)$/i,
        headers: /^(\d+\.)*(HEADER\.FIELDS|HEADER\.FIELDS\.NOT)$/i,
        // This is for BODY<partial> option
        startFrom: false,
        maxLength: false
    },
    "BODYSTRUCTURE": true,
    "ENVELOPE": true,
    "FLAGS": true,
    "INTERNALDATE": true,
    "RFC822": true,
    'RFC822.HEADER': true,
    'RFC822.SIZE': true,
    'RFC822.TEXT': true,
    'MODSEQ': true, // due to extra capabality, rfc7162 section 3.1.4
    'UID': true
}



// This handler handles both FETCH and UID FETCH commands as they have same behavior, only different arguments
// the numbers in the sequenceSet argument are unique identifiers (uid) instead of
// message sequence number. Refer rfc3501 section 6.4.8
// eg. A999 UID FETCH 4827313:4828442 FLAGS 
// eg. A999 FETCH 1:* FLAGS
// It has 2 main parts sequence set and message data
// message data can be one value or a sequence of params eg. (BODY[HEADER.FIELDS (DATE FROM)] BODY[TEXT] RFC822.HEADER BODYSTRUCTURE)
export const fetch: CommandHandler = async (conn: IMAPConnection, cmd: ParsedCommand): Promise<IMAPStatusResponse> => {

    // That means no service is attached. In this case return a bad response
    // if (conn._imapServer.handlerServices.onFetch == null) {
    //     return {
    //         tag: cmd.tag,
    //         type: IMAPResponseStatus.BAD,
    //         info: `Command ${cmd.command} not implemented`
    //     }
    // }

    let isUid = (cmd.command || '').toString().toUpperCase() === 'UID FETCH' ? true : false
    let sequenceSet = (cmd.attributes[0] && cmd.attributes[0].value) || ''

    // Verify if the sequence set string is in proper format
    // sequence sets can be unique comma seperated values, single int value or a range
    // Values may be static (e.g. "1", "2:4") or dynamic (e.g. "*", "1:*")
    // eg. 123:250; 123; 1:*; 123,234,564....; 1:2,2:4,5:6,7:8...
    if (!(sequenceSet.length && /^(\d+|\*)(:\d+|:\*)?(,(\d+|\*)(:\d+|:\*)?)*$/.test(sequenceSet))) {
        return {
            tag: cmd.tag,
            type: IMAPResponseStatus.BAD,
            info: `Invalid sequence set for ${cmd.command}`
        }
    }


    // each item in messageData array has the following structure
    // [ { type: 'ATOM', value: 'BODY', section: []... } ]
    // Non BODY messageData will not have a section parameter , just a string value
    let messageData: any[] = [].concat(cmd.attributes[1] || [])
    // CHANGEDSINCE extension
    // Refer rfc4551 section 3.3.1 
    let extensions = [].concat(cmd.attributes[2] || []).map((val: any) => val && val.value)

    // if CHANGEDSINCE extions is used
    let changedSince: number = 0
    if (extensions.length) {
        // Check if extension value is correnct
        if (extensions.length !== 2 || (extensions[0] || '').toString().toUpperCase() !== 'CHANGEDSINCE' || isNaN(extensions[1])) {
            return {
                tag: cmd.tag,
                type: IMAPResponseStatus.BAD,
                info: `Invalid CHANGEDSINCE modifier for ${cmd.command}`
            }
        }

        changedSince = Number(extensions[1])

        // In case CONDSTORE was not enabled during SELECT , make sure it's enabled now
        // a FETCH command with the CHANGEDSINCE modifier is a CONDSTORE enabling command
        // to see a list of all CONDSTORE enabling commands refer rfc7162 section 3.1
        if (changedSince && !conn.condstoreEnabled) {
            conn.condstoreEnabled = true
        }
    }

    // Get list of uids that fall into the sequenceSet
    let messageUids = getMessages(conn.selectedMailboxData!.messageSequence, sequenceSet, isUid)

    // Macros as defined in rfc 3501 section 6.4.5
    let macros = new Map(
        // Map iterator is a list of tuples
        [
            ['ALL', ['FLAGS', 'INTERNALDATE', 'RFC822.SIZE', 'ENVELOPE']],
            ['FAST', ['FLAGS', 'INTERNALDATE', 'RFC822.SIZE']],
            ['FULL', ['FLAGS', 'INTERNALDATE', 'RFC822.SIZE', 'ENVELOPE', 'BODY']]
        ]
    )

    // Start extracting the parameters

    // check if param is a macro
    if (cmd.attributes[1].type === 'ATOM' && macros.has(cmd.attributes[1].value.toUpperCase())) {
        messageData = macros.get(cmd.attributes[1].value.toUpperCase())!
    }

    let markAsSeen: boolean = false
    let flagsExist: boolean = false
    let uidExist: boolean = false
    let modseqExist: boolean = false

    messageData.forEach((param: any, i: number) => {
        if (!param || (typeof param !== 'string' && param.type !== 'ATOM')) {
            return {
                tag: cmd.tag,
                type: IMAPResponseStatus.BAD,
                info: `Invalid message data item name for ${cmd.command}`
            }
        }

        // restructure all the string parameters
        if (typeof param === 'string') {
            messageData[i] = {
                type: 'ATOM',
                value: param
            }
        }

        // If BODY or RFC822 messageData used , then the messages should be marked \Seen 
        // but only if the selected mailbox is in [READ-WRITE] mode , if in [READ-ONLY]
        // then dont do it
        if (!conn.selectedMailboxData!.readOnly) {
            if (param.value.toUpperCase() === 'BODY' && param.section) {
                // BODY[...]
                markAsSeen = true;
            } else if (param.value.toUpperCase() === 'RFC822') {
                // RFC822
                markAsSeen = true;
            }
        }

        // BODY.SEEK is behaves exactly like BODY , except that for BODY.SEEK message is left untouched
        if (param.value.toUpperCase() === 'BODY.PEEK' && param.section) {
            param.value = 'BODY'
        }

        if (param.value.toUpperCase() === 'FLAGS') {
            flagsExist = true;
        }

        if (param.value.toUpperCase() === 'UID') {
            uidExist = true;
        }

        if (param.value.toUpperCase() === 'MODSEQ') {
            modseqExist = true;
        }
    })

    // If query is marking the message as seen , then flags should be returned 
    // even if FLAGS param was not passed
    if (markAsSeen && !flagsExist) {
        messageData.push({
            type: 'ATOM',
            value: 'FLAGS'
        })

        flagsExist = true
    }

    // If the command is UID , then message uid must be returned
    // even if UID param was not passed
    if (isUid && !uidExist) {
        messageData.push({
            type: 'ATOM',
            value: 'UID'
        })

        uidExist = true
    }

    // If CHANGEDSINCE extension was present , then make sure message modseq is returned
    // even if MODSEQ param was not passed
    if (changedSince && !modseqExist) {
        messageData.push({
            type: 'ATOM',
            value: 'MODSEQ'
        })

        modseqExist = true
    }

    // complete messageData extracted at this point

    // Create query object
    let queries: FetchQuery[] = []

    try {
        queries = createQueries(messageData)
    } catch (e) {
        return {
            tag: cmd.tag,
            type: IMAPResponseStatus.BAD,
            info: e.message
        }
    }

    let opts: onFetchOptions = {
        queries: queries,
        markAsSeen,
        messageUids: messageUids,
    }

    if (changedSince) {
        opts.changedSince = changedSince
    }

    let [err, fetchedRes] = await to(conn._imapServer.handlerServices.onFetch!(conn.session!, opts))
    if (err != null) {
        throw err
    }

    for await (let f of fetchedRes!) {
        // now compile response and send
        let uid = f.uid
        let valuesArray = f.values
        let resp = createResp(queries, valuesArray, uid)
        if (resp.hasLiteral) {
            // If has literal then needs to be streamed 
            let respStream: PassThrough = imapStreamCommandCompiler(resp.response)
            let [err, _] = await to(conn.streamDataResponse(respStream))

            if (err != null) {
                // TODO: Close conenction here
                throw err
            }

            console.log('did this..')

        } else {
            // Can be compiled normally and written
            conn.sendDataResponse(resp.response)
        }
    }

    console.log('now here...')

    return {
        tag: cmd.tag,
        type: IMAPResponseStatus.OK,
        info: `${cmd.command} completed`,
    }
}

function createQueries(messageData: any[]): FetchQuery[] {
    let queries: FetchQuery[] = []
    let section: string = ''

    messageData.forEach((param: any) => {
        let q: FetchQuery = {
            queryString: imapCommandCompiler({
                attributes: param
            }),
            // convert to upper case to handle lower case commands
            // eg a001 fetch 1:* (body[text])
            item: (param.value || '').toString().toUpperCase(),
            original: param,
            isLiteral: false
        }

        // If its BODY[...] param
        if (param.section) {
            // If just BODY[]
            if (!param.section.length) {
                q.path = ''
                q.type = 'CONTENT' // BODY[]
            } else {
                // Will look like "TEXT" or "1.2.TEXT" where 1.2 is the mime tree path
                section = (param.section[0].value || '').toString().toUpperCase()
                // look for string of type 1.2.
                let matchedPath = section.match(/^(\d+\.)*(\d+$)?/)

                if (matchedPath && matchedPath[0].length) {
                    // remove the last fullstop
                    q.path = matchedPath[0].replace(/\.$/, '')
                    // fir 1.2.TEXT type is TEXT , for 1.2.3 type is CONTENT 
                    q.type = section.substr(q.path.length + 1) || 'CONTENT'
                } else {
                    // If only path
                    q.path = isNaN(Number(section)) ? '' : section
                    q.type = section
                }

                // If type is HEADER.FIELDS or HEADER.FIELDS.NOT, then add headers to item
                // eg. (BODY[HEADER.FIELDS (DATE FROM)])
                // then item.headers will have ["DATE", "FROM"]
                if (/^HEADER.FIELDS(\.NOT)?$/i.test(q.type) && Array.isArray(param.section[1])) {
                    q.headers = param.section[1].map((field: any) => (field.value || '').toString())
                }

                // All body values are returned as literals
                q.isLiteral = true
            }
        }

        if (param.partial) {
            q.partial = {
                startFrom: Number(param.partial[0]) || 0,
                maxLength: Number(param.partial[1]) || 0
            };
        }

        // If not a BODY[...] param
        if (['RFC822', 'RFC822.HEADER', 'RFC822.TEXT'].indexOf(param.value.toUpperCase()) >= 0) {
            q.isLiteral = true
        }
        // Validate if proper parameters were passed params were correct
        let schema = messageDataItems[q.item!]
        if (!schema || !queryIsValid(schema, q)) {
            throw new Error(`Invalid message data ${q.queryString} for FETCH`)
        }

        // Add item to array
        queries.push(q)
    })
    return queries
}

function queryIsValid(schema: any, item: FetchQuery): boolean {
    // For all non BODY params
    if (schema === true) {
        // non BODY params should not have type and partial
        if (item.hasOwnProperty('type') || item.partial) {
            return false;
        }
        return true;
    }

    // for BODY[...] params
    if (schema && typeof schema === 'object') {
        // If just BODY , then it will have no type parameter
        if (!item.type) {
            return true
        } else {
            if (schema.type && !schema.type.test(item.type)) {
                return false
            }

            // If the type is HEADER then item should have header values present
            if (schema.headers && schema.headers.test(item.type) && !Array.isArray(item.headers)) {
                // TODO: Validate each header value too??
                return false
            }
        }
    }
    return true
}

function createResp(qs: FetchQuery[], res: any[], uid: string): { hasLiteral: boolean, response: IMAPDataResponse } {
    let response: IMAPDataResponse = {
        tag: '*',
        command: '',
        attributes: []
    }

    response.attributes.push({
        type: 'TEXT',
        value: String(uid)
    })

    response.attributes.push({
        type: 'ATOM',
        value: 'FETCH'
    })

    let respAttributes: any[] = []
    let hasLiteral: boolean = false
    qs.forEach((q: FetchQuery, i: number) => {
        respAttributes.push(q.original)

        if (['FLAGS', 'MODSEQ'].indexOf(q.item) >= 0) {
            // These have array response
            // eg. * 1 FETCH (MODSEQ (65402) FLAGS (\Seen))
            respAttributes.push(
                [].concat(res[i] || []).map(value => ({
                    type: 'ATOM',
                    value: (value || value === 0 ? value : '').toString()
                }))
            )
        } else if (Object.prototype.toString.call(res[i]) === '[object Date]') {
            // internal date 
            let d = new Date(res[i])
            respAttributes.push({
                type: 'ATOM',
                value: new Date(res[i]).toUTCString()
            })
        } else if (Array.isArray(res[i])) {
            // BODYSTRUCTURE and ENVELOPE
            respAttributes.push(res[i])
        } else if (q.isLiteral) {
            hasLiteral = true
            // BODY, BODY[...], RFC822
            // Here the reaponse is an object with following parameters
            // {type: 'stream', value<stream.Passthrough>, expectedLength<number>, startFrom?<number>, maxLength?<number>}
            if (res[i] && res[i].type === 'stream') {
                respAttributes.push({
                    type: 'LITERAL',
                    value: res[i].value,
                    expectedLength: res[i].expectedLength,
                    startFrom: res[i].startFrom,
                    maxLength: res[i].maxLength
                })
            } else {
                respAttributes.push({
                    type: 'LITERAL',
                    value: res[i]
                })
            }
        } else if (res[i] === '') {
            // If some query could not be processed.
            respAttributes[1].push(res[i])
        } else {
            // For remaining commands
            response.attributes[1].push({
                type: 'ATOM',
                value: res[i].toString()
            })
        }
    })

    response.attributes.push(respAttributes)

    return {
        hasLiteral: hasLiteral,
        response: response
    }
}