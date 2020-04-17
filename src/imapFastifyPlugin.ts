import fastifyPlugin from 'fastify-plugin'
import {
    IMAPServer,
    onLoginResp,
    IMAPSession,
    onListOpts,
    MailboxInfo,
    onSelectResp
} from './imapv4'
import { IUser } from './db/users'
import { IMailboxDoc, IMailbox } from './db/mailboxes'
import { to } from './utils'
import { imapLogger } from './logger'
import { FindQuery } from './types/types'

async function setupIMAPServer(fastify: any, { }, done: Function) {
    let server = new IMAPServer({ logger: imapLogger })

    // attach services
    server.handlerServices.onLogin = login(fastify)
    server.handlerServices.onList = list(fastify)
    server.handlerServices.onSelect = select(fastify)
    fastify.decorate('imapServer', server)

    done()
}

interface imapSession {
    username: string | null,
    address: string | null,
    selectedMailbox: string | null

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
        let flags = [
            '\\Seen',
            '\\Draft',
            '\\Flagged',
            '\\Deleted'
        ]
        // Updated session
        sess.selectedMailbox = mailbox._id.toHexString()
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
        // each uid is 2 bytes integer, so for 100,000 messages mongodb then amount of bytes transferred
        // would be just ~200kb and it would use up only that much system memory per session.
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
            readOnly: false,
            updatedSession: session
            // TODO: Look into if we need to implement message sequence numbers, 
            // so that we can send unseen message seq number  
        }

        return response
    }
}
export const setupIMAPPlugin = fastifyPlugin(setupIMAPServer)