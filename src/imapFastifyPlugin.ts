import fastifyPlugin from 'fastify-plugin'
import mongodb from 'mongodb'
import {
    IMAPServer,
    onLoginResp,
    IMAPSession,
    onListOpts,
    MailboxInfo,
    onSelectResp,
    onFetchOptions,
    FetchQuery,
    onStatusResponse
} from './imapv4'
import { IUser } from './db/users'
import { IMailboxDoc } from './db/mailboxes'
import { IAttachmentDoc } from './db/attachments'
import { to } from './utils'
import { imapLogger } from './logger'
import { FindQuery } from './types/types'
import { IMAPFlagsToMessageModel } from './imapUtils'
import { events } from './messageNotifier'
import { getQueriedContents } from './imapUtils'
import config from './config'

async function setupIMAPServer(fastify: any, { }, done: Function) {
    let certPath: string = config.get("imap.tls.cert")
    let keyPath: string = config.get("imap.tls.key")
    let server = new IMAPServer({
        logger: imapLogger,
        tls: {
            keyPath,
            certPath
        }
    })

    // Setup Listners
    fastify.messageNotifier.on(events.new, (msg: any) => {
        // notify the imap server
        server.newMessageAdded({
            userUUID: msg.userid,
            mailboxUUID: msg.mailboxId,
            uid: msg.uid,
            modseq: msg.modseq
        })
    })

    // attach services
    server.handlerServices.onLogin = login(fastify)
    server.handlerServices.onList = list(fastify)
    server.handlerServices.onSelect = select(fastify)
    server.handlerServices.onFetch = fetch(fastify)
    server.handlerServices.onStatus = status(fastify)
    fastify.decorate('imapServer', server)

    done()
}

interface imapSession {
    username: string | null,
    address: string | null,
    selectedMailbox: string | null

}

function getAttachment(fastify: any) {
    return async function (id: string): Promise<IAttachmentDoc | null> {
        let f = fastify
        let filter: any = {
            _id: new mongodb.ObjectID(id)
        }

        let [err, res] = await to(f.services.attachmentService.getAttachment(filter))
        if (err != null) {
            throw err
        }

        if (!res) {
            return null
        }

        return <IAttachmentDoc>res
    }
}

function createReadStream(fastify: any) {
    // This method will be internally called by rebuild method
    // attachmentData is of whatever type getAttachment returns
    // bounds has the following structure
    /**
     * {
     *  startFrom?: number,
     *  maxLength.number
     * }
     */
    return function (id: string, attachmentData: any, bounds: any): NodeJS.ReadableStream {
        let f = fastify
        let readStream: NodeJS.ReadableStream
        let objectId = new mongodb.ObjectID(id)
        if (attachmentData) {
            let streamOpts: { start: number, end: number } = { start: 0, end: 0 }

            if (bounds) {
                streamOpts.start = bounds.startFrom
                streamOpts.end = bounds.startFrom + bounds.maxLength
            }
            // ensure that the bounds don't exceed message length
            if (streamOpts.start && streamOpts.start > attachmentData.length) {
                streamOpts.start = attachmentData.length
            }

            if (streamOpts.end && streamOpts.end > attachmentData.length) {
                streamOpts.end = attachmentData.length
            }

            readStream = f.services.attachmentService.getDownloadStream(objectId, streamOpts)

        } else {
            readStream = f.services.attachmentService.getDownloadStream(objectId)
        }

        return readStream
    }
}

function login(fastify: any) {
    return async function (username: string, password: string): Promise<onLoginResp> {
        let resp: onLoginResp

        let err: Error | null | undefined
        let userObj: IUser | undefined

        [err, userObj] = await to(fastify.services.userService.login({}, username, password))

        if (err != null) {
            // Right now login method throws error of incorrect credentials 
            // So check if the error was because of wrong credential or some other error
            // TODO: Fix this flow. Should return some value (maybe null?) instead of throwing an error
            if (err.message == 'Incorrect password') {
                resp = {
                    success: false,
                    // Session value will be ignored if login failed so we can keep this empty
                    session: <IMAPSession>{}
                }

                return resp
            }

            throw err
        }

        // Login was successful
        let sess: imapSession = {
            username: userObj!.username,
            address: userObj!.primeAddress.toHexString(),
            selectedMailbox: null
        }
        resp = {
            success: true,
            session: {
                userUUID: userObj!.id,
                mailboxUUID: '',
                sessionProps: sess
            }
        }

        return resp
    }
}

