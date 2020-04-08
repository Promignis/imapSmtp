/// <reference types="node" />
import { EventEmitter } from 'events';
import { Server, Socket } from 'net';
import { Writable, PassThrough } from 'stream';
import { TLSSocket, SecureContext } from 'tls';

export declare function to<T, U = Error>(promise: Promise<T>, errorExt?: object): Promise<[U | null, T | undefined]>;
export declare function generateRandomString(length: number): string;

export interface logMessage {
    sessionId: string;
    tag: string;
    message: string;
}
export interface IMAPServerLogger {
    info: (message: logMessage | string) => void;
    warn: (message: logMessage | string) => void;
    error: (message: logMessage | string, err?: Error) => void;
    log: (message: logMessage | string) => void;
    debug: (message: logMessage | string) => void;
}
export interface IMAPServerOpts {
    logger?: IMAPServerLogger;
    maxConnections?: number;
}
export interface CommandMeta {
    state: State[];
    schema: Array<{
        name: string;
        type: string;
        optional: boolean;
    }> | null;
    handler?: CommandHandler;
}
export interface Line {
    value: string;
    expectedLiteralSize?: number;
}
export interface ParserOpts {
    literals?: Buffer[];
}
export interface ParsedCommand {
    command: string;
    tag: string;
    attributes: any;
}
export interface Node {
    childNodes: Node[];
    type: string;
    value: any;
    closed: boolean;
    parentNode?: Node;
    startPos?: number;
    endPos?: number;
    literalPlus?: boolean;
    started?: boolean;
    chBuffer?: Buffer;
    chPos?: number;
    literalLength?: any;
}
export declare type RespStatus = 'OK' | 'BAD' | 'NO' | 'PREAUTH' | 'BYE';
export declare type RespCode = 'ALERT' | 'BADCHARSET' | 'CAPABILITY' | 'PARSE' | 'PERMANENTFLAGS' | 'READ-ONLY' | 'READ-WRITE' | 'TRYCREATE' | 'UIDNEXT' | 'UIDVALIDITY' | 'UNSEEN' | 'TOOBIG' | 'AUTHENTICATIONFAILED' | 'SERVERBUG';
export interface IMAPStatusResponse {
    tag?: string;
    type: RespStatus;
    code?: RespCode;
    args?: string[];
    info?: string;
}
export interface IMAPDataResponse {
    tag?: string;
    fields: any[];
}
export interface IMAPCommandContResponse {
    info?: string;
}
export declare type IMAPSession = {
    userUUID: string;
    sessionProps: any;
};
export interface onLoginResp {
    success: boolean;
    session: IMAPSession;
}
export interface IMAPHandlerServices {
    onLogin: ((username: string, password: string) => Promise<onLoginResp>) | null;
    onFetch: null;
    onList: null;
    onLsub: null;
    onSubscribe: null;
    onUnsubscribe: null;
    onCreate: null;
    onRename: null;
    onDelete: null;
    onOpen: null;
    onStatus: null;
    onAppend: null;
    onStore: null;
    onExpunge: null;
    onCopy: null;
    onSearch: null;
}
export declare type CommandHandler = (conn: IMAPConnection, cmd: ParsedCommand) => Promise<IMAPStatusResponse>;

export declare class StreamHandler extends Writable {
    existingCommand: IMAPCommand | null;
    remaining: string;
    expectedLiterals: number;
    connection: IMAPConnection;
    literalWriter: PassThrough | null;
    literalChunks: Buffer[];
    literalChunkslen: number;
    constructor(conn: IMAPConnection);
    _write(chunk: any, encoding: string, done: (error?: Error | null) => void): void;
    read: (data: string, done: (error?: Error) => void) => Promise<void>;
}

