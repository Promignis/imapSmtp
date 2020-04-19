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
    | 'NONEXISTENT' // rfc5330
    | 'READ-WRITE' // rfc3501 section 6.3
    | 'READ-ONLY' // rfc3501 section 6.3

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
    command?: string,
    attributes: any // Can be dynamic (same as ParsedCommand.attributes)
}

export interface IMAPCommandContResponse {
    info?: string
}

export type MessageUpdateTypes = 'EXISTS' // When new message added
    | 'EXPUNGE' // When message deleted
    | 'FETCH' // When an existing method modified

export interface UpdatedMessageNotification {
    type: MessageUpdateTypes,
    uid: number,
    modeseq: number,
    mailboxUUID: string
}

// This imap session object will be passed to every handler that is run during the auth state
// Its the handlers responsibility to pass all the values in this sessionProps that it will be
// need to execute other commands.
// sessionProps is kept any so that the handler can have all the flexibility to define its structure
// userUUID is a mandetory field that should be any uuid that should be always unique for a particular user so that 
// the imap server can use this to track the number of concurrent sessions for this user
// mailboxUUID should be any uuid that should be always unique for a particular selected mailbox
// this will be used my the imap server to listen to notifications and update it's selecte state
export type IMAPSession = {
    userUUID: string,
    mailboxUUID: string,
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
    mailboxname: string
    selectionParams: string[]
    returnParams: string[]
}

// Refer rfc3501 section 6.3.1 
export interface onSelectResp {
    // This should be an ordered list of uids of all messages in the mailbox
    // refer: rfc3501 2.3.1.2
    messageSequence: number[]
    flags: string[],
    // The number of messages in the mailbox
    exists: number,
    // The number of messages in the mailbox with \Recent flag
    recent?: number,
    // The message sequence number of the first unseen message in the mailbox, 
    // If this is missing, the client can not make any assumptions about the first unseen message in the mailbox,
    // and needs to issue a SEARCH command if it wants to find it.
    unseen?: number,
    /**
     * A list of message flags that the client can change permanently. 
     * If this is missing, the client should 
     * assume that all flags can be changed permanently.
     */
    permanentFlags?: string[],
    // The next unique identifier value (refer rfc3501)
    // If this is missing, the client can not make any assumptions about the next unique identifier value.
    uidNext?: number,
    // The unique identifier validity value (refer rfc3501)
    // If this is missing, the server does not support unique identifiers
    uidValidity?: number,
    // If not passed value is set to 0 by default 
    // 0 value means the server doesn't support the persistent
    // storage of mod-sequences for the mailbox 
    // refer rfc4551 section 3.6
    HIGHESTMODSEQ?: number,
    // If read only then no change can be made to the mailbox, like running STORE command etc.
    // If not passed , it takes the default value false
    readOnly?: boolean,
    // If the service wants it can update the session object to persist mailbox data
    // current session data will be updated with this value
    // the updated value will be passed to it later when commands like SEARCH , FETCH etc.. are called
    updatedSession: IMAPSession
}

// eg. for a messageData param BODY[HEADER.FIELDS (DATE FROM)]
// query will look like 
/**
 * {
 *   query: 'BODY[HEADER.FIELDS (DATE FROM)]',
 *  item: 'BODY',
 *  orignal: [ { type: 'ATOM', value: 'BODY', section: []... } ] 
 *  path: '',
 *  type: 'HEADER.FIELDS',
 *  headers: [ 'date', 'from' ],
 *  isLiteral: true
 * }
 */
export interface FetchQuery {
    queryString: string,
    original: any, // Orignal param object
    item?: string, // One of messageDataItems keys
    path?: string, // Mime tree path , eg. '1.2.3.TEXT' , refer rfc3051 section 6.4.5
    type?: string, // if BODY, then param type will be added here , eg. HEADER.FIELDS
    headers?: string[], // if type has a header option , then this will have those headers
    isLiteral: boolean // The response for this query will be 
    partial?: BodyPartial // If BODY param has a partial option , it will be added here
}

export interface BodyPartial {
    startFrom: number,
    maxLength: number
}

export interface onFetchOptions {
    queries: FetchQuery[],
    markAsSeen: boolean, // Based on server selected state, it tells weather to mark messages as seen or not
    messageUids: number[], // List of message uids 
    changedSince?: number
}

export interface onFetchResponse {

}

export interface IMAPHandlerServices {
    // It will take in username and password and return if  authentication was successfull or not
    // and if it was then it will return the session object
    onLogin: ((username: string, password: string) => Promise<onLoginResp>) | null,
    onFetch: ((sess: IMAPSession, options: onFetchOptions) => Promise<AsyncGenerator<any | null, void, unknown>>) | null,
    onList: ((sess: IMAPSession, params: onListOpts) => Promise<MailboxInfo[]>) | null,
    onLsub: null,
    onSubscribe: null,
    onUnsubscribe: null,
    onCreate: null,
    onRename: null,
    onDelete: null,
    onSelect: ((sess: IMAPSession, mailboxname: string) => Promise<onSelectResp | null>) | null,
    onStatus: null,
    onAppend: null,
    onStore: null,
    onExpunge: null,
    onCopy: null,
    onSearch: null,
}

export type CommandHandler = (conn: IMAPConnection, cmd: ParsedCommand) => Promise<IMAPStatusResponse>

export interface SelectedMailboxData {
    readOnly: boolean,
    mailboxaname: string,
    messageSequence: number[],
    highestModSeq: number
}