function list(fastify: any) {
    return async function (session: IMAPSession, params: onListOpts): Promise<MailboxInfo[]> {

        let userId = session.userUUID
        let sess = <imapSession>session.sessionProps
        let address = sess.address

        // We are not handling onListOpts.returnParams
        let specialUseOnly: boolean = params.selectionParams && params.selectionParams.includes('SPECIAL-USE')

        // Fetch all the mailboxes for the user
        let q = {
            filter: {
                user: userId,
                address: address
            }
        }

        let mailboxes: IMailboxDoc[] | undefined
        let err: Error | null

        [err, mailboxes] = await to(fastify.services.mailboxService.findMailboxes({}, q))

        if (err != null) {
            throw err
        }

        let path = params.mailboxname

        // We are going to convert this into a regex , so do the proper formatting
        // ie. add escape for regex charecters
        path = path
            // remove excess * and %
            .replace(/\*\*+/g, '*')
            .replace(/%%+/g, '%')
            // escape special regex characters
            .replace(/([\\^$+?!.():=[\]|,-])/g, '\\$1')
            // setup *
            .replace(/[*]/g, '.*')
            // setup %
            .replace(/[%]/g, '[^/]*');

        let regex = new RegExp('^' + path + '$', '')

        let mailboxlist = mailboxes!.filter(mb => !!regex.test(mb.imapName))
        let response: MailboxInfo[] = []
        // Create response object

        mailboxlist.forEach((mb: IMailboxDoc) => {
            let m = <MailboxInfo>{}
            if (specialUseOnly && !mb.specialUse) {
                return
            }

            if (mb.specialUse) {
                switch (mb.specialUse) {
                    case "/Sent":
                        m.specialUse = "\\Sent"
                        break
                    case "/Junk":
                        m.specialUse = "\\Junk"
                        break
                    case "/Drafts":
                        m.specialUse = "\\Drafts"
                        break
                    case "/Trash":
                        m.specialUse = "\\Trash"
                        break
                }
            }

            m.delimiter = mb.delimiter
            m.path = mb.imapName
            // Right now all mailboxes have no children
            // Later when functionality to add new mailboxes is added
            // we will need to do more checks here
            m.mailboxAttributes = ['\\HasNoChildren']

            response.push(m)
        })

        return response
    }
}

function select(fastify: any) {
    return async function (session: IMAPSession, mailboxname: string): Promise<onSelectResp | null> {

        let userId = session.userUUID
        let sess = <imapSession>session.sessionProps
        let address = sess.address

        let q: FindQuery = {
            filter: {
                user: userId,
                address: address,
                imapName: mailboxname
            }
        }

        let mailboxes: IMailboxDoc[] | undefined
        let err: Error | null
        [err, mailboxes] = await to(fastify.services.mailboxService.findMailboxes({}, q))

        if (err != null) {
            throw err
        }

        // It should return just one result for the given combination query
        // If its more or less than one then return null
        if (mailboxes!.length != 1) {
            return null
        }

        let mailbox = mailboxes![0]

        let flags = Object.keys(IMAPFlagsToMessageModel)

        // Updated session
        session.mailboxUUID = mailbox.id // This will be used by the imap server
        sess.selectedMailbox = mailbox.id // this will be used by the services internally
        session.sessionProps = sess

        // Create messageSequence array
        // refer rfc3501 section 2.3.1.2
        // Its not possible to store this value in db as it can be different for different sessions
        // It has to be dynamically generated on each SELECT command

        let messageUidQuery: FindQuery = {
            filter: {
                mailbox: mailbox._id
            },
            projection: 'uid'
        }
        let messageIds: any
        // Right now , we are fetching a list of all meesage uids in a mailbox , and then ordering
        // them 
        // If we take a an exaple of a mailbox with a very large number of emails , say 100,000
        // even in that case , the query should be pretty fast because of proper indexing and the bandwidth
        // should also be pretty small as we are projecting just uid parameter 
        // each uid is 4 bytes integer, so for 100,000 messages mongodb then amount of bytes transferred
        // would be just ~400kb and it would use up only that much system memory per session.
        // If we scale to a palce where we are working with millions of messages in a mailbox,
        // then we might need to optimize how we are managing message sequence values.
        [err, messageIds] = await to(fastify.services.messageService.findMessages({}, messageUidQuery))

        if (err != null) {
            throw err
        }

        // sort and ensure unique UIDs  
        let messageSequence = Array.from<number>(new Set(messageIds.map((m: any) => m.uid))).sort((a: unknown, b: unknown) => <number>a - <number>b)

        //Recent is not supported by the backend
        let response: onSelectResp = {
            messageSequence: messageSequence,
            flags: flags,
            exists: mailbox.stats.total,
            permanentFlags: flags,
            uidNext: mailbox.uidNext,
            uidValidity: mailbox.uidValidity,
            HIGHESTMODSEQ: mailbox.modifyIndex,
            // For now, access to a mailbox is read only. 
            // it should be false when STORE and EXPUNGE commands 
            // which are not currently implemented
            readOnly: true,
            updatedSession: session
            // TODO: Look into if we need to implement message sequence numbers, 
            // so that we can send unseen message seq number  
        }

        return response
    }
}

