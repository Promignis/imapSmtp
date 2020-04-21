import {
    CommandHandler,
    ParsedCommand,
    IMAPStatusResponse
} from '../types'
import { State } from '../constants'
import { IMAPConnection } from '../imapConnection'
import { IMAPResponseStatus } from '../constants'

export const logout: CommandHandler = async (conn: IMAPConnection, cmd: ParsedCommand): Promise<IMAPStatusResponse> => {
    // Remove connection from list of authenticated connections
    conn._imapServer.removeAuthenticatedConnection(conn.session!.userUUID, conn.id)
    // remove session
    conn.removeSession()
    // unselect
    conn.resetSelectedState()
    // Set connection state to logout
    conn.setState(State.LOGOUT)

    // Send Bye response
    conn.sendStatusResponse({
        tag: "*",
        type: IMAPResponseStatus.BYE,
        info: `IMAP4rev1 Server logging out`
    })
    //* BYE IMAP4rev1 Server logging out

    return {
        tag: cmd.tag,
        type: IMAPResponseStatus.OK,
        info: `${cmd.command} Completed`
    }
}