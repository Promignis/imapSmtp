import fastify from "fastify"
import { Server, IncomingMessage, ServerResponse } from "http"
import config from './config'
import logger from './logger'
import swagger from 'fastify-swagger'
import { mongoosePlugin } from './db/connection'
import { servicesPlugin } from './services/servicePlugin'
import { transactionPlugin } from './transactions/transactionPlugin'
import { setupGrpcPlugin } from './proto/grpcPlugin'
import { globalErrorHandler } from './handlers/errorHandlers'
import userRoutes from './routes/userRoutes'
import grpc from 'grpc'


// If using http2 we'd pass <http2.Http2Server, http2.Http2ServerRequest, http2.Http2ServerResponse>
const server: fastify.FastifyInstance<Server, IncomingMessage, ServerResponse> = fastify({
    // Instead of using Fastify default logger use our custom logger internally
    logger: logger,
    pluginTimeout: 60000,
})

const swaggerOption = {
    swagger: {
        info: {
            title: 'Bizgaze Email Server',
            description: 'Email Server API Docs',
            version: '1.0.0'
        },
        host: 'localhost',
        schemes: ['http', 'https'],
        consumes: ['application/json'],
        produces: ['application/json']
    }
}

// Registration order matters
server.register(mongoosePlugin)

// Setup swagger plugin 
server.register(swagger, swaggerOption)

// Setup services
server.register(servicesPlugin)

// Setup Transactions
// Transactions user services so make sure its registered only after servicesPlugin
// TODO: Add 'plugin-meta' export to plugins so that in future to force plugin ordering implicitly
server.register(transactionPlugin)

// This is the global error handler for all the routes
// If needed errorhandlers can be set for indivisual routes too
// But id they are added they will override this handler
server.setErrorHandler(globalErrorHandler)

// Setup grpc
server.register(setupGrpcPlugin)

// Register the routes
server.register(userRoutes, { prefix: '/api/v1/user' })


const startHTTPServer = async () => {
    try {
        let port = <number>config.get("server.port")
        await server.listen(port, "127.0.0.1");
    } catch (e) {
        server.log.error("Could not serve: ", e)
        process.exit(1)
    }
}

export const startGrpcServer = async () => {

    let fastify: any = server
    let grpcApp = fastify.grpcApp

    try {
        let status: any = grpcApp.start('0.0.0.0:50051')
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

export default startHTTPServer
