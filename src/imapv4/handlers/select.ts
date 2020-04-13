import {
    CommandHandler,
    ParsedCommand,
    IMAPStatusResponse,
    IMAPDataResponse
} from '../types'
import { IMAPResponseStatus, IMAPResponseCode, supportedSystemFlags, State } from '../constants'
import { IMAPConnection } from '../imapConnection'
import { normalizeMailboxName, to } from '../utils'

export const select: CommandHandler = async (conn: IMAPConnection, cmd: ParsedCommand): Promise<IMAPStatusResponse> => {

    // That means no service is attached. In this case return a bad response
    if (conn._imapServer.handlerServices.onSelect == null) {
        return {
            tag: cmd.tag,
            type: IMAPResponseStatus.BAD,
            info: `Command ${cmd.command} not implemented`
        }
    }

    let mailboxaname = Buffer.from((cmd.attributes[0] && cmd.attributes[0].value) || '', 'binary').toString()
    mailboxaname = normalizeMailboxName(mailboxaname)
    let extensions = [].concat(cmd.attributes[1] || []).map((attr: any) => ((attr && attr.value) || '').toString().toUpperCase())
    let enableCondstore = false
    // refer rfc4551
    if (extensions.includes("CONDSTORE")) {
        enableCondstore = true
    }

    // Empty mailbox name
    if (!mailboxaname) {
        return {
            tag: cmd.tag,
            type: IMAPResponseStatus.NO,
            code: IMAPResponseCode.NONEXISTENT,
            info: `Mailbox not found`
        }
    }

    let selectOpts = enableCondstore ? ['CONDSTORE'] : []
    let [err, resp] = await to(conn._imapServer.handlerServices.onSelect(conn.session!, mailboxaname))


    if (err != null) {
        // if a mailbox is already selected and a SELECT command that
        // fails is attempted, no mailbox is selected.
        // Reset the connection state
        conn.resetSelectedState()

        throw err
    }

    if (resp! == null) {
        // This means mailbox was not present

        // if a mailbox is already selected and a SELECT command that
        // fails is attempted, no mailbox is selected.
        // Reset the connection state
        conn.resetSelectedState()


        return {
            tag: cmd.tag,
            type: IMAPResponseStatus.NO,
            code: IMAPResponseCode.NONEXISTENT,
            info: `Mailbox not found`
        }
    } else {
        // Mailbox was found
        // set condstoreEnabled true for this connection
        if (enableCondstore) conn.condstoreEnabled = true
        // Set selected conn states
        conn.state = State.SELECTED
        conn.selected = true
        conn.selectedMailboxData = {
            mailboxaname: mailboxaname,
        }
        // Update the session
        conn.session = resp.updatedSession

        // Start sending response
        /**
         * Response lines ----
         * untagged system flags
         * untagged Exists
         * untagged recent
         * untagged OK UNSEEN, 
         * untagged OK  PERMANENTFLAGS,
         * untagged OK  UIDNEXT,
         * untagged OK  UIDVALIDITY
         * untagged OK HIGHESTMODSEQ (if CONDSTORE)
         * Tagged OK [READ-WRITE/READ-ONLY] completed (final status response)
         */

        // Flags -  * FLAGS (\Flagged \Draft \Deleted \Seen)
        let flags: any[] = resp.flags.filter((f: string) => {
            return supportedSystemFlags.includes(f)
        }).map((f) => ({
            type: 'atom',
            value: f
        }))

        let flagResp: IMAPDataResponse = {
            command: 'FLAG',
            attributes: [flags]
        }
        conn.sendDataResponse(flagResp)

        // * OK [PERMANENTFLAGS (\Flagged \Draft \Deleted \Seen)] Flags permitted
        let permFlags: any[] = resp.permanentFlags || []
        permFlags = permFlags.filter((f: string) => {
            return supportedSystemFlags.includes(f)
        }).map((f) => ({
            type: 'atom',
            value: f
        }))

        let permFlagResp: IMAPDataResponse = {
            command: 'OK',
            attributes: [
                {
                    type: 'section',
                    section: [
                        {
                            type: 'atom',
                            value: 'PERMANENTFLAGS'
                        },
                        permFlags
                    ]
                },
                {
                    type: 'text',
                    value: 'Flags permitted'
                }
            ]
        }
        conn.sendDataResponse(permFlagResp)

        // * OK [UIDVALIDITY 123] UIDs valid
        // * OK [UIDNEXT 1] Predicted next UID
        if (resp.uidValidity) {
            let uidValidityResp: IMAPDataResponse = {
                command: 'OK',
                attributes: [
                    {
                        type: 'section',
                        section: [
                            {
                                type: 'atom',
                                value: 'UIDVALIDITY'
                            },
                            {
                                type: 'text',
                                value: String(resp.uidValidity)
                            }
                        ]
                    },
                    {
                        type: 'text',
                        value: 'UIDs valid'
                    }
                ]
            }
            conn.sendDataResponse(uidValidityResp)

            if (resp.uidNext != undefined) {
                let uidNextResp: IMAPDataResponse = {
                    command: 'OK',
                    attributes: [
                        {
                            type: 'section',
                            section: [
                                {
                                    type: 'atom',
                                    value: 'UIDNEXT'
                                },
                                {
                                    type: 'text',
                                    value: String(resp.uidNext)
                                }
                            ]
                        },
                        {
                            type: 'text',
                            value: 'Predicted next UID'
                        }
                    ]
                }
                conn.sendDataResponse(uidNextResp)
            }
        }

        // * 0 EXISTS
        let exixtsResp: IMAPDataResponse = {
            command: '',
            attributes: [
                {
                    type: 'text',
                    value: String(resp.exists)
                },
                {
                    type: 'atom',
                    value: 'EXISTS'
                }
            ]
        }
        conn.sendDataResponse(exixtsResp)

        // * 0 UNSEEN
        // Send this only if service has returned an unseen value
        if (resp.unseen != undefined) {
            let exixtsResp: IMAPDataResponse = {
                command: '',
                attributes: [
                    {
                        type: 'text',
                        value: String(resp.unseen)
                    },
                    {
                        type: 'atom',
                        value: 'UNSEEN'
                    }
                ]
            }
            conn.sendDataResponse(exixtsResp)
        }


        // * 0 RECENT
        let recent = resp.recent || 0
        let recentResp: IMAPDataResponse = {
            command: '',
            attributes: [
                {
                    type: 'text',
                    value: String(recent)
                },
                {
                    type: 'atom',
                    value: 'RECENT'
                }
            ]
        }
        conn.sendDataResponse(recentResp)

        // * OK [HIGHESTMODSEQ 123]
        let modseq = resp.HIGHESTMODSEQ || 0
        let modeseqResp: IMAPDataResponse = {
            command: 'OK',
            attributes: [
                {
                    type: 'section',
                    section: [
                        {
                            type: 'atom',
                            value: 'HIGHESTMODSEQ'
                        },
                        {
                            type: 'atom',
                            value: String(modseq)
                        }
                    ]
                },
                {
                    type: 'text',
                    value: 'Predicted next UID'
                }
            ]
        }
        conn.sendDataResponse(modeseqResp)
    }

    // Final status response 
    // A142 OK [READ-WRITE] SELECT completed
    // If the client is permitted to modify the mailbox, the server
    // should prefix the text of the final tagged OK response with the
    // READ-WRITE response code else READ-ONLY code
    let readOnly = resp.readOnly || false
    conn.selectedMailboxData["readOnly"] = readOnly
    let code = readOnly ? IMAPResponseCode['READ-ONLY'] : IMAPResponseCode['READ-WRITE']
    let statusInfo = conn.condstoreEnabled ? 'SELECT completed, CONDSTORE is now enabled' : 'SELECT completed'
    return {
        tag: cmd.tag,
        type: IMAPResponseStatus.OK,
        code: code,
        info: statusInfo
    }
}