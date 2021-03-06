import mongoose, { ConnectionStates } from 'mongoose'
import fastifyPlugin from 'fastify-plugin'
import path from 'path'
// Using Mali instead of directly using node grpc package because it does not support promises
import Mali from 'mali'
import { to } from '../utils'
import { AttachmentInfo, FindQuery, UpdateQuery } from '../types/types'
import { Transform } from 'stream'
import { IMessage, IAttachment } from '../db/messages'
import { IMailboxDoc } from '../db/mailboxes'
//@ts-ignore
import { createIMAPBodyStructure, createIMAPEnvelop } from '../../rfc822'

async function setupGrpcServer(fastify: any, { }, done: Function) {
    const protoPath = path.join(process.cwd(), "src/proto/mail.proto")
    const app = new Mali(protoPath, 'MailService', {
        // These are gRPC native options that Mali passes down
        // to the underlying gRPC loader.
        defaults: true
    })
    // Setup handlers
    const checkValidityhandler = checkValidity(fastify)
    const uploadAttachmentHandler = uploadAttachment(fastify)
    const saveInboundHandler = saveInbound(fastify)
    const updateSavedMessageHandler = updateSavedMessage(fastify)
    // Setup server
    app.use({
        checkValidity: checkValidityhandler,
        uploadAttachment: uploadAttachmentHandler,
        saveInbound: saveInboundHandler,
        updateSavedMessage: updateSavedMessageHandler
    })

    // Decorate fastify instance
    fastify.decorate('grpcApp', app)

    done()
}

// TODO: Move the handlers out to different modules
function checkValidity(fastify: any) {
    return async function (ctx: any) {
        let f: any = fastify
        let address: string = ctx.request.req.address
        fastify.log.info(`[Grpc/MailService/checkValidity] Called for address ${address}`)
        // Check if email is valid

        let err: any
        let addressResult: any

        [err, addressResult] = await to(f.services.addressService.checkAvailibility({}, address))

        if (err != null) {
            fastify.log.error(`[Grpc/MailService/checkValidity] Error validating address`, err)
            throw new Error('[Grpc/MailService/checkValidity] Error validating address')
        }

        let available: boolean = false
        // If the address is not available that means it exists in the system
        if (addressResult == null) {
            available = true
        }

        // TODO: Also check if the user for this adress is disabled or not
        // If disabled the hook should be invalidated with error "550, Mailbox disabled". Refer "haraka-dsn" package 

        ctx.res = {
            valid: !available
        }
    }
}

function uploadAttachment(fastify: any) {
    return async function (ctx: any) {
        let f: any = fastify
        let meta: any = ctx.metadata
        // to log upload time
        let startTime = process.hrtime()
        // If the metadata values are not present throw error. Can not create a file without them
        if (!meta.filename || !meta.contenttype || !meta.count) {
            let missingFields: string[] = []

            if (!meta.filename) missingFields.push('filename');
            if (!meta.contenttype) missingFields.push('contenttype');
            if (!meta.count) missingFields.push('count');

            fastify.log.error(`[Grpc/MailService/uploadAttachment] Invalid metadata. Missing fields: ${missingFields}`)
            throw new Error(`[Grpc/MailService/uploadAttachment] Invalid metadata. Missing fields: ${missingFields}`)
        }

        let filename: string = meta.filename
        let contentType: string = meta.contenttype
        let count: number = parseInt(meta.count)

        // If could not convert count to int
        if (!count) {
            fastify.log.error(`[Grpc/MailService/uploadAttachment] Error typecasting count metadata`)
            throw new Error(`[Grpc/MailService/uploadAttachment] Error typecasting count metadata`)
        }

        let incompleteFile: boolean = false

        let inputStream: NodeJS.ReadableStream = ctx.request.req

        let transformStream = new Transformer()

        inputStream.on('data', (d: any) => {
            if (d.incomplete) {
                incompleteFile = true
                // Close the resable stream
                transformStream.end()

            } else {
                if (transformStream.writable) {
                    transformStream.write(d.chunk)
                }
            }
        })

        inputStream.on('end', (d: any) => {
            transformStream.end()
        })

        let info: AttachmentInfo = {
            filename: filename,
            contentType: contentType,
            count: count
        }

        let file: any
        let err: any
        [err, file] = await to(f.services.attachmentService.saveAttachment({}, transformStream, info))

        if (err != null) {
            throw err
        }

        let uploadTime = process.hrtime(startTime)
        fastify.log.info(`[Grpc/MailService/uploadAttachment] Uploaded file ${file._id.toString()} (${uploadTime[0]}s ${uploadTime[1] / 1000000}ms). Name: ${file.filename}, Size: ${file.length}`)

        let fileId = file._id
        let response = fileId.toString()

        if (incompleteFile) {
            // Remove the unfinished file.
            startTime = process.hrtime()
            let [err, _] = await to(f.services.attachmentService.deleteAttachment({}, fileId))

            if (err != null) {
                // Log but dont stop 
                fastify.log.Error(`[Grpc/MailService/uploadAttachment] Error removing uncompleted file ${file._id.toString()}.`, err)
            } else {
                let removalTime = process.hrtime(startTime)
                fastify.log.info(`[Grpc/MailService/uploadAttachment] Removed uncompleted for file ${file._id.toString()} (${removalTime[0]}s ${removalTime[1] / 1000000}ms). Name: ${file.filename}, Size: ${file.length}`)
            }

            response = ''
        }
        ctx.res = {
            id: response
        }
    }
}

