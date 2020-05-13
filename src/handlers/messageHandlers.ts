import mongoose from 'mongoose'
import { ServerError, HTTP_STATUS, INT_ERRORS } from '../errors'
import { PaginationOpts, FindQuery, AttachmentInfo, UpdateQuery } from '../types/types'
import { to, validEmail } from '../utils'
import { IMessage, IAttachment } from '../db/messages'
import MailComposer from 'nodemailer/lib/mail-composer'
import fs from 'fs'
import util from 'util'
import { smtpTransport } from '../smtpSender'
import { IMailboxDoc } from '../db/mailboxes'
//@ts-ignore
import libbase64 from 'libbase64'

//@ts-ignore
import { createIMAPBodyStructure, createIMAPEnvelop, parseMIME, getLength, extractMailData } from '../../rfc822'

const unlinkAsync = util.promisify(fs.unlink)
// In all handlers `this` is the fastify instance
// The fastify instance used for the handler registration

export function getPaginatedMessages(fastify: any): any {
    return async (req: any, reply: any) => {
        let f: any = fastify

        let user: any = req.user

        if (req.validationError) {
            // [{},{}]
            throw new ServerError(
                HTTP_STATUS.BAD_REQUEST,
                req.validationError.validation,
                INT_ERRORS.API_VALIDATION_ERR
            )
        }

        let addressId: mongoose.Types.ObjectId = user.primeAddress
        let mailboxId: mongoose.Types.ObjectId = mongoose.Types.ObjectId(req.body.id)

        if (req.body.addressId) {
            addressId = mongoose.Types.ObjectId(req.body.addressId)
        }

        let resp: any = {}

        let replyCode = HTTP_STATUS.OK

        let q: FindQuery = {
            filter: {
                user: user._id,
                address: addressId,
                mailbox: mailboxId
            }
        }

        let opts: PaginationOpts = {
            limit: req.body.limit || 20,
            query: q,
            previous: req.body.previous,
            next: req.body.next,
            ascending: req.body.ascending
        }

        let err: any
        let res: any

        [err, res] = await to(fastify.services.messageService.getPaginatedMessages({}, opts))
        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || INT_ERRORS.SERVER_ERR)
        }

        // Maybe flatten the output structure
        resp = res

        reply
            .code(replyCode)
            .send(resp)
    }
}

export function getThreadedMessages(fastify: any): any {
    return async (req: any, reply: any) => {
        let f: any = fastify

        let user: any = req.user

        if (req.validationError) {
            // [{},{}]
            throw new ServerError(
                HTTP_STATUS.BAD_REQUEST,
                req.validationError.validation,
                INT_ERRORS.API_VALIDATION_ERR
            )
        }

        let addressId: mongoose.Types.ObjectId = user.primeAddress
        let threadId: mongoose.Types.ObjectId = mongoose.Types.ObjectId(req.body.id)

        if (req.body.addressId) {
            addressId = mongoose.Types.ObjectId(req.body.addressId)
        }

        let resp: any = {}

        let replyCode = HTTP_STATUS.OK

        let messageQuery: FindQuery = {
            filter: {
                user: user._id,
                address: addressId,
                thread: threadId
            },
            projection: 'messageId from to cc bcc parsedHeaders attachments hasAttachments flags body thread'
        }


        let err: any
        let res: any

        // TODO: Maybe some message threads are really big, with over 100 messages. In that case we should have
        // count get the thread , count the references array and figure out the size first. If too big, say >100
        // then paginate instead of find

        [err, res] = await to(fastify.services.messageService.findMessages({}, messageQuery))
        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || INT_ERRORS.SERVER_ERR)
        }

        // Maybe flatten the output message structure
        resp = { messages: res }

        reply
            .code(replyCode)
            .send(resp)
    }
}

