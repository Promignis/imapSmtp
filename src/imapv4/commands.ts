import { State, CommandMeta } from './types'


const NOOP: CommandMeta = {
    state: [State.ANY],
    schema: []
}

const CAPABLITY: CommandMeta = {
    state: [State.ANY],
    schema: [] // Empty array means it takes no arguments
}

const LOGIN: CommandMeta = {
    state: [State.NOTAUTH],
    schema: [
        {
            name: 'username',
            optional: false,
            type: 'string'
        },
        {
            name: 'password',
            optional: false,
            type: 'string'
        }
    ]
}

const LOGOUT: CommandMeta = {
    state: [State.ANY],
    schema: []
}

const STARTTLS: CommandMeta = {
    state: [State.NOTAUTH],
    schema: []
}

const AUTHENTICATE: CommandMeta = {
    state: [State.NOTAUTH],
    schema: [
        {
            name: 'mechanism',
            optional: false,
            type: 'string'
        }
    ]
}

const NAMESPACE: CommandMeta = {
    state: [State.AUTH, State.SELECTED],
    schema: [
        {
            name: 'mechanism',
            optional: false,
            type: 'string'
        }
    ]
}

const LIST: CommandMeta = {
    state: [State.AUTH, State.SELECTED],
    schema: [
        {
            name: 'reference',
            optional: false,
            type: 'string'
        },
        {
            name: 'mailbox',
            optional: false,
            type: 'string'
        }
    ]
}

const LSUB: CommandMeta = {
    state: [State.AUTH, State.SELECTED],
    schema: [
        {
            name: 'reference',
            optional: false,
            type: 'string'
        },
        {
            name: 'mailbox',
            optional: false,
            type: 'string'
        }
    ]
}

const SUBSCRIBE: CommandMeta = {
    state: [State.AUTH, State.SELECTED],
    schema: [
        {
            name: 'mailbox',
            optional: false,
            type: 'string'
        }
    ]
}

const UNSUBSCRIBE: CommandMeta = {
    state: [State.AUTH, State.SELECTED],
    schema: [
        {
            name: 'mailbox',
            optional: false,
            type: 'string'
        }
    ]
}

const CREATE: CommandMeta = {
    state: [State.AUTH, State.SELECTED],
    schema: [
        {
            name: 'mailbox',
            optional: false,
            type: 'string'
        }
    ]
}

const RENAME: CommandMeta = {
    state: [State.AUTH, State.SELECTED],
    schema: [
        {
            name: 'mailbox',
            optional: false,
            type: 'string'
        },
        {
            name: 'newName',
            optional: false,
            type: 'string'
        }
    ]
}

const DELETE: CommandMeta = {
    state: [State.AUTH, State.SELECTED],
    schema: [
        {
            name: 'mailbox',
            optional: false,
            type: 'string'
        }
    ]
}

const SELECT: CommandMeta = {
    state: [State.AUTH, State.SELECTED],
    schema: [
        {
            name: 'mailbox',
            optional: false,
            type: 'string'
        }
    ]
}

const EXAMINE: CommandMeta = {
    state: [State.AUTH, State.SELECTED],
    schema: [
        {
            name: 'mailbox',
            optional: false,
            type: 'string'
        }
    ]
}

const IDLE: CommandMeta = {
    state: [State.AUTH, State.SELECTED],
    schema: []
}

const CHECK: CommandMeta = {
    state: [State.SELECTED],
    schema: []
}

const STATUS: CommandMeta = {
    state: [State.AUTH, State.SELECTED],
    schema: [
        {
            name: 'mailbox',
            optional: false,
            type: 'string'
        },
        {
            name: 'query', // For example STATUS INBOX (UIDNEXT MESSAGES)
            optional: false,
            type: 'list'
        }
    ]
}
const APPEND: CommandMeta = {
    state: [State.AUTH, State.SELECTED],
    schema: [
        {
            name: 'mailbox',
            optional: false,
            type: 'string'
        },
        {
            name: 'flags',
            optional: true,
            type: 'list'
        },
        {
            name: 'datetime',
            optional: true,
            type: 'string'
        },
        {
            name: 'message',
            optional: false,
            type: 'literal'
        }
    ]
}
// Possible actions: FLAGS, FLAGS.SILENT, +FLAGS, -FLAGS 
const STORE: CommandMeta = {
    state: [State.SELECTED],
    schema: [
        {
            name: 'range',
            optional: false,
            type: 'sequence'
        },
        {
            name: 'action',
            optional: false,
            type: 'string'
        },
        {
            name: 'flags',
            optional: false,
            type: 'list'
        }
    ]
}
const UID_STORE: CommandMeta = {
    state: [State.SELECTED],
    schema: [
        {
            name: 'range',
            optional: false,
            type: 'sequence'
        },
        {
            name: 'action',
            optional: false,
            type: 'string'
        },
        {
            name: 'flags',
            optional: false,
            type: 'list'
        }
    ]
}
const EXPUNGE: CommandMeta = {
    state: [State.SELECTED],
    schema: []
}