class Transformer extends Transform {
    constructor(options?: any) {
        super(options)
    }

    _transform(chunk: any, encoding: any, callback: any) {
        callback(null, chunk)
    }
}

function saveInbound(fastify: any) {
    return async function saveInboundHandler(ctx: any) {
        let f: any = fastify
        let mailData = ctx.request.req
        let uniquercpts: string[] = mailData.uniquercpt
        for (const address of uniquercpts) {
            // Get message associations
            // Get address
            let addressQuery: FindQuery = {
                filter: { address: address },
                projection: '_id user'
            }
            let err: any
            let addressRes: any
            [err, addressRes] = await to(f.services.addressService.findAddresses({}, addressQuery))
            if (err != null) {
                fastify.log.error(`[Grpc/MailService/saveInbound] Unable to get address ${address}`, err)
                throw new Error(`[Grpc/MailService/saveInbound] Unable to save email`)
            }
            if (addressRes.length == 0) {
                fastify.log.error(`[Grpc/MailService/saveInbound] No documents found for: ${addressQuery}`)
                throw new Error(`[Grpc/MailService/saveInbound] Unable to save email`)
            }

            let addressId: mongoose.Types.ObjectId = addressRes[0]._id
            let userId: mongoose.Types.ObjectId = addressRes[0].user

            // Get mailbox
            // All inbound emails go into inbox by default for now
            let mailboxName = "Inbox"
            let mailboxQuery: FindQuery = {
                filter: {
                    user: userId,
                    address: addressId,
                    name: mailboxName
                },
                projection: '_id retention retentionTime uidNext modifyIndex'
            }
            let mailboxResults: IMailboxDoc[] | undefined
            [err, mailboxResults] = await to(f.services.mailboxService.findMailboxes({}, mailboxQuery))
            if (err != null) {
                fastify.log.error(`[Grpc/MailService/saveInbound] Unable to get address ${address}`, err)
                throw new Error(`[Grpc/MailService/saveInbound] Unable to save email`)
            }
            if (mailboxResults!.length == 0) {
                fastify.log.error(`[Grpc/MailService/saveInbound] No documents found for: ${mailboxQuery}`)
                throw new Error(`[Grpc/MailService/saveInbound] Unable to save email`)
            }

            // Create partial message document
            let attachments: IAttachment[] = []
            attachments = mailData.attachments.map((att: any) => {
                let id: mongoose.Types.ObjectId = mongoose.Types.ObjectId(att.id)
                let attachment: IAttachment = {
                    fileId: id,
                    filename: att.fileName,
                    contentDisposition: att.contentDisposition.value,
                    contentType: att.contentType.value,
                    contentId: att.contentId,
                    transferEncoding: att.contentTransferEncoding,
                    related: att.related,
                    size: att.size
                }
                return attachment
            });

            let hasAttachments = attachments.length != 0

            let messageId: string = mailData.parsedHeaders['message-id'].trim()

            let mimeTree: any
            try {
                // This is to properly parse Buffer data
                // refer: https://stackoverflow.com/questions/34557889/how-to-deserialize-a-nested-buffer-using-json-parse
                mimeTree = JSON.parse(mailData.stringifiedMimeTree, (k, v) => {
                    if (
                        v !== null &&
                        typeof v === 'object' &&
                        'type' in v &&
                        v.type === 'Buffer' &&
                        'data' in v &&
                        Array.isArray(v.data)) {
                        return Buffer.from(v.data)
                    }
                    return v
                })
            } catch (err) {
                fastify.log.error(`[Grpc/MailService/saveInbound] Unable to parse mime tree`, err)
                throw new Error(`[Grpc/MailService/saveInbound] Unable to save email`)
            }
            let imapBodyStr = createIMAPBodyStructure(mimeTree)
            let imapEnv = createIMAPEnvelop(mimeTree.parsedHeader || {})
            let text = mailData.text
            let html = mailData.html

            let newEmail: IMessage = {
                rootId: null,
                exp: mailboxResults![0].retention,
                retentionDate: mailboxResults![0].retentionTime,
                userRemoved: false,
                idate: new Date(Date.now()),
                size: mailData.size,
                parsedHeaders: mailData.parsedHeaders,
                messageId,
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
                text,
                html,
                from: mailData.from,
                to: mailData.to,
                cc: mailData.cc,
                bcc: mailData.bcc,
                rcpt: mailData.rcptTo,
                mailbox: mailboxResults![0]._id,
                user: userId,
                address: addressId,
                uid: 0, // Temp
                modseq: 0, // Temp
                thread: <mongoose.Types.ObjectId>{}, // Temp
                metadata: {}
            }
            // Start save message transaction
            let currentModifyIndex = mailboxResults![0].modifyIndex
            let currentUid = mailboxResults![0].uidNext
            let saveRes: any
            [err, saveRes] = await to(f.tx.messageTx.saveEmail(newEmail, currentUid, currentModifyIndex))
            if (err != null) {
                fastify.log.error(`[Grpc/MailService/saveInbound] Save mail transaction failed`, err)
                throw new Error(`[Grpc/MailService/saveInbound] Unable to save email`)
            }
            fastify.log.info(`[Grpc/MailService/saveInbound] Save mail transaction success (${saveRes}) for address:${addressId}, user:${userId}`)
        }
        ctx.res = {} // Empty
    }
}

