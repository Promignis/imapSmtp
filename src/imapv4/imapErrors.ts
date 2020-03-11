export const IMAP_INT_ERRORS = {
    COMMAND_PARSE_ERROR: "ParseError",
    CONNECTION_ERROR: "ConnectionError",
    IMAP_SERVER_ERROR: "ImapServerError",
}

export const IMAP_STATUS = {
    OK: "OK",
    BAD: "BAD",
    NO: "NO"
}

export class ImapServerError extends Error {
    status: string
    message: string
    name: string
    meta: Object
    constructor(status: string, message: string, name: string, meta?: object) {
        super(message)
        this.status = status,
            this.message = message,
            this.name = name,
            this.meta = meta || {}
    }
}
