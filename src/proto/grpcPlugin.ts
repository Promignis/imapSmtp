import fastifyPlugin from 'fastify-plugin'
import path from 'path'
// Using Mali instead of directly using node grpc package because it does not support promises
import Mali from 'mali'
import { to } from '../utils'

async function setupGrpcServer(fastify: any, { }, done: Function) {
    const protoPath = path.join(process.cwd(), "src/proto/mail.proto")
    const app = new Mali(protoPath, 'MailService', {
        // These are gRPC native options that Mali passes down
        // to the underlying gRPC loader.
        defaults: true
    })
    // Setup handlers
    const checkValidityhandler = checkValidity(fastify)

    // Setup server
    app.use({ checkValidity: checkValidityhandler })

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

export const setupGrpcPlugin = fastifyPlugin(setupGrpcServer)