export function outboundMessage(fastify: any): any {
    return async (req: any, reply: any) => {
        let f: any = fastify
        let start: [number, number]
        let cleanupTemp = async (fileNames: string[]) => {

            for (let i = 0; i < fileNames.length; i++) {
                try {
                    await unlinkAsync(fileNames[i])
                } catch (err) {
                    // Log error here. Do not throw as it's not a vital step
                    // client should not get a 500 if this clean up fails
                    fastify.log.error(`Failed to clean temp files during Outbound: ${fileNames.join(', ')}`)
                }
            }

        }

        let user: any = req.user
        let validations: any = []
        let tempFilePaths: string[] = []
        let truncatedFileNames: string[] = []
        let files: any[] = []
        let action = req.body.action
        let recipients: any = {
            to: [],
            cc: [],
            bcc: []
        }
        let inReplyTo: string = ""
        let references: string = ""
        let subject: string = req.body.subject || "" // If action is reply/fwd then this subject is ignored and subject is taken from parent message
        let text = req.body.text || ""
        let html = req.body.html || ""
        let attachments: IAttachment[] = []

        // Check if any files were larger than the allowed size
        if (req.body.files) {
            /**
             * File Object is of shape
             *
             * name: 'test1mb.txt',
             * data: <Buffer >,
             * size: 1242880,
             * encoding: '7bit',
             * tempFilePath: '/tmp/bizgaze/tmp-1-1582566950268',
             * truncated: false,
             * mimetype: 'text/plain',
             * md5: '526314450985ff1b016eec41be663239',
             */
            if (Array.isArray(req.body.files)) {
                files = req.body.files
            } else {
                files.push(req.body.files)
            }

            for (let i = 0; i < files.length; i++) {
                tempFilePaths.push(files[i].tempFilePath)
                if (files[i].truncated) {
                    truncatedFileNames.push(files[i].name)
                }
            }
        }

        if (req.validationError) {
            validations = req.validationError.validation
        }

        // Validations
        // If option is reply or forward then parentId is needed
        if (action == 'reply' || action == 'forward' || action == 'replyAll') {
            if (!req.body.parentId) {
                validations.push({
                    dataPath: `parentId`,
                    message: 'is not available'
                })
            }
        }

        // to, cc , bcc should have proper emails
        const fields: string[] = ['cc', 'to', 'bcc']
        fields.forEach(function (field: string) {
            if (req.body[field]) {
                if (Array.isArray(req.body[field])) {
                    recipients[field] = req.body[field]
                } else {
                    recipients[field].push(req.body[field])
                }
                recipients[field].forEach(function (mail: string) {
                    if (!validEmail(mail)) {
                        validations.push({
                            dataPath: `${field}:${mail}`,
                            message: 'Invalid email address'
                        })
                    }
                })
            }
        })


        //If file sizes crossed limit add them to validations
        truncatedFileNames.forEach(function (fn: string) {
            validations.push({
                dataPath: `files: ${fn}`,
                message: 'crossed size limit'
            })
        })

        if (validations.length != 0) {
            await cleanupTemp(tempFilePaths)
            throw new ServerError(
                HTTP_STATUS.BAD_REQUEST,
                validations,
                INT_ERRORS.API_VALIDATION_ERR
            )
        }

        // Upload using promise.all
        start = process.hrtime()
        let uploadPromises: Promise<any>[] = []
        for (let i in files) {
            let info: AttachmentInfo = {
                filename: files[i].name,
                contentType: files[i].mimetype,
                count: 1
            }
            let readStream = fs.createReadStream(files[i].tempFilePath)
            let base64Encoder = new libbase64.Encoder({})
            readStream.pipe(base64Encoder)
            uploadPromises.push(f.services.attachmentService.saveAttachment({}, base64Encoder, info))
        }

        let [uploadErr, uploadResults] = await to(Promise.all(uploadPromises))

        if (uploadErr != null) {
            await cleanupTemp(tempFilePaths)
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, uploadErr!.message, INT_ERRORS.SERVER_ERR)
        }

        console.log('upload finished..', uploadResults!)

        for (let i in uploadResults!) {
            let att: IAttachment = {
                fileId: uploadResults[i]._id,
                filename: uploadResults[i].filename,
                contentDisposition: 'attachment',
                contentType: uploadResults[i].contentType,
                contentId: "",
                transferEncoding: "",
                related: false,
                size: uploadResults[i].length
            }
            attachments.push(att)
        }
        let uploadEnded = process.hrtime(start)
        f.log.info(`Uploaded attachments successfully (${uploadEnded[0]}s ${uploadEnded[1] / 1000000}ms)`)

        // Thread and save message to sent mailbox
        start = process.hrtime()
        // Get address
        let addressId: mongoose.Types.ObjectId = user.primeAddress
        if (req.body.addressId) {
            addressId = mongoose.Types.ObjectId(req.body.addressId)
        }
        let err: any
        let addressQuery: FindQuery = {
            filter: { _id: addressId },
            projection: 'address'
        }
        let addressRes: any
        [err, addressRes] = await to(f.services.addressService.findAddresses({}, addressQuery))
        if (err != null) {
            await cleanupTemp(tempFilePaths)
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.messages, INT_ERRORS.SERVER_ERR)
        }
        if (addressRes.length == 0) {
            await cleanupTemp(tempFilePaths)
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, `No documents found for: ${JSON.stringify(addressQuery)}`, INT_ERRORS.SERVER_ERR)
        }

        let from = addressRes[0].address

        // Get Mailbox
        let mailboxName = "Sent Mail"
        let mailboxQuery: FindQuery = {
            filter: {
                user: user._id,
                address: addressId,
                name: mailboxName
            },
            projection: '_id retention retentionTime uidNext modifyIndex'
        }
        let mailboxResults: IMailboxDoc[] | undefined
        [err, mailboxResults] = await to(f.services.mailboxService.findMailboxes({}, mailboxQuery))
        if (err != null) {
            await cleanupTemp(tempFilePaths)
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.messages, INT_ERRORS.SERVER_ERR)
        }
        if (mailboxResults!.length == 0) {
            await cleanupTemp(tempFilePaths)
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, `No documents found for: ${JSON.stringify(mailboxQuery)}`, INT_ERRORS.SERVER_ERR)
        }

        // If action is reply/forward then need to get references from the parent
        if (action == 'reply' || action == 'forward' || action == 'replyAll') {
            // Get parent
            let parentId: mongoose.Types.ObjectId = mongoose.Types.ObjectId(req.body.parentId)
            let messageQuery: FindQuery = {
                filter: {
                    _id: parentId,
                    user: user._id
                },
                projection: 'parsedHeaders messageId'
            }
            let messageRes: any
            [err, messageRes] = await to(f.services.messageService.findMessages({}, messageQuery))
            if (err != null) {
                await cleanupTemp(tempFilePaths)
                throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.messages, INT_ERRORS.SERVER_ERR)
            }
            if (messageRes.length == 0) {
                await cleanupTemp(tempFilePaths)
                throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, `No documents found for: ${JSON.stringify(messageQuery)}`, INT_ERRORS.SERVER_ERR)
            }

            inReplyTo = messageRes[0].messageId

            // If its the first message in the thread, it might not have references header. so we need to check for its existance
            let parentReferences = messageRes[0].parsedHeaders['references'] ? messageRes[0].parsedHeaders['references'].replace(/\s\s+/g, ' ').trim() : ''

            // Add parent message id to references list , but only if it does not exist
            let uniqueReferences = new Set()
            uniqueReferences.add(inReplyTo)
            parentReferences.split(' ').forEach(function (r: any) {
                uniqueReferences.add(r)
            })
            references = Array.from(uniqueReferences).join(" ")

            // Get cleaned subject
            subject = messageRes[0].parsedHeaders['subject'].replace(/([\[\(] *)?(RE|FWD|re|fwd|Re|Fwd?) *([-:;)\]][ :;\])-]*|$)|\]+ *$/, "")

            // Add prefixes to subject
            if (action == 'reply' || action == 'replyAll') {
                subject = `Re:${subject}`
            } else if (action == 'forward') {
                subject = `Fwd:${subject}`
            }
        }

        // Compose rfc2822 email
        // refer: https://nodemailer.com/extras/mailcomposer
        let composeOpts: any = {
            from: from,
            sender: from,
            to: recipients.to.join(','),
            cc: recipients.cc.join(','),
            bcc: recipients.bcc.join(','),
            replyTo: from,
            subject: subject,
            text: text
        }

        if (inReplyTo != "" && references != "") {
            composeOpts['inReplyTo'] = inReplyTo
            composeOpts['references'] = references
        }

        if (html != "") composeOpts['html'] = html;

        // let composeOptsAttachment: any[] = attachments.map((a: IAttachment) => {
        //     return {
        //         filename: a.filename,
        //         // encoding: 'base64',
        //         content: f.services.attachmentService.getDownloadStream(a.fileId),
        //         contentTransferEncoding: 'base64',
        //         contentType: a.contentType
        //     }
        // })

        let composeOptsAttachment: any[] = []
        for (let i in files) {
            composeOptsAttachment.push({
                filename: files[i].name,
                contentType: files[i].mimetype,
                content: fs.createReadStream(files[i].tempFilePath),
                contentTransferEncoding: 'base64',
            })
        }

        let hasAttachments = false

        // If attachments add attachments and get a new rfc822 email
        if (composeOptsAttachment.length != 0) {
            hasAttachments = true
            composeOpts['attachments'] = composeOptsAttachment
        }

        // Build rfc822 raw email
        // MailComposer does not add subject header if subject passed was an empty string, ie. ""
        let compiled = new MailComposer(composeOpts).compile()
        let parsed = _parseComiledMail(compiled)

        let rfc822Mail: any
        [err, rfc822Mail] = await to(compiled.build())

        if (err != null) {
            await cleanupTemp(tempFilePaths)
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.messages, INT_ERRORS.SERVER_ERR)
        }

        let mimeTree: any = parseMIME(rfc822Mail)

        let mailData: any = extractMailData(mimeTree, true)
        let attachmentMap: any = {}

        for (let i = 0; i < mailData.nodes.length; i++) {
            attachmentMap[mailData.nodes[i].attachmentId] = attachments[i].fileId
        }

        for (let i = 0; i < mailData.attachments; i++) {
            attachments[i]['related'] = mailData.attachments[i].related
        }

        mimeTree['attachmentMap'] = attachmentMap

        let imapBodyStr = createIMAPBodyStructure(mimeTree)
        // Get total mail size
        let mailSize = getLength(mimeTree)
        let imapEnv = createIMAPEnvelop(mimeTree.parsedHeader || {})
        let mailText = mailData.text
        let mailHTML = mailData.html
        // update the message-id that was generated
        composeOpts['messageId'] = parsed.messageId;
        // create the mail and save it
        let newEmail: IMessage = {
            rootId: null,
            exp: mailboxResults![0].retention,
            retentionDate: mailboxResults![0].retentionTime,
            userRemoved: false,
            idate: new Date(Date.now()),
            size: mailSize,
            parsedHeaders: parsed.parsedHeaders,
            messageId: parsed.messageId,
            draft: false,
            copied: false,
            attachments,
            hasAttachments,
            flags: {
                seen: false,
                starred: false,
                important: false
            },
            body: mimeTree,
            imapBodyStructure: imapBodyStr,
            imapEnvelope: imapEnv,
            text: mailText,
            html: mailHTML,
            from: [from],
            to: recipients.to,
            cc: recipients.cc,
            bcc: recipients.bcc,
            rcpt: [],
            mailbox: mailboxResults![0]._id,
            user: user._id,
            address: addressId,
            uid: 0, // Temp
            modseq: 0, // Temp
            thread: <mongoose.Types.ObjectId>{}, // Temp
            metadata: {}
        }

        let currentModifyIndex = mailboxResults![0].modifyIndex
        let currentUid = mailboxResults![0].uidNext
        let saveRes: any
        [err, saveRes] = await to(f.tx.messageTx.saveEmail(newEmail, currentUid, currentModifyIndex))
        if (err != null) {
            await cleanupTemp(tempFilePaths)
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, `Unable to save outbound mail ${err.message}`, INT_ERRORS.SERVER_ERR)
        }

        let saveMailEnded = process.hrtime(start)
        f.log.info(`Mail processed and saved succesfully (${saveMailEnded[0]}s ${saveMailEnded[1] / 1000000}ms)`)

        // Notify
        fastify.messageNotifier.notifyNewMessage({
            userid: newEmail.user.toHexString(),
            mailboxId: newEmail.mailbox.toHexString(),
            uid: newEmail.uid,
            modseq: newEmail.modseq
        })

        // The content readstream has been closed, so need to setup new value
        // reset old values
        composeOptsAttachment = []
        // set it up again
        for (let i in files) {
            composeOptsAttachment.push({
                filename: files[i].name,
                contentType: files[i].mimetype,
                content: fs.createReadStream(files[i].tempFilePath),
                contentTransferEncoding: 'base64',
            })
        }
        // update compose options
        composeOpts['attachments'] = composeOptsAttachment

        // add to queue
        start = process.hrtime()
        let replyStatus = "queued successfully"
        let sendRes: any
        [err, sendRes] = await to(smtpTransport.sendMail(composeOpts))
        if (err != null) {
            f.log.error("Unable to queue message outbound mail", new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, `Unable to queue message outbound mail ${err}`, INT_ERRORS.SERVER_ERR))

            replyStatus = "failed to queue"

            // Update the message document
            let newMetadataEntry: any = {
                stage: 'queue',
                message: `failed: ${err.message}`,
                at: new Date(Date.now())
            }

            let updateMessageQuery: UpdateQuery = {
                filter: {
                    _id: saveRes,
                    user: user._id
                },
                // Add more structure when requirements are more clear
                document: {
                    $push: { 'metadata.outboundStatus': newMetadataEntry }
                }
            }

            let updatedCount: any
            [err, updatedCount] = await to(f.services.messageService.updateMessages({}, updateMessageQuery))

            if (err != null) {
                await cleanupTemp(tempFilePaths)
                throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, INT_ERRORS.SERVER_ERR)
            }

        }

        let queueEnded = process.hrtime(start)
        console.log('queueEnded', queueEnded)
        f.log.info(`Mail queued successfully (${queueEnded[0]}s ${queueEnded[1] / 1000000}ms)`)

        // Message was queued,  now cleanup the temp files before sending response
        await cleanupTemp(tempFilePaths)

        reply
            .status(HTTP_STATUS.OK)
            .send({
                id: saveRes.toString(),
                status: replyStatus
            })
    }
}

// Outbound handler helpers
function _parseCompiledHeaders(headers: any, lowercase: boolean = false) {
    let parsed: any = {}
    headers.forEach((h: any) => {
        if (lowercase) {
            parsed[h.key.toLowerCase()] = h.value
        } else {
            parsed[h.key] = h.value
        }
    })

    return parsed
}

function _parseComiledMail(compiled: any) {
    let parsedHeaders = _parseCompiledHeaders(compiled._headers, true)
    let messageId = compiled.messageId()
    return {
        // parsedBody,
        parsedHeaders,
        messageId
    }
}