export declare class IMAPServer extends EventEmitter {
    connections: Map<string, IMAPConnection>;
    logger: IMAPServerLogger;
    maxConnections: number;
    server: Server;
    secureContexts: Map<string, SecureContext>;
    handlerServices: IMAPHandlerServices;
    constructor(options: IMAPServerOpts);
    listen(port: number, host: string): void;
    /**
     * Can have different secureContext object for different domains
     * "*" represents a wildcard
     */
    _updateCtx(opts?: any): void;
    _createServer(): Server;
    _upgrade(socket: Socket, cb: (err: Error | null, tlsSocket: TLSSocket | null) => void): void;
    _onError(err: Error): void;
    _onClose(): void;
    _onListening(): void;
    _setListeners(): void;
    _connectSecure(socket: TLSSocket): void;
    _newConnectionId(): string;
}

export declare const imapFormalSyntax: {
    CHAR: () => string;
    CHAR8: () => string;
    SP: () => string;
    CTL: () => string;
    DQUOTE: () => string;
    ALPHA: () => string;
    DIGIT: () => string;
    'ATOM-CHAR': () => string;
    'ASTRING-CHAR': () => any;
    'TEXT-CHAR': () => string;
    'atom-specials': () => string;
    'list-wildcards': () => string;
    'quoted-specials': () => string;
    'resp-specials': () => string;
    tag: () => string;
    command: () => string;
    verify: (str: string, allowedChars: string) => number;
};

export declare const IMAP_INT_ERRORS: {
    COMMAND_PARSE_ERROR: string;
    CONNECTION_ERROR: string;
    IMAP_SERVER_ERROR: string;
};
export declare const IMAP_STATUS: {
    OK: string;
    BAD: string;
    NO: string;
};
export declare class ImapServerError extends Error {
    status: string;
    message: string;
    name: string;
    meta: Object;
    constructor(status: string, message: string, name: string, meta?: object);
}

export declare class IMAPConnection extends EventEmitter {
    _socket: TLSSocket;
    _imapServer: IMAPServer;
    _currentCommand: boolean;
    _closed: boolean;
    _closing: boolean;
    _closingTimeout: any;
    id: string;
    remoteAddress: string;
    state: State;
    selected: boolean;
    selectedMailboxData: any;
    session: IMAPSession | null;
    clientHostName: string;
    streamHandler: StreamHandler;
    constructor(soc: TLSSocket, server: IMAPServer, id: string);
    init(): void;
    setSelectedMailbox(): void;
    setSession(ses: IMAPSession): void;
    setState(state: State): void;
    _startSession(): void;
    _onError: (err: Error) => void;
    _onTimeout: () => void;
    _onClose: () => void;
    _onEnd: () => void;
    close(forced: false): void;
    getCapabilities(): string[];
    sendStatusResponse(resp: IMAPStatusResponse, cb?: () => void): void;
    sendDataResponse(resp: IMAPDataResponse, cb?: () => void): void;
    sendCommandContResponse(resp: IMAPCommandContResponse, cb?: () => void): void;
    send(payload: string, writeDone?: () => void): void;
}

export declare const imapCommandParser: (command: string, options: ParserOpts) => ParsedCommand;

export declare class IMAPCommand {
    literals: Buffer[];
    payload: string;
    isFirstLine: boolean;
    command: string;
    tag: string;
    connection: IMAPConnection;
    constructor(conn: IMAPConnection);
    addLine(line: Line): Error | null;
    addLiteral(literal: Buffer): void;
    finished(): Promise<void>;
}

export declare const login: CommandHandler;

export declare const MAX_MESSAGE_SIZE: number;
export declare const MAX_LITERAL_SIZE: number;
export declare enum State {
    'ANY' = 0,
    'AUTH' = 1,
    'NOTAUTH' = 2,
    'SELECTED' = 3
}
export declare const IMAPResponseStatus: {
    [key: string]: RespStatus;
};
export declare const IMAPResponseCode: {
    [key: string]: RespCode;
};

export declare const commandList: Map<string, CommandMeta>;