import fastify from "fastify"
import fs from 'fs'
import path from 'path'
import grpc from 'grpc'
import { Server, IncomingMessage, ServerResponse } from "http"
import config from './config'
import { httpLogger } from './logger'
import swagger from 'fastify-swagger'
import { mongoosePlugin } from './db/connection'
import { servicesPlugin } from './services/servicePlugin'
import { initDbDocsPlugin, InitDb } from './services/initDbDocsPlugin'
import { transactionPlugin } from './transactions/transactionPlugin'
import { setupGrpcPlugin } from './proto/grpcPlugin'
import { setupIMAPPlugin } from './imapFastifyPlugin'
import { globalErrorHandler } from './handlers/errorHandlers'
import userRoutes from './routes/userRoutes'
import mailboxRoutes from './routes/mailboxRoutes'
import messageRoutes from './routes/messageRoutes'
import loginRoutes from './routes/authRoutes'
import fastifyJWT from 'fastify-jwt'
import { isNotEmpty } from './ajvPlugins'
import { fileHandlerPlugin } from './fileHandlerPlugin'
import { promisify } from 'util'

// If using http2 we'd pass <http2.Http2Server, http2.Http2ServerRequest, http2.Http2ServerResponse>
const server: fastify.FastifyInstance<Server, IncomingMessage, ServerResponse> = fastify({
    // Instead of using Fastify default logger use our custom logger internally
    logger: httpLogger,
    pluginTimeout: 60000,
    ajv: {
        plugins: [
            [isNotEmpty]
        ]
    }
})

declare module "fastify" {
    export interface FastifyInstance<
        HttpServer = Server,
        HttpRequest = IncomingMessage,
        HttpResponse = ServerResponse,
        > {
        initDb: InitDb
    }
}

const swaggerOption = {
    swagger: {
        info: {
            title: 'Bizgaze Email Server',
            description: 'Email Server API Docs',
            version: '1.0.0'
        },
        host: 'localhost',
        schemes: ['http', 'https']
    },
    exposeRoute: true
}

// Registration order matters
server.register(mongoosePlugin)

// Setup swagger plugin
server.register(swagger, swaggerOption)

// jwt
async function validateToken(request: fastify.FastifyRequest, decodedToken: { [k: string]: any }) {
    return true
}
server.register(fastifyJWT, {
    secret: process.env.JWT_SECRET || 'secret_secret_secret',
    trusted: validateToken // hook to allow blacklisting of tokens
})

// Setup services
server.register(servicesPlugin)

// Setup Transactions
// Transactions user services so make sure its registered only after servicesPlugin
// TODO: Add 'plugin-meta' export to plugins so that in future to force plugin ordering implicitly
server.register(transactionPlugin)

// Setup initial Db Documents
// cache them in memory - roles, privileges, resources, accesses
server.register(initDbDocsPlugin)

// This is the global error handler for all the routes
// If needed errorhandlers can be set for indivisual routes too
// But id they are added they will override this handler
server.setErrorHandler(globalErrorHandler)

// Setup grpc
server.register(setupGrpcPlugin)

// Setup imap server
server.register(setupIMAPPlugin)

// Setup multipart content handler and file upload handler
server.register(fileHandlerPlugin)

// Register the routes
server.register(userRoutes, { prefix: '/api/v1/user' })
server.register(mailboxRoutes, { prefix: '/api/v1/mailbox' })
server.register(messageRoutes, { prefix: '/api/v1/message' })
server.register(loginRoutes, { prefix: '/api/v1/' }) // login

const startHTTPServer = async () => {
    try {
        let port: number = config.get("server.port")
        await server.listen(port, "0.0.0.0");
        server.swagger()
    } catch (e) {
        server.log.error("Could not serve: ", e)
        process.exit(1)
    }
}

export const startGrpcServer = async () => {

    let fastify: any = server
    let grpcApp = fastify.grpcApp

    try {
        grpc.credentials.createSsl
        let cred = grpc.ServerCredentials.createSsl(
            fs.readFileSync(path.join(process.cwd(), "grpc_root_cert", "bizgaze.root.crt")),
            [
                {
                    private_key: fs.readFileSync(path.join(process.cwd(), "grpc_root_cert", "server.key")),
                    cert_chain: fs.readFileSync(path.join(process.cwd(), "grpc_root_cert", "server.crt")),
                }
            ],
            true,
        )
        let status: any = grpcApp.start('0.0.0.0:50051', cred)
        if (status.started) {
            server.log.info(`Grpc Server listening on 0.0.0.0:50051`)
        } else {
            throw new Error('Bad grpc server status')
        }
    } catch (e) {
        server.log.error("Grpc server Could not serve: ", e)
        process.exit(1)
    }
}

export const startIMAPServer = async () => {

    let fastify: any = server

    let imapServer = fastify.imapServer

    let started = false

    imapServer.on('error', function (err: Error) {
        if (!started) {
            // If the server has not started and an error occures then kill the process
            server.log.error('Error starting imap server', err)
            process.exit(1)
        }
    })

    // TODO: Check if any startup errors are properly handled
    promisify(imapServer.listen)
    try {
        await imapServer.listen(4001, '0.0.0.0')
        server.log.info(`Secure IMAP Server started on 0.0.0.0:4001`)
    } catch (err) {
        server.log.error('Error starting imap server', err)
        process.exit(1)
    }
}

export default startHTTPServer