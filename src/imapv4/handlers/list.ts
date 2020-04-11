import {
    CommandHandler,
    ParsedCommand,
    IMAPStatusResponse,
    onListOpts,
    MailboxInfo,
    IMAPDataResponse
} from '../types'
import { IMAPConnection } from '../imapConnection'
import { IMAPResponseStatus } from '../constants'
import { to } from '../utils'

export const list: CommandHandler = async (conn: IMAPConnection, cmd: ParsedCommand): Promise<IMAPStatusResponse> => {
    // Possible command formats
    /**
     * tag LIST "" ""
     * tag LIST "" "*"
     * tag LIST "ref" "name"
     * tag LIST (SPECIAL-USE) "ref" "name" RETURN (SPECIAL-USE)
     */

    // extended list command has many selection options, refer rfc5258 section 3
    // But we are only supporting one option, ie. SPECCIAL-USE  refer rfc6154

    // For a list of all supported attributes refer rfc6154 secion 2
    // For now we only support the following attributes 
    const supportedSpecialUseAttributes = [
        '\\Drafts',
        '\\Sent',
        '\\Trash',
        '\\Junk'
    ]

    let selection: string[] = []
    let reference: string = ''
    let mailboxName: string = ''
    let returnOptions: string[] = []

    let arrPos = 0

    let commandName = (cmd.command || '').toString().toUpperCase()

    // Start extracting the attributes
    // check if selection attribute present
    if (Array.isArray(cmd.attributes[0])) {
        if (cmd.attributes[0].length) {
            if (
                cmd.attributes[0].length === 1 &&
                cmd.attributes[0][0].type === 'ATOM' &&
                cmd.attributes[0][0].value.toUpperCase() === 'SPECIAL-USE'
            ) {
                selection.push(cmd.attributes[0][0].value.toUpperCase())
            } else {
                return {
                    tag: cmd.tag,
                    type: IMAPResponseStatus.BAD,
                    info: `Invalid arguments for ${commandName}`
                }
            }
        }
        arrPos++
    }

    reference = Buffer.from((cmd.attributes[arrPos] && cmd.attributes[arrPos].value) || '', 'binary').toString()
    arrPos++

    // As per rfc5258 mailbox name can be an array of patterns
    // because of partial rfc5258 support we ignore patterns
    // for ex. BBB LIST "" ("INBOX" "Drafts" "Sent/%") , pattern ("INBOX" "Drafts" "Sent/%") will be ignored
    mailboxName = Buffer.from((cmd.attributes[arrPos] && cmd.attributes[arrPos].value) || '', 'binary').toString()
    arrPos++;

    // Check for RETURN (SPECIAL-USE)
    if (arrPos < cmd.attributes.length) {
        if (cmd.attributes[arrPos].type === 'ATOM' && cmd.attributes[arrPos].value.toUpperCase() === 'RETURN') {
            arrPos++
            if (
                Array.isArray(cmd.attributes[arrPos]) &&
                cmd.attributes[arrPos].length === 1 &&
                cmd.attributes[arrPos][0].type === 'ATOM' &&
                cmd.attributes[arrPos][0].value.toUpperCase() === 'SPECIAL-USE'
            ) {
                returnOptions.push(cmd.attributes[arrPos][0].value.toUpperCase())
            } else {
                return {
                    tag: cmd.tag,
                    type: IMAPResponseStatus.BAD,
                    info: `Invalid arguments for ${commandName}`
                }
            }
        } else {
            return {
                tag: cmd.tag,
                type: IMAPResponseStatus.BAD,
                info: `Invalid arguments for ${commandName}`
            }
        }
    }

    // empty mailbox name arguments has a special meaning
    // ie. treat an empty ("" string) mailbox name argument as a special request to return the
    // hierarchy delimiter and the root name of the name given in the reference parameter.
    // But if list command extensions are passed , ie RETURN then its not a special request
    if (!mailboxName && returnOptions.length == 0) {

        // Send the data response here
        conn.sendDataResponse({
            command: commandName,
            attributes: [
                [
                    {
                        type: 'atom',
                        value: '\\Noselect'
                    }
                ],
                '/',
                '/'
            ]
        })

        return {
            tag: cmd.tag,
            type: IMAPResponseStatus.OK,
            info: `${commandName} Completed`
        }
    }

    // That means no service is attached. In this case return a bad response
    if (conn._imapServer.handlerServices.onList == null) {
        return {
            tag: cmd.tag,
            type: IMAPResponseStatus.BAD,
            info: `Command ${cmd.command} not implemented`
        }
    }

    // Call the service 

    let listParams: onListOpts = {
        reference: reference,
        mailboxname: mailboxName,
        selectionParams: selection,
        returnParams: returnOptions
    }


    let [err, mailboxes] = await to(conn._imapServer.handlerServices.onList(conn.session!, listParams))

    if (err != null) {
        throw err
    }

    // Process result
    mailboxes!.forEach((mailbox: MailboxInfo) => {
        let listResponse: IMAPDataResponse = {
            command: commandName,
            attributes: []
        }

        // Check if the special use attributes are in the list of supported values
        if (mailbox.specialUse && supportedSpecialUseAttributes.includes(mailbox.specialUse)) {
            // If the value is correct , then add it to the mailboxAttributes array
            // If mailboxAttributes property was not provided by the service then create it
            if (!mailbox.mailboxAttributes) {
                mailbox['mailboxAttributes'] = [mailbox.specialUse]
            } else {
                mailbox.mailboxAttributes.push(mailbox.specialUse)
            }
        }

        if (mailbox.mailboxAttributes && mailbox.mailboxAttributes.length != 0) {
            listResponse.attributes.push(
                mailbox.mailboxAttributes.map((att: string) => {
                    return {
                        type: 'atom',
                        value: att
                    }
                })
            )
        }

        listResponse.attributes.push("/")
        listResponse.attributes.push(mailbox.path)

        // Send
        conn.sendDataResponse(listResponse)
    })

    // List command successfully completed
    return {
        tag: cmd.tag,
        type: IMAPResponseStatus.OK,
        info: `${commandName} completed`
    }
}