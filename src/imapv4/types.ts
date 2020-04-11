import { State } from './constants'
import { IMAPConnection } from './imapConnection'

export interface logMessage {
    sessionId: string,
    tag: string, // To Track tagged commands
    message: string
}

export interface IMAPServerLogger {
    info: (msg: logMessage | string) => void,
    warn: (msg: logMessage | string) => void,
    error: (msg: logMessage | string, err?: Error) => void,
    log: (msg: logMessage | string) => void,
    debug: (msg: logMessage | string) => void
}

export interface IMAPServerOpts {
    logger?: IMAPServerLogger, // Default logger is console
    // Max number of concurrent connections for a given user. if  0, will default to 1
    maxConnections?: number,
}

export interface CommandMeta {
    state: State[],
    schema: Array<{ name: string, type: string, optional: boolean }> | null
    handler?: CommandHandler
}

export interface Line {
    value: string
    expectedLiteralSize?: number
}

export interface ParserOpts {
    literals?: Buffer[]
}

// ParsedCommand.attributes property is typed as any, because it can be pretty dynamic
// It is of form 
/**
 * {
        tag: "TAG",
        command: "COMMAND",
        attributes: [
            {type: "SEQUENCE", value: "sequence-set"},
            {type: "ATOM", value: "atom", section:[section_elements], partial: [start, end]},
            {type: "STRING", value: "string"},
            {type: "LITERAL", value: "literal"},
            [list_elements]
        ]
    }
 */
// The types that each parsed value can be are defined in rfc3501
export interface ParsedCommand {
    command: string
    tag: string
    attributes: any // This can be dynamic
}

// Node object inside command parser
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
    | 'TOOBIG' //rfc4469
    | 'AUTHENTICATIONFAILED' //rfc5530
    | 'SERVERBUG' //rfc5530

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
    command: string,
    attributes: any // Can be dynamic (same as ParsedCommand.attributes)
}

export interface IMAPCommandContResponse {
    info?: string
}

// This imap session object will be passed to every handler that is run during the auth state
// Its the handlers responsibility to pass all the values in this sessionProps that it will be
// need to execute other commands.
// sessionProps is kept any so that the handler can have all the flexibility to define its structure
// userUUID is a mandetory field that should be any uuid that should be always unique for a particular user so that 
// the imap server can use this to track the number of concurrent sessions for this user
export type IMAPSession = {
    userUUID: string,
    sessionProps: any
}

export interface onLoginResp {
    success: boolean
    session: IMAPSession
}

export interface MailboxInfo {
    delimiter: string
    path: string
    specialUse?: string // refer rfc6154 for all valid values
    mailboxAttributes?: string[] // Refer rfc5258 setion 1
}

export interface onListOpts {
    reference: string
    mailboxname: string
    selectionParams: string[]
    returnParams: string[]
}

export interface IMAPHandlerServices {
    // It will take in username and password and return if  authentication was successfull or not
    // and if it was then it will return the session object
    onLogin: ((username: string, password: string) => Promise<onLoginResp>) | null,
    onFetch: null,
    onList: ((sess: IMAPSession, params: onListOpts) => Promise<MailboxInfo[]>) | null,
    onLsub: null,
    onSubscribe: null,
    onUnsubscribe: null,
    onCreate: null,
    onRename: null,
    onDelete: null,
    onOpen: null,
    onStatus: null,
    onAppend: null,
    onStore: null,
    onExpunge: null,
    onCopy: null,
    onSearch: null,
}

export type CommandHandler = (conn: IMAPConnection, cmd: ParsedCommand) => Promise<IMAPStatusResponse>