const CLOSE: CommandMeta = {
    state: [State.SELECTED],
    schema: []
}


const UNSELECT: CommandMeta = {
    state: [State.SELECTED],
    schema: []
}

const COPY: CommandMeta = {
    state: [State.SELECTED],
    schema: [
        {
            name: 'range',
            optional: false,
            type: 'sequence'
        },
        {
            name: 'path',
            optional: false,
            type: 'string'
        }
    ]
}

const UID_COPY: CommandMeta = {
    state: [State.SELECTED],
    schema: [
        {
            name: 'range',
            optional: false,
            type: 'sequence'
        },
        {
            name: 'path',
            optional: false,
            type: 'string'
        }
    ]
}

const FETCH: CommandMeta = {
    state: [State.SELECTED],
    schema: [
        {
            name: 'range',
            optional: false,
            type: 'sequence'
        },
        {
            name: 'data',
            optional: false,
            // mixed type means a mixture of strings and sequences
            // eg. A654 FETCH 2:4 (FLAGS BODY[HEADER.FIELDS (DATE FROM)])
            type: 'mixed'
        },
    ]
}

const UID_FETCH: CommandMeta = {
    state: [State.SELECTED],
    schema: [
        {
            name: 'range',
            optional: false,
            type: 'sequence'
        },
        {
            name: 'data',
            optional: false,
            type: 'mixed'
        },
    ]
}

const SEARCH: CommandMeta = {
    state: [State.SELECTED],
    schema: null // Search arguments can by dynamic, no predefined schema
}

const UID_SEARCH: CommandMeta = {
    state: [State.SELECTED],
    schema: null
}


export const commandList: Map<string, CommandMeta> = new Map([
    ['CAPABILITY', CAPABLITY],
    ['NOOP', NOOP],
    ['LOGOUT', LOGOUT],
    ['LOGIN', LOGIN],
    ['LIST', LIST],
    ['LSUB', LSUB],
    ['SUBSCRIBE', SUBSCRIBE],
    ['UNSUBSCRIBE', UNSUBSCRIBE],
    ['SELECT', SELECT],
    ['EXAMINE', EXAMINE],
    ['CHECK', CHECK],
    ['STATUS', STATUS],
    ['STORE', STORE],
    ['EXPUNGE', EXPUNGE],
    ['CLOSE', CLOSE],
    ['UNSELECT', UNSELECT],
    ['FETCH', FETCH],
    ['SEARCH', SEARCH],
    /**
    * UID command can have 2 forms , one is 'UID STORE/COPY/FETCH' and the other is 'UID SEARCH'
    * Each form is being treated as an indipendent command for easier handling instead of treating UID as an indipendent command 
    */
    ['UID STORE', UID_STORE],
    ['UID FETCH', UID_FETCH],
    ['UID SEARCH', UID_SEARCH],
    // Does not need implementation
    ['STARTTLS', STARTTLS], // Not needed as unsecure connection is not allowed

    // Not implemented in version 1.0
    ['AUTHENTICATE', AUTHENTICATE],
    ['CREATE', CREATE],
    ['DELETE', DELETE],
    ['RENAME', RENAME],
    ['IDLE', IDLE],
    ['APPEND', APPEND],
    ['COPY', COPY],
    ['UID COPY', UID_COPY],

    // Most common Extended commands that can be added in future
    // 'NAMESPACE', // Extension: rfc2342. 
    // 'UID EXPUNGE, // Extension: rfc4315
    // 'MOVE', // Extension: rfc6851
    // 'UID MOVE', //  Extension: rfc6851
    // 'GETQUOTAROOT'
    // 'SETQUOTA'
    // 'GETQUOTA'
    // 'COMPRESS'

]);

