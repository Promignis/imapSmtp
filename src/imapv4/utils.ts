// Seperate utils for IMAP module , so that it can stay decoupled from http server module
import crypto from 'crypto'

export function to<T, U = Error>(
    promise: Promise<T>,
    errorExt?: object
): Promise<[U | null, T | undefined]> {
    return promise
        .then<[null, T]>((data: T) => [null, data])
        .catch<[U, undefined]>((err: U) => {
            if (errorExt) {
                Object.assign(err, errorExt);
            }

            return [err, undefined];
        });
}

export function generateRandomString(length: number): string {
    // TODO: Add a more sphisticated lib to do this?
    return crypto.randomBytes(Math.ceil(length * 0.5)).toString('hex').slice(0, length);
}

export function normalizeMailboxName(mailboxname: string): string {
    // trim slashes
    mailboxname = mailboxname.replace(/^\/|\/$/g, () => '')

    // Normalize case insensitive INBOX to always use uppercase
    let parts = mailboxname.split('/')

    if (parts[0].toUpperCase() === 'INBOX') {
        parts[0] = 'INBOX';
    }

    mailboxname = parts.join('/')

    return mailboxname
}

// This accepts a sequence set string and then filter out the correct message 
export function getMessages(messageSeq: number[], seqSet: string, isUid: boolean): number[] {
    let messageIds: number[] = []

    let sequences = seqSet.split(',')
    let totalMessages = messageSeq.length
    // Message sequence is alwyas sorted, so the last item should have max uid
    let maxUid = messageSeq[messageSeq.length - 1]

    let isInRange = (num: number, max: number): boolean => {
        for (let i = 0; i < sequences.length; i++) {
            let range = sequences[i].split(':')
            let start: number
            let end: number
            // Handle NaN and * 
            start = range[0] == "*" ? max : Number(range[0])
            end = start
            if (range[1]) {
                end = range[1] == "*" ? max : Number(range[0])
            }
            if (isNaN(start) || isNaN(end)) {
                return false
            }
            if (num >= Math.min(start, end) && num <= Math.max(start, end)) {
                return true;
            }
        }
        return false
    }

    for (let i = 0; i < messageSeq.length; i++) {
        let uid = messageSeq[i] || 1
        // If its a UID command , then we need to check for uid value , else index value
        if (isInRange(isUid ? uid : i + 1, isUid ? maxUid : messageSeq.length)) {
            messageIds.push(messageSeq[i])
        }
    }

    return messageIds
}