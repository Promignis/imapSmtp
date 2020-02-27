import mongodb from 'mongodb'
import mongoose from 'mongoose'
import { MongooseTransaction } from './transact'
import { to } from '../utils'
import { IMessage } from '../db/messages'
import { ServerError, HTTP_STATUS } from '../errors'
import { FindQuery, UpdateQuery } from '../types/types'
import { IThread, IThreadDoc } from '../db/threads'
export class MessageTX {

    conn: mongoose.Connection
    services: any

    constructor(conn: mongoose.Connection, services: any) {
        this.conn = conn
        this.services = services
    }

    // Returns the saved message id
    async saveEmail(mail: IMessage, uid: number, modifyIndex: number, options?: any): Promise<mongoose.Types.ObjectId> {
        let conn: mongoose.Connection = this.conn
        let tx = new MongooseTransaction(conn)

        let transactionErr: any
        let transactionResult: any
        [transactionErr, transactionResult] = await to(tx.transact(async (session: mongodb.ClientSession): Promise<mongoose.Types.ObjectId> => {
            let err: any
            // Check if user exists
            let userQuery: FindQuery = {
                filter: {
                    _id: mail.user
                },
                projection: '_id'
            }
            let userResult: any
            [err, userResult] = await to(this.services.userService.findUsers({ session }, userQuery))
            if (err != null) {
                throw err
            }
            if (userResult.length == 0) {
                throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, `User id ${mail.user} does not exist!`, 'ServerError')
            }
            // thread
            let threadId: any
            [err, threadId] = await to(this._createOrUpdateThread(session, mail))
            if (err != null) {
                throw err
            }
            // update mailboxes 
            let sizeKB = mail.size / 1024
            let mailboxUpdateQuery: UpdateQuery = {
                filter: {
                    user: mail.user,
                    _id: mail.mailbox
                },
                document: {
                    $inc: {
                        uidNext: 1,
                        modifyIndex: 1,
                        "stats.total": 1,
                        "stats.unseen": 1,
                        "stats.sizeKB": sizeKB
                    }
                }
            }
            let mailboxUpdatCount: any
            [err, mailboxUpdatCount] = await to(this.services.mailboxService.updateMailboxes({ session }, mailboxUpdateQuery))
            if (err != null) {
                throw err
            }
            if (mailboxUpdatCount != 1) {
                throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, `Failed to update for: ${JSON.stringify(mailboxUpdateQuery)}`, 'ServerError')
            }
            // Replace temp values
            mail.thread = threadId
            mail.uid = uid
            mail.modseq = modifyIndex + 1
            // Save mail
            let savedMessageRes: any
            [err, savedMessageRes] = await to(this.services.messageService.createMessage({ session }, mail))
            if (err != null) {
                throw err
            }
            // return
            return savedMessageRes._id
        }))

        if (transactionErr != null) {
            throw transactionErr
        }

        return transactionResult
    }

    // Returns the thread id for the message
    async _createOrUpdateThread(session: mongoose.ClientSession, email: IMessage): Promise<mongoose.Types.ObjectId> {
        // Being Threading
        let parsedHeaders: any = email.parsedHeaders
        let irt: string = ""
        let refs: string = ""
        let refsArray: string[]
        let existingThread: IThreadDoc
        let threadFound: boolean = true
        let messageId: string = email.messageId
        // Cleans up prefixes that other MTAs would have applied, example: Fwd:Subject, re;subject, [re]Subject etc.
        let cleanedSubject = <string>parsedHeaders['subject'].replace(/([\[\(] *)?(RE|FWD|re|fwd|Re|Fwd?) *([-:;)\]][ :;\])-]*|$)|\]+ *$/, "")
        let newReferenceArray: string[] = [messageId]
        let threadId: any = null

        // Check if InReplyTo and references header exist
        if (parsedHeaders['in-reply-to']) {
            irt = parsedHeaders['in-reply-to']
        }

        if (parsedHeaders['references']) {
            refs = parsedHeaders['references']
        }

        if (irt != "" && refs != "") {
            // Clean up values
            irt = irt.trim()
            refs = refs.replace(/\s\s+/g, ' ').trim()
            refsArray = refs.split(' ')

            // Merge irt with refs array, but do not replicate
            if (!refsArray.includes(irt)) {
                refsArray.push(irt)
            }

            refsArray.forEach(function (ref: string) {
                newReferenceArray.push(ref)
            })

            // Try to find an existing thread that might have these references
            let threadfilter: FindQuery = {
                filter: {
                    user: email.user,
                    address: email.address,
                    subject: cleanedSubject,
                    references: { $in: newReferenceArray }
                }
            }
            let err: any
            let threadRes: any
            [err, threadRes] = await to(this.services.threadService.findThread({ session }, threadfilter))
            if (err != null) {
                throw err
            }

            if (threadRes.length != 0) {
                existingThread = threadRes[0]
            } else {
                threadFound = false
            }
        }

        // If no ref headers are present means its a new email
        // If no thread is found but ref headers exist , that could mean
        // that the message was forwarded (or replied to outside a thread)
        // In both cases create a new thread and node entry for it
        if ((irt == "" && refs == "") || !threadFound) {
            let newThread: IThread = {
                user: email.user,
                address: email.address,
                subject: cleanedSubject,
                references: newReferenceArray,
                metadata: {}
            }
            let err: any
            let res: any
            [err, res] = await to(this.services.threadService.createThread({ session }, newThread))
            if (err != null) {
                throw err
            }
            threadId = res._id
        } else {
            // Update the existing thread
            //@ts-ignore
            let id = existingThread._id
            let threadUpdateQuery: UpdateQuery = {
                filter: {
                    user: email.user,
                    _id: id
                },
                document: {
                    $addToSet: {
                        references: { $each: newReferenceArray }
                    }
                }
            }
            let err: any
            let updateCount: any
            [err, updateCount] = await to(this.services.threadService.updateThread({ session }, threadUpdateQuery))
            if (err != null) {
                throw err
            }
            if (updateCount == 1) {
                threadId = id
            } else {
                throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, `Failed to update for: ${JSON.stringify(threadUpdateQuery)}`, 'ServerError')
            }
        }
        return threadId
    }
}