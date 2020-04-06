import { IMAPConnection } from './imapConnection'

export interface IMAPServerLogger {
    info: Function,
    warn: Function,
    error: Function,
    log: Function,
    debug: Function
}

export interface logMessage {
    sessionId: string,
    tag: string, // To Track tagged commands
    message: string
}

export interface IMAPServerOpts {
    logger?: IMAPServerLogger, // Default logger is console
    // Max number of connections for a given user. if  0, will default to 1
    maxConnections?: number,
}

export enum State {
    'ANY', 'AUTH', 'NOTAUTH', 'SELECTED'
}

//IMAP command
// export interface ParsedCommand {
//     tag?: string // If tag is undefined or "" then its an untagged command
//     name: string
//     arguments: { [key: string]: any }
// }

// Response will be compiled into the final result that will be sent back to client
// export interface Response {
//     tag: string,
//     name: string,
//     attributes: any[]
// }

// export interface CommandHandler {
//     (conn: IMAPConnection, parsedCommand: ParsedCommand): void
// }

export interface CommandMeta {
    state: State[],
    schema: Array<{ name: string, type: string, optional: boolean }> | null
}

export interface Line {
    value: string
    expectedLiteralSize?: number
}

export interface ParserOpts {
    literals?: Buffer[]
}

export interface ParserOutput {
    command: string
    tag: string
    attributes: any // This can be dynamic
}

export interface Node {
    childNodes: Node[]
    type: string
    value: any,
    closed: boolean,
    parentNode?: Node,
    startPos?: number,
    endPos?: number,
    literalPlus?: boolean
    started?: boolean
    chBuffer?: Buffer
    chPos?: number
    literalLength?: any
}