function fetch(fastify: any) {
    return async function (session: IMAPSession, options: onFetchOptions): Promise<AsyncGenerator<any | null, void, unknown>> {
        let f = fastify
        let userId = session.userUUID
        let sess = <imapSession>session.sessionProps
        let address = sess.address
        let mbId = sess.selectedMailbox

        let projection: string[] = ['_id', 'uid', 'modseq']

        let metadataOnly: boolean = true

        // Create a  filter to find the correct messages
        options.queries.forEach((q: FetchQuery) => {
            if (['BODY', 'RFC822', 'RFC822.HEADER', 'RFC822.TEXT'].includes(q.item!)) {
                metadataOnly = false
            }

            if (q.item == 'BODYSTRUCTURE') {
                projection.push('imapBodyStructure')
            }

            if (q.item == 'ENVELOPE') {
                projection.push('envelope')
            }

            if (q.item == 'FLAGS') {
                projection.push('flags')
                projection.push('draft')
                projection.push('deleted')
            }

            if (q.item == 'INTERNALDATE') {
                projection.push('idate')
            }

            if (q.item == 'RFC822.SIZE') {
                projection.push('size')
            }
        })

        if (!metadataOnly) {
            projection.push('body')
        }

        // call find with the filter but only grab a cursor

        let findOptions = {
            // Sort the results by uid
            sort: { uid: 1 },
            // For large mailboxes , this could take long time to complete
            // depending on the size of the mailbox
            // so keep load off the primary s
            readPreference: 'secondaryPreferred'
        }

        let cursorOptions: any = {}
        // If only these keys are being projected , then we can query a larger batch size
        // as the amount of data being queried is pretty small
        let limitedKeys = ['_id', 'flags', 'modseq', 'uid']

        if (!projection.some(key => !limitedKeys.includes(key))) {
            cursorOptions.batchSize = 1000
        }

        let findQuery: FindQuery = {
            filter: {
                user: userId,
                address: address,
                mailbox: mbId,
                uid: {
                    // $in has no upper limit to array length that can be passed to it
                    // the query is only limited by total size , ie. 16mb
                    // say we are dealing with messageUids of large sizes say 100,000
                    // then it only adds ~400kb to the total query size
                    // and because of indexing , the find should be as effecient as it can be.
                    // We might need to optimize if and when we start working with mailboxes
                    // with millions of messages, like for example batching queries etc.
                    $in: options.messageUids
                }
            },
            projection: projection.join(' ')
        }

        if (options.changedSince) {
            findQuery.filter = Object.assign(findQuery.filter, {
                modseq: {
                    $gt: options.changedSince
                }
            })
        }

        let opts: { dbCallOptions?: any, cursorOpts?: any } = {
            dbCallOptions: findOptions,
            cursorOpts: cursorOptions
        }

        // Call the service
        let cursor = f.services.messageService.findMessagesCursor({}, findQuery, opts)

        // return a generator
        async function* gen() {
            for (let msg = await cursor.next(); msg != null; msg = await cursor.next()) {
                // create the response structure
                try {
                    let values = await getQueriedContents(options.queries, msg, {
                        getAttachment: getAttachment(f),
                        createReadStream: createReadStream(f)
                    })
                    /**
                 * TODO: The yielded response can not be typed , becuase it's extremly dynamic
                 * So document what type of response is expected by the imap server for every query  
                 * 
                 * Basic description:
                 * the yielded value must be an array of responses for each query in the queries array 
                 * and must be in the same order as the query.
                 * eg. for the following query 
                 *  [   
                 *      {                                              
                            query: 'FLAGS',                           
                            item: 'FLAGS',                            
                            original: ....
                        },                                          
                        {                                           
                            query: 'UID',                           
                            item: 'UID',                            
                            original: ...
                        }
                    ]  
                 *  The response would look like this: [[\Seen], 32] (same order as query)
                 * 
                 *  If the service can not process certain queries, it should return ''
                 *  for example for a query like [{query: 'BODYSTRUCTURE' ....}, ...] 
                 *  if BODYSTRUCTURE can't be processed then response would look like
                 *  ['', ....]
                 *  It should never be skipped as it will break the ordering.
                 */
                    if (!options.markAsSeen) {
                        yield {
                            uid: msg.uid,
                            values
                        }
                    } else {
                        // When imap in READ-WRITE mode then all mails touched by BODY[] or RFC822
                        // argument should be marked as seen
                    }

                } catch (e) {
                    //TODO: Log here 
                    throw (e)
                }
            }
        }

        return gen()
    }
}

function status(fastify: any) {
    return async function (session: IMAPSession, mailboxname: string): Promise<onStatusResponse | null> {
        let userId = session.userUUID
        let sess = <imapSession>session.sessionProps
        let address = sess.address

        let q: FindQuery = {
            filter: {
                user: userId,
                address: address,
                imapName: mailboxname
            }
        }

        let mailboxes: IMailboxDoc[] | undefined
        let err: Error | null
        [err, mailboxes] = await to(fastify.services.mailboxService.findMailboxes({}, q))

        if (err != null) {
            throw err
        }

        // It should return just one result for the given filter
        // If its more or less than one then return null
        if (mailboxes!.length != 1) {
            return null
        }

        let mailbox = mailboxes![0]

        return {
            messages: mailbox.stats.total,
            recent: 0,
            uidnext: mailbox.uidNext,
            uidValidity: mailbox.uidValidity,
            unseen: mailbox.stats.unseen,
            highestmodseq: mailbox.modifyIndex
        }
    }
}

export const setupIMAPPlugin = fastifyPlugin(setupIMAPServer)