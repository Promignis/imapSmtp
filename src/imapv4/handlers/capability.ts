import {
    CommandHandler,
    ParsedCommand,
    IMAPStatusResponse
} from '../types'
import { IMAPConnection } from '../imapConnection'
import { IMAPResponseStatus } from '../constants'

export const capablity: CommandHandler = async (conn: IMAPConnection, cmd: ParsedCommand): Promise<IMAPStatusResponse> => {
    conn.sendCapablity()
    return {
        tag: cmd.tag,
        type: IMAPResponseStatus.OK,
        info: `CAPABILITY completed`
    }
}