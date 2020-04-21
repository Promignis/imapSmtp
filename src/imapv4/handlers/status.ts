import {
    CommandHandler,
    ParsedCommand,
    IMAPStatusResponse
} from '../types'
import { normalizeMailboxName } from '../utils'
import { IMAPConnection } from '../imapConnection'
import { IMAPResponseStatus, IMAPResponseCode } from '../constants'
import { to } from '../utils'

export const status: CommandHandler = async (conn: IMAPConnection, cmd: ParsedCommand): Promise<IMAPStatusResponse> => {

    let mailboxname: string = Buffer.from((cmd.attributes[0] && cmd.attributes[0].value) || '', 'binary').toString()

    let query: any[] | null = cmd.attributes[1] || null

    // That means no service is attached. In this case return a bad response
    if (conn._imapServer.handlerServices.onStatus == null) {
        return {
            tag: cmd.tag,
            type: IMAPResponseStatus.BAD,
            info: `Command ${cmd.command} not implemented`
        }
    }

    if (!mailboxname) {
        return {
            tag: cmd.tag,
            type: IMAPResponseStatus.BAD,
            info: `No mailbox name given`
        }
    }

    if (!Array.isArray(query)) {
        return {
            tag: cmd.tag,
            type: IMAPResponseStatus.BAD,
            info: `Invalid arguments for ${cmd.command}`
        }
    }

    // Check if empty status data sequece is empty
    if (!query.length) {
        return {
            tag: cmd.tag,
            type: IMAPResponseStatus.BAD,
            info: `Invalid arguments for ${cmd.command}`
        }
    }

    const supportedStatusData = ['MESSAGES', 'RECENT', 'UIDNEXT', 'UIDVALIDITY', 'UNSEEN', 'HIGHESTMODSEQ']

    let passedStatusData: string[] = []

    for (let i = 0; i < query.length; i++) {
        let q = query[i]
        let statusData = (q.value || '').toString().toUpperCase()
        if (!supportedStatusData.includes(statusData)) {
            return {
                tag: cmd.tag,
                type: IMAPResponseStatus.BAD,
                info: `Invalid  status data ${statusData} for ${cmd.command}`
            }
        }
        if (passedStatusData.indexOf(statusData) < 0) {
            passedStatusData.push(statusData)
        }
    }


    mailboxname = normalizeMailboxName(mailboxname)

    // If HIGHESTMODSEQ is passed , then enable condstore if not already enabled
    // refer rfc 4551 , section 3.6, 3.7
    if (passedStatusData.includes('HIGHESTMODSEQ') && !conn.condstoreEnabled) {
        conn.condstoreEnabled = true
    }

    let [err, res] = await to(conn._imapServer.handlerServices.onStatus(conn.session!, mailboxname))

    if (err != null) {
        throw err
    }

    // Mailbox was not found
    if (res == null) {
        return {
            tag: cmd.tag,
            type: IMAPResponseStatus.NO,
            code: IMAPResponseCode.NONEXISTENT,
            info: `Mailbox not found`
        }
    }

    // Mailbox was found 
    // Create the response
    let responseAttributes: any[] = []

    passedStatusData.forEach((k: string) => {
        responseAttributes.push({
            type: 'ATOM',
            value: k
        })
        switch (k) {
            case 'MESSAGES':
                responseAttributes.push({
                    type: 'ATOM',
                    value: String(res!.messages || 0)
                })
                break
            case 'RECENT':
                responseAttributes.push({
                    type: 'ATOM',
                    value: String(res!.recent || 0)
                })
                break
            case 'UIDNEXT':
                responseAttributes.push({
                    type: 'ATOM',
                    value: String(res!.uidnext || 0)
                })
                break
            case 'UIDVALIDITY':
                responseAttributes.push({
                    type: 'ATOM',
                    value: String(res!.uidValidity || 0)
                })
                break
            case 'UNSEEN':
                responseAttributes.push({
                    type: 'ATOM',
                    value: String(res!.unseen || 0)
                })
                break
            case 'HIGHESTMODSEQ':
                responseAttributes.push({
                    type: 'ATOM',
                    value: String(res!.highestmodseq || 0)
                })
                break
            default:
                break
        }
    })

    conn.sendDataResponse({
        tag: "*",
        command: cmd.command,
        attributes: [
            {
                type: 'text',
                value: mailboxname
            },
            responseAttributes
        ]
    })

    return {
        tag: cmd.tag,
        type: IMAPResponseStatus.OK,
        info: `${cmd.command} Completed`
    }
}