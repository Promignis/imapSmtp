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
export interface Command {
    tag?: string // If tag is undefined or "" then its an untagged command
    name: string
    arguments: { [key: string]: any }
}

// Response will be compiled into the final result that will be sent back to client
export interface Response {
    tag: string,
    name: string,
    attributes: any[]
}


