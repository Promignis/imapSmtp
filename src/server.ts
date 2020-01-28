import fastify from "fastify"
import { Server, IncomingMessage, ServerResponse } from "http"
import config from './config'
import logger from './logger'
import swagger from 'fastify-swagger'


// If using http2 we'd pass <http2.Http2Server, http2.Http2ServerRequest, http2.Http2ServerResponse>
const server: fastify.FastifyInstance<Server, IncomingMessage, ServerResponse> = fastify({
    // Instead of using Fastify default logger use our custom logger internally
    logger: logger
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

server.register(swagger, swaggerOption)


const startHTTPServer = async () => {
    try {
        let port = <number>config.get("server.port")
        await server.listen(port, "0.0.0.0");
    } catch (e) {
        server.log.error("Could not serve: ", e)
        process.exit(1)
    }
}

export default startHTTPServer