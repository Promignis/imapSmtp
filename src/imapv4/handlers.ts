import { CommandHandler, ParsedCommand, IMAPStatusResponse } from './types'
import { IMAPConnection } from './imapConnection'
import { IMAPResponseStatus, State, IMAPResponseCode } from './constants'
import { to } from './utils'

export const capablity: CommandHandler = async (conn: IMAPConnection, cmd: ParsedCommand): Promise<IMAPStatusResponse> => {
    conn.sendCapablity()
    return {
        tag: cmd.tag,
        type: IMAPResponseStatus.OK,
        info: `CAPABILITY completed`
    }
}

export const noop: CommandHandler = async (conn: IMAPConnection, cmd: ParsedCommand): Promise<IMAPStatusResponse> => {
    return {
        tag: cmd.tag,
        type: IMAPResponseStatus.OK,
        info: `NOOP completed`
    }
}

export const login: CommandHandler = async (conn: IMAPConnection, cmd: ParsedCommand): Promise<IMAPStatusResponse> => {
    let userName = (cmd.attributes[0].value || '').toString().trim()
    let password = (cmd.attributes[1].value || '').toString().trim()

    // That means no service is attached. In this case return a bad response
    if (conn._imapServer.handlerServices.onLogin == null) {
        return {
            tag: cmd.tag,
            type: IMAPResponseStatus.BAD,
            info: `Command ${cmd.command} not implemented`
        }
    }

    let [err, res] = await to(conn._imapServer.handlerServices.onLogin(userName, password))

    // Service failed
    if (err != null) {
        throw err
    }

    if (res!.success) {
        // Login sucess
        // Setup the session
        conn.setSession(res!.session)
        conn.setState(State.AUTH)

        // Send capablities on successfull login
        conn.sendCapablity()

        return {
            tag: cmd.tag,
            type: IMAPResponseStatus.OK,
            info: `Authenticated`
        }
    }

    // Login Failed
    return {
        tag: cmd.tag,
        type: IMAPResponseStatus.NO,
        code: IMAPResponseCode.AUTHENTICATIONFAILED,
        info: `Invalid Credentials`
    }
}