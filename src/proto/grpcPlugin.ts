import fastifyPlugin from 'fastify-plugin'
import path from 'path'
// Using Mali instead of directly using node grpc package because it does not support promises
import Mali from 'mali'
import { to } from '../utils'
import { AttachmentInfo } from '../types/types'
import { Transform } from 'stream'

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
    // Setup server
    app.use({ checkValidity: checkValidityhandler, uploadAttachment: uploadAttachmentHandler })

    // Decorate fastify instance
    fastify.decorate('grpcApp', app)

    done()
}

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
            // TODO: Log here
            fastify.log.error(`[Grpc/MailService/checkValidity] Error validating address`, err)
            throw err
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

        console.log(file, "--- file")

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

export const setupGrpcPlugin = fastifyPlugin(setupGrpcServer)