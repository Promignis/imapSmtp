import {
    CommandHandler,
    ParsedCommand,
    IMAPStatusResponse,
    IMAPDataResponse
} from '../types'
import { IMAPConnection } from '../imapConnection'
import { IMAPResponseStatus } from '../constants'

export const id: CommandHandler = async (conn: IMAPConnection, cmd: ParsedCommand): Promise<IMAPStatusResponse> => {
    const allowedKeys = ['name', 'version', 'os', 'os-version', 'vendor', 'support-url', 'address', 'date', 'command', 'arguments', 'environment']

    // Add some data about the server
    let serverInfo: any = {
        name: 'Dsolitaire',
        version: '1.0'
    }

    let clientInfo: any = {}

    // Collect ID information sent by the client.
    // ids are sent as a sequence of keys and values
    // eg. a023 ID ("name" "sodr" "version" "19.34")
    let key: any = false
    if (Array.isArray(cmd.attributes[0])) {
        cmd.attributes[0].forEach((val: any) => {
            if (key === false) {
                key = (val.value || '')
                    .toString()
                    .toLowerCase()
                    .trim()
            } else {
                if (allowedKeys.indexOf(key) >= 0) {
                    clientInfo[key] = (val.value || '').toString()
                }
                key = false
            }
        })
    }

    // for now just logging it , it could be persisited if required
    conn._imapServer.logger.info(`${conn.id}: TAG:${cmd.tag} Connected client info ${JSON.stringify(clientInfo)}`)

    // Send response
    let serverIdList: any[] = []
    Object.keys(serverInfo).forEach((key: string) => {
        serverIdList.push({
            type: 'string',
            value: (key || '').toString()
        });
        serverIdList.push({
            type: 'string',
            value: (serverInfo[key] || '').toString()
        });
    });

    let idResp: IMAPDataResponse = {
        command: cmd.command,
        attributes: [serverIdList]
    }

    conn.sendDataResponse(idResp)

    return {
        tag: cmd.tag,
        type: IMAPResponseStatus.OK,
        info: `${cmd.command} Completed`
    }

}