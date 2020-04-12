import fastifyPlugin from 'fastify-plugin'
import {
    IMAPServer,
    onLoginResp,
    IMAPSession,
    onListOpts,
    MailboxInfo
} from './imapv4'
import { IUser } from './db/users'
import { IMailboxDoc, IMailbox } from './db/mailboxes'
import { to } from './utils'
import { imapLogger } from './logger'

async function setupIMAPServer(fastify: any, { }, done: Function) {

    // TODO: Add logger
    let server = new IMAPServer({ logger: imapLogger })

    // attach services
    server.handlerServices.onLogin = login(fastify)
    server.handlerServices.onList = list(fastify)
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
export const setupIMAPPlugin = fastifyPlugin(setupIMAPServer)