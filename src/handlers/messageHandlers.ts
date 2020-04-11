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

        let cleanupTemp = async (fileNames: string[]) => {

            for (let i = 0; i < fileNames.length; i++) {
                try {
                    await unlinkAsync(fileNames[i])
                } catch (err) {
                    throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.messages, err.name || INT_ERRORS.SERVER_ERR)
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

        // upload files to gridfs and create attachment objects
        for (let i in files) {
            let info: AttachmentInfo = {
                filename: files[i].name,
                contentType: files[i].mimetype,
                count: 1
            }
            let readStream = fs.createReadStream(files[i].tempFilePath)
            let savedFile: any
            let err: any
            [err, savedFile] = await to(f.services.attachmentService.saveAttachment({}, readStream, info))

            if (err != null) {
                await cleanupTemp(tempFilePaths)
                throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.messages, INT_ERRORS.SERVER_ERR)
            }

            let att: IAttachment = {
                fileId: savedFile._id,
                filename: files[i].name,
                contentDisposition: 'attachment',
                contentType: files[i].mimetype,
                contentId: "",
                transferEncoding: "",
                related: false,
                size: files[i].size
            }
            attachments.push(att)
        }

        // All files uploaded to gridfs , now cleanup the temp files
        await cleanupTemp(tempFilePaths)

        // Thread and save message to sent mailbox

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
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.messages, INT_ERRORS.SERVER_ERR)
        }
        if (addressRes.length == 0) {
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
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.messages, INT_ERRORS.SERVER_ERR)
        }
        if (mailboxResults!.length == 0) {
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
                throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.messages, INT_ERRORS.SERVER_ERR)
            }
            if (messageRes.length == 0) {
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

        let composeOptsAttachment: any[] = attachments.map((a: IAttachment) => {
            return {
                filename: a.filename,
                encoding: 'base64',
                content: f.services.attachmentService.getDownloadStream(a.fileId),
                contentTransferEncoding: 'base64'
            }
        })

        // Get mail size (without attachments)
        let hasAttachments = false
        let rfc822Mail: any = new MailComposer(composeOpts).compile()
        let messageBuff: any
        [err, messageBuff] = await to(rfc822Mail.build())
        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.messages, INT_ERRORS.SERVER_ERR)
        }
        let mailSize = messageBuff.length

        // If attachments add attachments and get a new rfc822 email
        if (composeOptsAttachment.length != 0) {
            hasAttachments = true
            composeOpts['attachments'] = composeOptsAttachment;
            rfc822Mail = new MailComposer(composeOpts).compile()
        }

        let parsed = _parseComiledMail(rfc822Mail)

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
            body: parsed.parsedBody,
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
        [err, saveRes] = await to(f.tx.messageTx.saveEmail(newEmail, currentModifyIndex, currentUid))
        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, `Unable to save outbound mail ${err.message}`, INT_ERRORS.SERVER_ERR)
        }
        // add to queue
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
                throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, INT_ERRORS.SERVER_ERR)
            }

        }

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

function _parseBody(compiled: any) {

    let mainHeader = _parseCompiledHeaders(compiled._headers)

    let body = {
        children: [],
        isHTML: false,
        contentType: {
            value: mainHeader['Content-Type'],
            params: {}
        },
        bodyEncoding: compiled.textEncoding,
        bodyContent: compiled._isPlainText ? compiled.content : "",
        headers: {
            contentType: null,
            contentDescription: null,
            contentDisposition: null,
            contentTransferEncoding: "",
            contentId: "",
            root: true
        }
    }

    if (compiled._isPlainText && compiled.childNodes.length == 0) {
        return body
    } else {
        let children = compiled.childNodes.map((n: any) => addChildren(n))
        body.children = children
        return body
    }

    function addChildren(compiledbody: any) {
        let h = _parseCompiledHeaders(compiledbody._headers)
        let isHTML = h['Content-Type'] == 'text/html'
        let contentType = {
            value: h['Content-Type'],
            params: {}
        }
        let bodyEncoding = compiled.textEncoding
        let bodyContent = compiled._isPlainText ? compiled.content : ""
        let headers = {
            contentType: h['Content-Type'] ? {
                value: h['Content-Type'],
                params: {}
            } : null,
            contentDescription: h['Content-Description'] ? {
                value: h['Content-Type'],
                params: {}
            } : null,
            contentDisposition: h['Content-Disposition'] ? {
                value: h['Content-Type'],
                params: {}
            } : null,
            contentTransferEncoding: "",
            contentId: "",
            root: false
        }
        let children = compiledbody.childNodes.map((n: any) => addChildren(n))
        return {
            isHTML,
            contentType,
            bodyEncoding,
            bodyContent,
            headers,
            children
        }
    }
}

function _parseComiledMail(compiled: any) {
    let parsedBody = _parseBody(compiled)
    let parsedHeaders = _parseCompiledHeaders(compiled._headers, true)
    let messageId = compiled.messageId()
    return {
        parsedBody,
        parsedHeaders,
        messageId
    }
}
