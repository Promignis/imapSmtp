import mongoose from 'mongoose'
import fastifyPlugin from 'fastify-plugin'
import path from 'path'
// Using Mali instead of directly using node grpc package because it does not support promises
import Mali from 'mali'
import { to } from '../utils'
import { AttachmentInfo, FindQuery, UpdateQuery } from '../types/types'
import { Transform } from 'stream'
import { IMessage, IAttachment } from '../db/messages'

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

        let inputStream: NodeJS.ReadableStream = ctx.request.req

        let transformStream = new Transformer()

        inputStream.on('data', (d: any) => {
            transformStream.write(d.chunk)
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

        ctx.res = {
            id: file._id.toString()
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
            let mailboxResults: any
            [err, mailboxResults] = await to(f.services.mailboxService.findMailboxes({}, mailboxQuery))
            if (err != null) {
                fastify.log.error(`[Grpc/MailService/saveInbound] Unable to get address ${address}`, err)
                throw new Error(`[Grpc/MailService/saveInbound] Unable to save email`)
            }
            if (mailboxResults.length == 0) {
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

            let newEmail: IMessage = {
                rootId: null,
                exp: mailboxResults[0].retention,
                retentionDate: mailboxResults[0].retentionTime,
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
                body: mailData.body,
                from: mailData.from,
                to: mailData.to,
                cc: mailData.cc,
                bcc: mailData.bcc,
                rcpt: mailData.rcptTo,
                mailbox: mailboxResults[0]._id,
                user: userId,
                address: addressId,
                uid: 0, // Temp
                modseq: 0, // Temp
                thread: <mongoose.Types.ObjectId>{}, // Temp
                metadata: {}
            }
            // Start save message transaction
            let currentModifyIndex = mailboxResults[0].modifyIndex
            let currentUid = mailboxResults[0].uidNext
            let saveRes: any
            [err, saveRes] = await to(f.tx.messageTx.saveEmail(newEmail, currentModifyIndex, currentUid))
            if (err != null) {
                fastify.log.error(`[Grpc/MailService/saveInbound] Save mail transaction failed`, err)
                throw new Error(`[Grpc/MailService/saveInbound] Unable to save email`)
            }
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