import { State } from './constants'


export interface logMessage {
    sessionId: string,
    tag: string, // To Track tagged commands
    message: string
}

export interface IMAPServerLogger {
    info: (message: logMessage | string) => void,
    warn: (message: logMessage | string) => void,
    error: (message: logMessage | string, err?: Error) => void,
    log: (message: logMessage | string) => void,
    debug: (message: logMessage | string) => void
}

export interface IMAPServerOpts {
    logger?: IMAPServerLogger, // Default logger is console
    // Max number of connections for a given user. if  0, will default to 1
    maxConnections?: number,
}

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

export type RespStatus = 'OK' | 'BAD' | 'NO' | 'PREAUTH' | 'BYE'

// Refer: www.iana.org/assignments/imap-response-codes/imap-response-codes.xhtml for the complete list
// For now taking only the codes mentioned in rfc3501 section 7.1
export type RespCode = 'ALERT'
    | 'BADCHARSET'
    | 'CAPABILITY'
    | 'PARSE'
    | 'PERMANENTFLAGS'
    | 'READ-ONLY'
    | 'READ-WRITE'
    | 'TRYCREATE'
    | 'UIDNEXT'
    | 'UIDVALIDITY'
    | 'UNSEEN'

//Server responses are in three forms: status responses, server data, and command continuation request
export interface IMAPStatusResponse {
    tag?: string
    // The status type.
    type: RespStatus
    // The status code.
    code?: RespCode
    // Arguments provided with the status code.
    args?: string[]
    // The status info.
    info?: string
}

export interface IMAPDataResponse {
    tag?: string
    fields: any[]
}

export interface IMAPCommandContResponse {
    info?: string
}