function updateSavedMessage(fastify: any) {
    return async function updateSavedMessageHandler(ctx: any) {
        let f: any = fastify
        let messageId: string = ctx.request.req.messageId
        let message: string = ctx.request.req.message
        let stage: string = ctx.request.req.stage
        fastify.log.info(`[Grpc/MailService/updateSavedMessage] Called: ${stage}, ${message} for ${messageId}`)
        let newMetadataEntry: any = {
            stage,
            message,
            at: new Date(Date.now())
        }

        let updateMessageQuery: UpdateQuery = {
            filter: {
                messageId: messageId
            },
            // Add more structure when requirements are more clear
            document: {
                $push: { 'metadata.outboundStatus': newMetadataEntry }
            }
        }

        let err: any
        let updatedCount: any
        // TODO: Add more checks here...
        [err, updatedCount] = await to(f.services.messageService.updateMessages({}, updateMessageQuery))

        if (err != null) {
            fastify.log.error(`[Grpc/MailService/updateSavedMessage] Error updating message status`, err)
            throw new Error('[Grpc/MailService/updateSavedMessage] Error updating message status')
        }

        if (updatedCount == 0) {
            fastify.log.error(`[Grpc/MailService/updateSavedMessage] Error updating message status`, new Error())
            throw new Error('[Grpc/MailService/updateSavedMessage] Error updating message status')
        }

        ctx.res = {} // Empty
    }
}

export const setupGrpcPlugin = fastifyPlugin(setupGrpcServer)