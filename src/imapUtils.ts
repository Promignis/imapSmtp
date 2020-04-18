import {
    FetchQuery,
    BodyPartial
} from './imapv4'

//@ts-ignore
import { getLength, rebuildOriginal, resolveNode, formatHeaders } from '../rfc822'

import { IMessageDoc } from './db/messages'


// Imap flags mapped to corresponding parameters in the message document 
export const IMAPFlagsToMessageModel: { [key: string]: string } = {
    // refer message model
    '\\Seen': 'flags.seen',
    '\\Draft': 'draft',
    '\\Flagged': 'flags.important',
    '\\Deleted': 'deleted'
}

interface contentSelector {
    type: string,
    path: string,
    headers?: string
}