import {
    CommandHandler,
    ParsedCommand,
    IMAPStatusResponse
} from '../types'
import { IMAPConnection } from '../imapConnection'
import { IMAPResponseStatus } from '../constants'

export const noop: CommandHandler = async (conn: IMAPConnection, cmd: ParsedCommand): Promise<IMAPStatusResponse> => {
    return {
        tag: cmd.tag,
        type: IMAPResponseStatus.OK,
        info: `NOOP completed`
    }
}