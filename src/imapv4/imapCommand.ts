import { Line, ParserOutput } from './types'
import { commandList } from './commands'
import { IMAPConnection } from './imapConnection'
import { imapCommandParser } from './imapCommandParser'
import { IMAPResponseStatus, IMAPResponseCode } from './constants'
// TODO: Take these from config
const MAX_MESSAGE_SIZE = 1 * 1024 * 1024 // This is needed to limit message size during APPEND. For now its just 1 mb
const MAX_LITERAL_SIZE = 2 * 1024 // This is the max literal size for commands other than APPEND
// const MAX_BAD_COMMANDS = 50;

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
            this.command = (match[2] || '').trim().toUpperCase();

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
                // TOOBIG: https://tools.ietf.org/html/rfc4469#section-4.2
                this.connection.sendStatusResponse({
                    tag: this.tag,
                    type: IMAPResponseStatus.NO,
                    code: IMAPResponseCode.TOOBIG,
                    info: 'Literal too large'
                })
                return new Error(`Literal too large`)
            }

            if (this.command != 'APPEND' && line.expectedLiteralSize > MAX_LITERAL_SIZE) {
                this.connection.sendStatusResponse({
                    tag: this.tag,
                    type: IMAPResponseStatus.NO,
                    code: IMAPResponseCode.TOOBIG,
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

    finished() {
        // Parse command and arguments
        let parsedVal: ParserOutput
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

        console.log(parsedVal)
        // For now all commands are handeled with an error response
        setTimeout(() => {
            this.connection.sendStatusResponse({
                tag: this.tag,
                type: IMAPResponseStatus.NO,
                info: 'Command not implemented'
            })
        }, 3000)
    }

}