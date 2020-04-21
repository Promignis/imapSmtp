import { Line, ParsedCommand } from './types'
import { commandList } from './commands'
import { IMAPConnection } from './imapConnection'
import { imapCommandParser } from './imapCommandParser'
import {
    IMAPResponseStatus,
    IMAPResponseCode,
    MAX_LITERAL_SIZE,
    MAX_MESSAGE_SIZE
} from './constants'
import { to } from './utils'


export class IMAPCommand {
    literals: Buffer[]
    payload: string
    isFirstLine: boolean
    command: string
    tag: string
    connection: IMAPConnection
    constructor(conn: IMAPConnection) {
        this.connection = conn
        this.command = ''
        this.tag = ''
        this.payload = ''
        this.literals = []
        this.isFirstLine = true
    }

    // Takes a line, which can be a command or an argument
    addLine(line: Line): Error | null {
        this.payload += line.value

        if (this.isFirstLine) {
            this.isFirstLine = false

            // Do basic parsing to get the tag and command

            // This regex will capture the tag and the command
            // We are treating each UID command variation as its own command,
            // eg. we need to capture UID STORE , not just UID 
            let match = /^([^\s]+)(?:\s+((?: UID )?[^\s]+)|$)/i.exec(line.value) || [];

            this.tag = match[1];
            this.command = (match[2] || '').trim().toUpperCase()

            if (!this.tag) {
                this.connection.sendStatusResponse({ type: IMAPResponseStatus.BAD, info: 'Invalid tag' })
                return new Error(`Invalid Tag`)
            }

            if (!this.command) {
                this.connection.sendStatusResponse({ type: IMAPResponseStatus.BAD, info: 'Invalid command' })
                return new Error(`Invalid command`)
            }

            if (!commandList.has(this.command)) {
                this.connection.sendStatusResponse({
                    tag: this.tag,
                    type: IMAPResponseStatus.BAD,
                    info: `Unknown command: ${this.command}`
                })
                return new Error(`Unknown command ${this.command}`)
            }

        }

        if (line.expectedLiteralSize) {

            // check for nan
            if (isNaN(line.expectedLiteralSize) || (!isNaN(line.expectedLiteralSize) && line.expectedLiteralSize < 0) || line.expectedLiteralSize > Number.MAX_SAFE_INTEGER) {
                this.connection.sendStatusResponse({
                    tag: this.tag,
                    type: IMAPResponseStatus.BAD,
                    info: 'Invalid Literal Size'
                })
                return new Error(`Invalid Literal Size`)
            }

            // check if command is append , then size < MAX_MESSAGE_SIZE , else size < MAX_LITERAL_SIZE 
            if (this.command == 'APPEND' && line.expectedLiteralSize > MAX_MESSAGE_SIZE) {
                // APPENDLIMIT response for too large messages
                this.connection.sendStatusResponse({
                    tag: this.tag,
                    type: IMAPResponseStatus.BAD,
                    code: IMAPResponseCode.TOOBIG,
                    info: 'Literal too large'
                })
                return new Error(`Literal too large`)
            }

            if (this.command != 'APPEND' && line.expectedLiteralSize > MAX_LITERAL_SIZE) {
                this.connection.sendStatusResponse({
                    tag: this.tag,
                    type: IMAPResponseStatus.BAD,
                    info: 'Literal too large'
                })
                return new Error(`Literal too large`)
            }

            this.payload += '\r\n'
        }

        this.connection._imapServer.logger.info(`${this.connection.id}: TAG:${this.tag} Line added - ${line.value}`)
        return null
    }

    addLiteral(literal: Buffer) {
        this.literals.push(literal)
    }

    async finished() {
        // Parse command and arguments
        let parsedVal: ParsedCommand
        try {
            parsedVal = imapCommandParser(this.payload, { literals: this.literals });
        } catch (err) {
            this.connection._imapServer.logger.error(`${this.connection.id}: Tag: ${this.tag} Error Parsing command ${this.command}: ${err.message}`, err)
            this.connection.sendStatusResponse({
                tag: this.tag,
                type: IMAPResponseStatus.NO,
                info: err.message
            })
            return
        }

        // Validate the state
        let cmdMeta = commandList.get(this.command)

        // If command state is not an empty array or it does not have the current connection state 
        // that means this command can not be executed in the current state 
        let validInAllState: boolean = cmdMeta!.state.length == 0
        if (!(validInAllState || (cmdMeta!.state.length != 0 && cmdMeta!.state.includes(this.connection.state)))) {
            this.connection.sendStatusResponse({
                tag: this.tag,
                type: IMAPResponseStatus.BAD,
                info: `Invalid state for ${this.command}`
            })
            return
        }


        // If no handler is present
        if (!cmdMeta!.handler) {
            this.connection.sendStatusResponse({
                tag: this.tag,
                type: IMAPResponseStatus.BAD,
                info: `Command ${this.command} not implemented`
            })
            return
        }

        let schema = cmdMeta!.schema

        // Argument Valdation
        // TODO: Add type validations too.
        if (schema != null && schema.length != 0) {
            let maxArgs = schema.length
            let minArgs = schema.filter(item => !item.optional).length

            // Deny commands with too many arguments
            if (parsedVal.attributes && parsedVal.attributes.length > maxArgs) {
                this.connection.sendStatusResponse({
                    tag: this.tag,
                    type: IMAPResponseStatus.BAD,
                    info: `Invalid Arguments too many`
                })

                return
            }

            if (((parsedVal.attributes && parsedVal.attributes.length) || 0) < minArgs) {
                this.connection.sendStatusResponse({
                    tag: this.tag,
                    type: IMAPResponseStatus.BAD,
                    info: `Invalid Arguments too few`
                })

                return
            }
        }

        let [err, res] = await to(cmdMeta!.handler!(this.connection, parsedVal))

        if (err != null) {
            // Log error
            this.connection._imapServer.logger.error(`${this.connection.id}: TAG:${this.tag} Error while handling command: ${err.message}`, err)
            // Send NO status response
            this.connection.sendStatusResponse({
                tag: this.tag,
                type: IMAPResponseStatus.NO,
                code: IMAPResponseCode.SERVERBUG,
                info: `Internal Server Error`
            })
        } else {
            // Send notification 
            if (!['FETCH', 'STORE', 'APPEND'].includes(this.command)) {
                this.connection.notify()
            }
            // If no error, send the final status response
            this.connection.sendStatusResponse(res!)
        }

    }

}