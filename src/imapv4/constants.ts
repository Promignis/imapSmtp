import { RespStatus, RespCode } from './types'


// TODO: Take these from config
export const MAX_MESSAGE_SIZE = 1 * 1024 * 1024 // This is needed to limit message size during APPEND. For now its just 1 mb
export const MAX_LITERAL_SIZE = 8 * 1024 // This is the max literal size for commands other than APPEND
// const MAX_BAD_COMMANDS = 50;

export enum State {
    'ANY', 'AUTH', 'NOTAUTH', 'SELECTED'
}

// Refer rfc3501 section 7.1.

// The OK response indicates an information message from the server.  When
// tagged, it indicates successful completion of the associated command.
// The untagged form indicates an information-only message.

// The BAD response indicates an error message from the server.  When
// tagged, it reports a protocol-level error in the client's command;
// the tag indicates the command that caused the error.  The untagged
// form indicates a protocol-level error for which the associated
// command can not be determined; it can also indicate an internal
// server failure.

// The NO response indicates an operational error message from the
// server.  When tagged, it indicates unsuccessful completion of the
// associated command.  The untagged form indicates a warning; the
// command can still complete successfully.

// The PREAUTH response is always untagged, and is one of three
// possible greetings at connection startup.  It indicates that the
// connection has already been authenticated by external means; thus
// no LOGIN command is needed.

// The BYE response is always untagged, and indicates that the server
// is about to close the connection.
export const IMAPResponseStatus: { [key: string]: RespStatus } = {
    OK: 'OK',
    BAD: 'BAD',
    NO: 'NO',
    PREAUTH: 'PREAUTH',
    BYE: 'BYE',
}

export const IMAPResponseCode: { [key: string]: RespCode } = {
    ALERT: 'ALERT',
    BADCHARSET: 'BADCHARSET',
    CAPABILITY: 'CAPABILITY',
    PARSE: 'PARSE',
    PERMANENTFLAGS: 'PERMANENTFLAGS',
    TRYCREATE: 'TRYCREATE',
    UIDNEXT: 'UIDNEXT',
    UIDVALIDITY: 'UIDVALIDITY',
    UNSEEN: 'UNSEEN',
    READ_WRITE: 'READ-WRITE',
    READ_ONLY: 'READ-ONLY',
    TOOBIG: 'TOOBIG',
    AUTHENTICATIONFAILED: 'AUTHENTICATIONFAILED',
    SERVERBUG: 'SERVERBUG'
}

