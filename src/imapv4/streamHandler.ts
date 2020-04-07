import { Writable, PassThrough } from 'stream'
import { IMAPCommand } from './imapCommand'
import { IMAPConnection } from './imapConnection'
import { Line } from './types'
import { promisify } from 'util'


// Refer rfc7162 section 4
// A client should limit the  length of the command lines it generates to approximately 8192 octets
// If more than that passed , server should return and error and stop processing that line
const MAX_LINE_LENGTH = 8192

// This reads the incoming data on the tcp socket and 
// correctly extracts the command lines and literals
export class StreamHandler extends Writable {
    existingCommand: IMAPCommand | null
    remaining: string
    expectedLiterals: number
    connection: IMAPConnection

    literalWriter: PassThrough | null
    literalChunks: Buffer[]
    literalChunkslen: number
    constructor(conn: IMAPConnection) {
        super()
        this.connection = conn
        this.existingCommand = null
        this.remaining = ''
        this.expectedLiterals = 0
        this.literalWriter = null
        this.literalChunks = []
        this.literalChunkslen = 0
        Writable.call(this)
    }


    _write(chunk: any, encoding: string, done: (error?: Error | null) => void): void {
        if (!chunk || !chunk.length) {
            return done();
        }
        let data = this.remaining + chunk.toString('binary')

        // Reset remaining
        this.remaining = ''
        this.read(data, done)
    }

    read = async (data: string, done: (error?: Error | null) => void) => {

        // Every imap command ends with \r\n. This regex checks if current data has crlf
        let CommandEndRegex = /\r?\n/g
        // Checks if the given command has any literal arguments. Commands with literal arguments
        // end with {<int>}\r\n where the int value is the size of the incoming literal
        // This regex checks if current data has crlf
        let LiteralRegex = /\{(\d+)\}$/
        let match: RegExpExecArray | null = null
        let line: string = ''

        let command: IMAPCommand

        if (data.length > MAX_LINE_LENGTH) {
            let maxLineLengthError = new Error(`Max line length exceeded: ${data.length}`)
            let tag = this.existingCommand ? this.existingCommand.tag : '*'
            // Log error
            this.connection._imapServer.logger.error(`${this.connection.id}: TAG:${tag} ${maxLineLengthError.message}`, maxLineLengthError)

            // Send error response
            // If existing command then send tagged response or else send untagged response
            this.connection.send(`${tag} BAD Max line length exceeded`)

            // Reset state
            this.existingCommand = null
            this.expectedLiterals = 0
            this.literalWriter = null
            this.literalChunks = []
            this.literalChunkslen = 0

            // continue reading
            return done()
        }

        // If an existing command is still going on
        if (this.expectedLiterals > 0) {
            if (data.length > this.expectedLiterals) {
                // All bytes recieved
                promisify(this.literalWriter!.end)

                let _ = await this.literalWriter!.end(Buffer.from(data.substr(0, this.expectedLiterals), 'binary'));
                let remainingData = data.substr(this.expectedLiterals)
                // reset state
                this.expectedLiterals = 0
                this.literalWriter = null
                this.literalChunks = []
                this.literalChunkslen = 0

                // Handle the remaining data
                this.read(remainingData, done)
                return
            } else {
                // keep reading
                this.expectedLiterals -= data.length

                this.literalWriter!.write(Buffer.from(data, 'binary'), done)
                return
            }
        }

        // Check if \r\n is present in the given data
        match = CommandEndRegex.exec(data)
        // Returns null if nothing is found
        if (match) {
            line = data.substr(0, match.index)
        } else {
            console.log('here')
            this.remaining = data
            // Continue reading more
            return done()
        }


        // Check if literal present
        match = LiteralRegex.exec(line)

        if (!this.existingCommand) {
            command = new IMAPCommand(this.connection)
            this.existingCommand = command
        } else {
            command = this.existingCommand
        }


        if (match) {
            this.expectedLiterals = Number(match[1])
            let commandLine: Line = {
                value: line,
                expectedLiteralSize: this.expectedLiterals
            }

            let err = command.addLine(commandLine)

            if (err != null) {
                // error was not null
                this.connection._imapServer.logger.error(`${this.connection.id}: TAG:${command.tag} ${err.message}`, err)
                // Reset the state
                this.existingCommand = null
                this.expectedLiterals = 0
                this.literalWriter = null
                this.literalChunks = []
                this.literalChunkslen = 0

            } else {
                // No error happend
                // Setup literalWriter
                this.literalWriter = new PassThrough()
                // Send Command Continuation Request 
                this.connection.send('+ Go ahead')

                // Setup event listeners
                this.literalWriter.on('data', (chunk: Buffer) => {
                    //  write the upcoming literal chunks into a buffer
                    // TODO: See if we can process the chunks as a stream instead of buffering it into memory
                    // For now, allowed literal size is pretty less, so memory consumption should not be an issue
                    // When support for APPEND command is added, where literal size can be few mb (for large messages), 
                    // we can write it into a temp file on the disk
                    // and then create a readable stream from that file for further processing instead of buffering 
                    this.literalChunks.push(chunk);
                    this.literalChunkslen += chunk.length;
                });

                this.literalWriter.on('end', () => {
                    let finalLiteral = Buffer.concat(this.literalChunks, this.literalChunkslen)
                    this.existingCommand!.addLiteral(finalLiteral)
                });
            }
            // Continue reading the next chunks
            return done()

        } else {
            // Command has no literals and command extraction is done 
            // Create a new command object and let it handle the request
            let commandLine: Line = { value: line }
            let err = command.addLine(commandLine)
            if (err == null) {
                // If no error during adding the line then finish the command
                command.finished()
            }
            // Reset to handle next command
            this.existingCommand = null
            // Continue reading the next chunks
            return done()
        }

    }
}