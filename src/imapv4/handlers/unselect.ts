import {
    CommandHandler,
    ParsedCommand,
    IMAPStatusResponse,
} from '../types'
import { IMAPResponseStatus, State } from '../constants'
import { IMAPConnection } from '../imapConnection'

export const unselect: CommandHandler = async (conn: IMAPConnection, cmd: ParsedCommand): Promise<IMAPStatusResponse> => {

    // reset connection state to auth
    conn.state = State.AUTH
    // Reset selected state
    conn.selected = false
    conn.selectedMailboxData = null

    return {
        tag: cmd.tag,
        type: IMAPResponseStatus.OK,
        info: `${cmd.command} completed`
    }
}