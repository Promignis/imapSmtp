import {
    CommandHandler,
    ParsedCommand,
    IMAPStatusResponse,
} from '../types'
import { IMAPResponseStatus, State } from '../constants'
import { IMAPConnection } from '../imapConnection'

export const unselect: CommandHandler = async (conn: IMAPConnection, cmd: ParsedCommand): Promise<IMAPStatusResponse> => {

    conn.resetSelectedState()

    return {
        tag: cmd.tag,
        type: IMAPResponseStatus.OK,
        info: `${cmd.command} completed`
    }
}