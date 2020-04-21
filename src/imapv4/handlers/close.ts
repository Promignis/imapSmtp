import {
    CommandHandler,
    ParsedCommand,
    IMAPStatusResponse
} from '../types'
import { IMAPConnection } from '../imapConnection'
import { IMAPResponseStatus } from '../constants'

export const close: CommandHandler = async (conn: IMAPConnection, cmd: ParsedCommand): Promise<IMAPStatusResponse> => {
    if (conn.selectedMailboxData!.readOnly) {
        // If selected mailbox is read only, then close command is same as unselect command
        conn.resetSelectedState()

    } else {
        // if selected mailbox is read-write then close command should expunge 
        // all the messages which were flagged \Expunge
        if (conn._imapServer.handlerServices.onExpunge == null) {
            return {
                tag: cmd.tag,
                type: IMAPResponseStatus.NO,
                info: `EXPUNGE not implemented`
            }
        } else {
            // this will be added in future version
            // for now selected mailbox is always in read only mode 
        }
    }

    return {
        tag: cmd.tag,
        type: IMAPResponseStatus.OK,
        info: `${cmd.command} completed`
    }
}